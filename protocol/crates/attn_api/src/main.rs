mod advance;
mod kms;
mod security;
mod squads;

use std::collections::HashSet;
use std::convert::TryInto;
use std::env;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration as StdDuration, Instant};

use advance::{
    AdvanceCapSnapshot, AdvanceLimits, Cluster, QuoteRoute, QuoteService, QuoteSide, TradeDirection,
};
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use attn_indexer::{
    connect_pool, mock_store, run_migrations, DynStore, RewardsPoolSummary, SqlxStore,
};
use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{
        header::{
            HeaderName, AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, ETAG, IF_NONE_MATCH, VARY,
        },
        HeaderMap, HeaderValue, Method, Request, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use ed25519_dalek::{PublicKey, Signature};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use once_cell::sync::Lazy;
use regex::Regex;
use security::{
    default_security_config, parse_allowlist_values, parse_api_keys,
    SecurityConfig as ApiSecurityConfig, SecurityState,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};
use sqlx::Error as SqlxError;
use squads::{
    is_valid_pubkey, sanitize_wallet, CreateSafeInput, NewSafeRequest, SafeRequestRecord,
    SquadsConfig, SquadsSafeRepository, SquadsService, StatusSyncUpdate,
};
use tokio::time::Duration as TokioDuration;
use tokio::{net::TcpListener, time::sleep};
use tower_http::{
    cors::{AllowHeaders, AllowOrigin, CorsLayer},
    trace::{DefaultOnFailure, TraceLayer},
};
use tracing::{error, info, info_span, warn, Level};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Clone)]
struct AppState {
    store: DynStore,
    quotes: QuoteService,
    squads: Option<SquadsService>,
    squads_repo: Option<SquadsSafeRepository>,
    security: SecurityState,
    metrics: Option<PrometheusHandle>,
}

#[async_trait]
trait StatusSyncStore: Clone + Send + Sync + 'static {
    async fn fetch_status_jobs(&self, limit: i64) -> Result<Vec<SafeRequestRecord>>;
    async fn mark_ready(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
    ) -> Result<SafeRequestRecord>;
    async fn mark_pending(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
        backoff: Duration,
    ) -> Result<SafeRequestRecord>;
    async fn mark_error(
        &self,
        request_id: Uuid,
        message: &str,
        backoff: Duration,
    ) -> Result<SafeRequestRecord>;
    async fn mark_failure(&self, request_id: Uuid, message: &str) -> Result<SafeRequestRecord>;
    async fn schedule_retry(
        &self,
        request_id: Uuid,
        backoff: Duration,
    ) -> Result<SafeRequestRecord>;
}

#[async_trait]
impl StatusSyncStore for SquadsSafeRepository {
    async fn fetch_status_jobs(&self, limit: i64) -> Result<Vec<SafeRequestRecord>> {
        self.find_due_status_checks(limit).await
    }

    async fn mark_ready(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
    ) -> Result<SafeRequestRecord> {
        self.mark_status_ready(request_id, update).await
    }

    async fn mark_pending(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
        backoff: Duration,
    ) -> Result<SafeRequestRecord> {
        self.mark_status_pending(request_id, update, backoff).await
    }

    async fn mark_error(
        &self,
        request_id: Uuid,
        message: &str,
        backoff: Duration,
    ) -> Result<SafeRequestRecord> {
        self.record_status_error(request_id, message, backoff).await
    }

    async fn mark_failure(&self, request_id: Uuid, message: &str) -> Result<SafeRequestRecord> {
        self.record_status_failure(request_id, message).await
    }

    async fn schedule_retry(
        &self,
        request_id: Uuid,
        backoff: Duration,
    ) -> Result<SafeRequestRecord> {
        self.schedule_status_retry(request_id, backoff).await
    }
}

fn make_weak_etag(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    let digest = hasher.finalize();
    format!("W/\"{}\"", hex::encode(digest))
}

fn etag_for<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_vec(value).expect("serialize value for etag");
    make_weak_etag(&json)
}

fn apply_cache_headers(mut response: Response, etag: &str) -> Response {
    response
        .headers_mut()
        .insert(ETAG, HeaderValue::from_str(etag).unwrap());
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=0, must-revalidate"),
    );
    response
        .headers_mut()
        .insert(VARY, HeaderValue::from_static("Origin"));
    response
}

fn header_matches_if_none(value: &HeaderValue, etag: &str) -> bool {
    match value.to_str() {
        Ok(raw) => raw
            .split(',')
            .map(|segment| segment.trim())
            .any(|tag| tag == "*" || tag == etag),
        Err(_) => false,
    }
}

const IDEMPOTENCY_HEADER: &str = "idempotency-key";
const SIGNATURE_MESSAGE_PREFIX: &str = "attn:squads:create";
const GOVERNANCE_MESSAGE_PREFIX: &str = "attn:squads:govern";
const NOTE_MAX_LEN: usize = 1024;
static EMAIL_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[^@\s]+@[^@\s]+\.[^@\s]+$").unwrap());
const RESUBMIT_BACKOFF_SECS: i64 = 120;
const MIN_MANUAL_RESUBMIT_SECS: i64 = 60;
const SAFE_ALLOWED_STATUSES: &[&str] = &["pending", "submitted", "ready", "failed"];
const UPSTREAM_ERROR_MESSAGE: &str = "Squads service request failed; please retry later.";
const STATUS_SYNC_IDLE_SECS: u64 = 20;
const STATUS_SYNC_BATCH_SIZE: i64 = 25;
const STATUS_SYNC_PENDING_BACKOFF_SECS: i64 = 90;
const STATUS_SYNC_ERROR_BACKOFF_SECS: i64 = 180;

fn format_timestamp(dt: &DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn format_option_timestamp(dt: &Option<DateTime<Utc>>) -> Option<String> {
    dt.as_ref().map(format_timestamp)
}

fn members_from_value(value: &JsonValue) -> Vec<String> {
    value
        .as_array()
        .map(|members| {
            members
                .iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn record_to_response(
    record: &SafeRequestRecord,
    mode: Option<&SquadsService>,
) -> CreateSquadsSafeResponse {
    let threshold = record.threshold.max(0).min(u8::MAX as i16) as u8;
    CreateSquadsSafeResponse {
        request_id: record.id.to_string(),
        status: record.status.clone(),
        safe_address: record.safe_address.clone(),
        transaction_url: record.transaction_url.clone(),
        status_url: record.status_url.clone(),
        cluster: record.cluster.clone(),
        threshold,
        members: members_from_value(&record.members),
        mode: mode
            .map(|service| service.current_mode().as_str().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        raw_response: record.raw_response.clone().unwrap_or(JsonValue::Null),
        idempotency_key: record.idempotency_key.clone(),
        attempt_count: record.attempt_count,
        last_attempt_at: format_timestamp(&record.last_attempt_at),
        next_retry_at: format_option_timestamp(&record.next_retry_at),
        status_last_checked_at: format_option_timestamp(&record.status_last_checked_at),
        status_sync_error: record.status_sync_error.clone(),
        status_last_response_hash: record.status_last_response_hash.clone(),
        creator_vault: record.creator_vault.clone(),
        governance_linked_at: format_option_timestamp(&record.governance_linked_at),
        created_at: format_timestamp(&record.created_at),
        updated_at: format_timestamp(&record.updated_at),
    }
}

fn decode_wallet(wallet: &str, code: &'static str) -> Result<PublicKey, ApiError> {
    let pubkey_bytes = bs58::decode(wallet)
        .into_vec()
        .map_err(|_| ApiError::forbidden(code, "wallet must be base58"))?;
    if pubkey_bytes.len() != 32 {
        return Err(ApiError::forbidden(code, "wallet must decode to 32 bytes"));
    }
    let pubkey_array: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| ApiError::forbidden(code, "wallet malformed"))?;
    PublicKey::from_bytes(&pubkey_array)
        .map_err(|_| ApiError::forbidden(code, "wallet is not an ed25519 key"))
}

fn decode_signature(signature_b58: &str, code: &'static str) -> Result<Signature, ApiError> {
    let signature_bytes = bs58::decode(signature_b58)
        .into_vec()
        .map_err(|_| ApiError::forbidden(code, "signature must be base58"))?;
    if signature_bytes.len() != 64 {
        return Err(ApiError::forbidden(
            code,
            "signature must decode to 64 bytes",
        ));
    }
    let signature_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| ApiError::forbidden(code, "signature malformed"))?;
    Signature::from_bytes(&signature_array)
        .map_err(|_| ApiError::forbidden(code, "signature malformed"))
}

fn verify_wallet_message(
    wallet: &str,
    message: &str,
    signature_b58: &str,
    code: &'static str,
) -> Result<(), ApiError> {
    let public_key = decode_wallet(wallet, code)?;
    let signature = decode_signature(signature_b58, code)?;
    public_key
        .verify_strict(message.as_bytes(), &signature)
        .map_err(|_| ApiError::forbidden(code, "signature verification failed"))
}

fn verify_creator_signature(
    wallet: &str,
    nonce: &str,
    signature_b58: &str,
) -> Result<(), ApiError> {
    let message = format!("{}:{}:{}", SIGNATURE_MESSAGE_PREFIX, nonce, wallet);
    verify_wallet_message(wallet, &message, signature_b58, "invalid_signature")
}

fn governance_message(request_id: &Uuid, creator_vault: &str) -> String {
    format!(
        "{}:{}:{}",
        GOVERNANCE_MESSAGE_PREFIX, request_id, creator_vault
    )
}

fn verify_governance_signature(
    wallet: &str,
    request_id: &Uuid,
    creator_vault: &str,
    signature_b58: &str,
    code: &'static str,
) -> Result<(), ApiError> {
    let message = governance_message(request_id, creator_vault);
    verify_wallet_message(wallet, &message, signature_b58, code)
}

#[derive(Debug, Clone)]
enum DataMode {
    Mock,
    Postgres {
        database_url: String,
        max_connections: u32,
    },
}

#[derive(Debug)]
struct ApiConfig {
    bind_addr: SocketAddr,
    data_mode: DataMode,
    cluster: Cluster,
    advance_limits: AdvanceLimits,
    quote_ttl_secs: u64,
    rfq_lp_wallet: String,
    squads: Option<SquadsConfig>,
    security: ApiSecurityConfig,
}

impl ApiConfig {
    fn from_env() -> Result<Self> {
        let bind_addr_raw = env::var("ATTN_API_BIND_ADDR").unwrap_or_else(|_| {
            let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
            format!("0.0.0.0:{port}")
        });
        let bind_addr = bind_addr_raw
            .parse()
            .with_context(|| format!("invalid bind address: {bind_addr_raw}"))?;
        let mode_raw = env::var("ATTN_API_DATA_MODE")
            .unwrap_or_else(|_| "postgres".to_string())
            .to_lowercase()
            .to_string();
        let data_mode = match mode_raw.as_str() {
            "mock" => DataMode::Mock,
            "postgres" => {
                let database_url = env::var("ATTN_API_DATABASE_URL")
                    .context("ATTN_API_DATABASE_URL required for postgres mode")?;
                let max_connections = env::var("ATTN_API_MAX_CONNECTIONS")
                    .ok()
                    .and_then(|v| v.parse::<u32>().ok())
                    .unwrap_or(8);
                DataMode::Postgres {
                    database_url,
                    max_connections,
                }
            }
            other => return Err(anyhow!("unsupported ATTN_API_DATA_MODE: {other}")),
        };
        let cluster =
            Cluster::new(env::var("ATTN_API_CLUSTER").unwrap_or_else(|_| "devnet".to_string()));
        let per_wallet_limit = env::var("ATTN_API_ADVANCE_MAX_PER_WALLET_USDC")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(5_000.0);
        let per_epoch_limit = env::var("ATTN_API_ADVANCE_MAX_PER_EPOCH_USDC")
            .ok()
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(100_000.0);
        let devnet_allowlist = env::var("ATTN_API_DEVNET_ALLOWLIST")
            .ok()
            .and_then(|raw| parse_allowlist(&raw));
        let advance_limits = AdvanceLimits {
            per_wallet_usdc: per_wallet_limit.max(0.0),
            per_epoch_usdc: per_epoch_limit.max(0.0),
            devnet_allowlist,
        };
        let quote_ttl_secs = env::var("ATTN_API_QUOTE_TTL_SECS")
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(30)
            .max(5);
        let rfq_lp_wallet = env::var("ATTN_API_RFQ_LP_WALLET")
            .unwrap_or_else(|_| "LpWallet11111111111111111111111111111111".to_string());
        let squads = SquadsConfig::from_env()?;
        let mut security = default_security_config();
        let api_keys_raw = env::var("ATTN_API_KEYS").ok();
        let api_keys = parse_api_keys(api_keys_raw).context("parse ATTN_API_KEYS")?;
        if api_keys.is_empty() {
            return Err(anyhow!("ATTN_API_KEYS must provide at least one key"));
        }
        security.api_keys = api_keys;
        security.ip_allowlist = parse_allowlist_values(env::var("ATTN_API_IP_ALLOWLIST").ok());
        security.wallet_allowlist =
            parse_allowlist_values(env::var("ATTN_API_WALLET_ALLOWLIST").ok());
        if let Some(raw_admins) = env::var("ATTN_API_ADMIN_KEYS").ok() {
            security.admin_keys = raw_admins
                .split(',')
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .collect();
        }
        security.csrf_token = env::var("ATTN_API_CSRF_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| security.csrf_token.clone());
        security.per_ip_limit = env::var("ATTN_API_RATE_LIMIT_PER_IP")
            .ok()
            .and_then(|raw| raw.parse::<u32>().ok())
            .unwrap_or(security.per_ip_limit);
        security.per_wallet_limit = env::var("ATTN_API_RATE_LIMIT_PER_WALLET")
            .ok()
            .and_then(|raw| raw.parse::<u32>().ok())
            .unwrap_or(security.per_wallet_limit);
        let window_secs = env::var("ATTN_API_RATE_LIMIT_WINDOW_SECS")
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or_else(|| security.rate_limit_window.as_secs());
        security.rate_limit_window = StdDuration::from_secs(window_secs.max(1));
        let nonce_ttl_secs = env::var("ATTN_API_NONCE_TTL_SECS")
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or_else(|| security.nonce_ttl.as_secs());
        security.nonce_ttl = StdDuration::from_secs(nonce_ttl_secs.clamp(60, 3600));
        Ok(Self {
            bind_addr,
            data_mode,
            cluster,
            advance_limits,
            quote_ttl_secs,
            rfq_lp_wallet,
            squads,
            security,
        })
    }
}

fn parse_allowlist(raw: &str) -> Option<HashSet<String>> {
    let entries: HashSet<String> = raw
        .split(',')
        .map(|segment| segment.trim())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_string())
        .collect();
    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

#[derive(Debug)]
enum ApiError {
    BadRequest { code: &'static str, message: String },
    Forbidden { code: &'static str, message: String },
    NotFound { resource: &'static str, id: String },
    ServiceUnavailable { code: &'static str, message: String },
    Upstream { code: &'static str, message: String },
    Internal(anyhow::Error),
}

impl ApiError {
    fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
        }
    }

    fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::Forbidden {
            code,
            message: message.into(),
        }
    }

    fn not_found(resource: &'static str, id: impl Into<String>) -> Self {
        Self::NotFound {
            resource,
            id: id.into(),
        }
    }

    fn service_unavailable(code: &'static str, message: impl Into<String>) -> Self {
        Self::ServiceUnavailable {
            code,
            message: message.into(),
        }
    }

    fn upstream(code: &'static str, message: impl Into<String>) -> Self {
        Self::Upstream {
            code,
            message: message.into(),
        }
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(value: anyhow::Error) -> Self {
        Self::Internal(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::BadRequest { code, message } => {
                let body = Json(serde_json::json!({
                    "error": "bad_request",
                    "code": code,
                    "message": message,
                }));
                (StatusCode::BAD_REQUEST, body).into_response()
            }
            ApiError::Forbidden { code, message } => {
                let body = Json(serde_json::json!({
                    "error": "forbidden",
                    "code": code,
                    "message": message,
                }));
                (StatusCode::FORBIDDEN, body).into_response()
            }
            ApiError::NotFound { resource, id } => {
                let body = Json(serde_json::json!({
                    "error": "not_found",
                    "resource": resource,
                    "id": id,
                }));
                (StatusCode::NOT_FOUND, body).into_response()
            }
            ApiError::ServiceUnavailable { code, message } => {
                let body = Json(serde_json::json!({
                    "error": "service_unavailable",
                    "code": code,
                    "message": message,
                }));
                (StatusCode::SERVICE_UNAVAILABLE, body).into_response()
            }
            ApiError::Upstream { code, message } => {
                let body = Json(serde_json::json!({
                    "error": "upstream",
                    "code": code,
                    "message": message,
                }));
                (StatusCode::BAD_GATEWAY, body).into_response()
            }
            ApiError::Internal(err) => {
                error!(error = ?err, "internal server error");
                let body = Json(serde_json::json!({
                    "error": "internal",
                    "message": "unexpected server error",
                }));
                (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct RewardsQuery {
    cursor: Option<String>,
    limit: Option<u16>,
}

#[derive(Serialize, Deserialize)]
struct RewardsListResponse {
    pools: Vec<RewardsPoolSummary>,
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QuoteQuery {
    size: f64,
    maturity: i64,
    #[serde(default)]
    side: QuoteSide,
}

#[derive(Debug, Deserialize)]
struct RfqSellRequest {
    quote_id: String,
    wallet: String,
}

#[derive(Debug, Deserialize)]
struct RfqBuybackRequest {
    quote_id: String,
    wallet: String,
}

#[derive(Debug, Serialize)]
struct SettlementInfo {
    lp_wallet: String,
}

#[derive(Debug, Serialize)]
struct RfqTradeResponse {
    quote_id: String,
    route: QuoteRoute,
    side: QuoteSide,
    price_usdc: f64,
    size_yt: f64,
    expires_at: String,
    ttl_seconds: u64,
    settlement: SettlementInfo,
    caps: AdvanceCapSnapshot,
}

#[derive(Debug, Deserialize)]
struct CreateSquadsSafeRequest {
    creator_wallet: String,
    attn_wallet: Option<String>,
    safe_name: Option<String>,
    cluster: Option<String>,
    threshold: Option<u8>,
    contact_email: Option<String>,
    note: Option<String>,
    nonce: String,
    creator_signature: String,
}

#[derive(Debug, Serialize)]
struct CreateSquadsSafeResponse {
    request_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    safe_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transaction_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_url: Option<String>,
    cluster: String,
    threshold: u8,
    members: Vec<String>,
    mode: String,
    raw_response: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    idempotency_key: Option<String>,
    attempt_count: i32,
    last_attempt_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_retry_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_last_checked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_sync_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_last_response_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    creator_vault: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    governance_linked_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct IssueNonceRequest {
    creator_wallet: String,
}

#[derive(Debug, Serialize)]
struct IssueNonceResponse {
    nonce: String,
    expires_at: String,
    ttl_seconds: u64,
}

#[derive(Debug, Deserialize)]
struct ListSafesQuery {
    status: Option<String>,
    creator_wallet: Option<String>,
    attn_wallet: Option<String>,
    cluster: Option<String>,
    before: Option<String>,
    limit: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct ResubmitSafeRequest {
    #[serde(default)]
    force: bool,
}

#[derive(Debug, Deserialize)]
struct OverrideSafeStatusRequest {
    status: String,
    #[serde(default)]
    safe_address: Option<String>,
    #[serde(default)]
    transaction_url: Option<String>,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LinkGovernanceRequest {
    creator_vault: String,
    creator_signature: String,
    attn_signature: String,
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/metrics", get(metrics_endpoint))
        .route("/readyz", get(readyz))
        .route("/version", get(version))
        .route("/health", get(health))
        .route("/v1/overview", get(get_overview))
        .route("/v1/markets", get(list_markets))
        .route("/v1/markets/:market", get(get_market))
        .route("/v1/markets/:market/yt-quote", get(get_market_yt_quote))
        .route("/v1/portfolio/:wallet", get(get_portfolio))
        .route("/v1/attnusd", get(get_attnusd))
        .route("/v1/rewards", get(list_rewards))
        .route("/v1/rewards/:pool", get(get_rewards_pool))
        .route("/v1/governance", get(get_governance))
        .route("/v1/rfq/yt-sell", post(post_rfq_sell))
        .route("/v1/rfq/yt-buyback", post(post_rfq_buyback))
        .route(
            "/v1/squads/safes",
            get(list_squads_safes).post(create_squads_safe),
        )
        .route("/v1/squads/safes/nonce", post(issue_squads_nonce))
        .route("/v1/squads/safes/:id", get(get_squads_safe))
        .route("/v1/squads/safes/:id/resubmit", post(resubmit_squads_safe))
        .route(
            "/v1/squads/safes/:id/status",
            post(override_squads_safe_status),
        )
        .route(
            "/v1/squads/safes/:id/governance",
            post(link_squads_safe_governance),
        )
        .with_state(state)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    let request_id = Uuid::new_v4();
                    info_span!(
                        "http_request",
                        %request_id,
                        method = %request.method(),
                        uri = %request.uri()
                    )
                })
                .on_failure(DefaultOnFailure::new().level(Level::ERROR)),
        )
        .layer(cors_layer())
}

fn cors_layer() -> CorsLayer {
    let live_origin =
        env::var("ATTN_API_LIVE_ORIGIN").unwrap_or_else(|_| "https://attn.markets".to_string());
    let allow_origin = AllowOrigin::predicate(move |origin, _| {
        if let Ok(origin_str) = origin.to_str() {
            if origin_str == live_origin
                || origin_str.starts_with("http://localhost")
                || origin_str.starts_with("http://127.0.0.1")
            {
                return true;
            }
        }
        false
    });

    CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([Method::GET, Method::HEAD, Method::POST, Method::OPTIONS])
        .allow_headers(AllowHeaders::list([
            AUTHORIZATION,
            CONTENT_TYPE,
            IF_NONE_MATCH,
            HeaderName::from_static("x-api-key"),
            HeaderName::from_static("x-attn-client"),
            HeaderName::from_static("idempotency-key"),
        ]))
        .max_age(StdDuration::from_secs(3600))
}

fn spawn_status_sync(service: SquadsService, repo: SquadsSafeRepository) {
    tokio::spawn(async move {
        if let Err(err) = status_sync_loop(service, repo).await {
            error!(error = ?err, "status sync worker exited");
        }
    });
}

async fn status_sync_loop<S>(service: SquadsService, repo: S) -> Result<()>
where
    S: StatusSyncStore,
{
    loop {
        match status_sync_iteration(&service, &repo).await {
            Ok(true) => {}
            Ok(false) => sleep(TokioDuration::from_secs(STATUS_SYNC_IDLE_SECS)).await,
            Err(err) => {
                error!(error = ?err, "status sync iteration failed");
                sleep(TokioDuration::from_secs(
                    STATUS_SYNC_ERROR_BACKOFF_SECS as u64,
                ))
                .await;
            }
        }
    }
    #[allow(unreachable_code)]
    Ok(())
}

async fn status_sync_iteration<S>(service: &SquadsService, repo: &S) -> Result<bool>
where
    S: StatusSyncStore,
{
    let jobs = repo.fetch_status_jobs(STATUS_SYNC_BATCH_SIZE).await?;
    if jobs.is_empty() {
        return Ok(false);
    }
    for job in jobs {
        if let Err(err) = process_status_job(service, repo, job).await {
            warn!(error = ?err, "status sync job failed");
        }
    }
    Ok(true)
}

async fn process_status_job<S>(
    service: &SquadsService,
    repo: &S,
    job: SafeRequestRecord,
) -> Result<()>
where
    S: StatusSyncStore,
{
    let Some(status_url) = job.status_url.clone() else {
        repo.mark_error(
            job.id,
            "status url missing",
            Duration::seconds(STATUS_SYNC_ERROR_BACKOFF_SECS),
        )
        .await?;
        metrics::counter!(
            "squads_status_sync_total",
            "result" => "error",
            "cluster" => job.cluster.clone(),
            "reason" => "missing_url"
        )
        .increment(1);
        return Ok(());
    };
    let start = Instant::now();
    let status_result = match service.fetch_status(&status_url).await {
        Ok(result) => result,
        Err(err) => {
            repo.mark_error(
                job.id,
                &err.to_string(),
                Duration::seconds(STATUS_SYNC_ERROR_BACKOFF_SECS),
            )
            .await?;
            metrics::counter!(
                "squads_status_sync_total",
                "result" => "error",
                "cluster" => job.cluster.clone(),
                "reason" => "fetch"
            )
            .increment(1);
            return Ok(());
        }
    };
    let mut update = StatusSyncUpdate::from_status(&status_result);
    if update
        .safe_address
        .as_ref()
        .map(|s| s.is_empty())
        .unwrap_or(true)
    {
        update.safe_address = job.safe_address.clone();
    }
    if update.transaction_url.is_none() {
        update.transaction_url = job.transaction_url.clone();
    }
    let status_value = status_result.status.unwrap_or_default();
    let ready = status_value == "ready"
        || status_value == "completed"
        || status_value == "success"
        || update
            .safe_address
            .as_ref()
            .map(|addr| !addr.is_empty())
            .unwrap_or(false);
    if ready {
        repo.mark_ready(job.id, &update).await?;
        metrics::counter!(
            "squads_status_sync_total",
            "result" => "ready",
            "cluster" => job.cluster.clone()
        )
        .increment(1);
        metrics::histogram!(
            "squads_status_sync_latency_seconds",
            "cluster" => job.cluster.clone(),
            "result" => "ready"
        )
        .record(start.elapsed().as_secs_f64());
        if let Some(address) = update.safe_address.as_ref() {
            match service.verify_safe_account(&job.cluster, address).await {
                Ok(Some(false)) => warn!(
                    request_id = %job.id,
                    safe = %address,
                    "safe not yet visible on rpc after ready"
                ),
                Err(err) => warn!(
                    request_id = %job.id,
                    safe = %address,
                    error = %err,
                    "rpc verification for ready safe failed"
                ),
                _ => {}
            }
        }
        info!(
            request_id = %job.id,
            status = status_value,
            safe = ?update.safe_address,
            "squads status promoted to ready"
        );
        return Ok(());
    }

    if status_value == "failed" || status_value == "error" {
        let failure_message = format!("upstream reported {}", status_value);
        repo.mark_failure(job.id, &failure_message).await?;
        repo.schedule_retry(job.id, Duration::seconds(STATUS_SYNC_ERROR_BACKOFF_SECS))
            .await?;
        metrics::counter!(
            "squads_status_sync_total",
            "result" => "failed",
            "cluster" => job.cluster.clone()
        )
        .increment(1);
        metrics::histogram!(
            "squads_status_sync_latency_seconds",
            "cluster" => job.cluster.clone(),
            "result" => "failed"
        )
        .record(start.elapsed().as_secs_f64());
        warn!(request_id = %job.id, status = status_value, "squads status marked failed");
        return Ok(());
    }

    repo.mark_pending(
        job.id,
        &update,
        Duration::seconds(STATUS_SYNC_PENDING_BACKOFF_SECS),
    )
    .await?;
    metrics::counter!(
        "squads_status_sync_total",
        "result" => "pending",
        "cluster" => job.cluster.clone()
    )
    .increment(1);
    metrics::histogram!(
        "squads_status_sync_latency_seconds",
        "cluster" => job.cluster.clone(),
        "result" => "pending"
    )
    .record(start.elapsed().as_secs_f64());
    info!(
        request_id = %job.id,
        status = status_value,
        "squads status still pending"
    );
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let config = ApiConfig::from_env()?;
    let ApiConfig {
        bind_addr,
        data_mode,
        cluster,
        advance_limits,
        quote_ttl_secs,
        rfq_lp_wallet,
        squads,
        security,
    } = config;
    let (store, squads_repo): (DynStore, Option<SquadsSafeRepository>) = match data_mode {
        DataMode::Mock => {
            warn!("ATTN_API_DATA_MODE=mock; serving static dataset");
            (mock_store(), None)
        }
        DataMode::Postgres {
            database_url,
            max_connections,
        } => {
            let pool = connect_pool(&database_url, max_connections).await?;
            if let Err(err) = run_migrations(&pool).await {
                warn!(error = ?err, "failed to run migrations");
            }
            let repo = SquadsSafeRepository::new(pool.clone());
            (Arc::new(SqlxStore::new(pool)), Some(repo))
        }
    };
    let ttl_secs = quote_ttl_secs.min(i64::MAX as u64) as i64;
    let quote_ttl = Duration::seconds(ttl_secs);
    let quote_service = QuoteService::new(
        cluster.clone(),
        advance_limits.clone(),
        quote_ttl,
        rfq_lp_wallet.clone(),
    );
    let squads_service = squads
        .map(SquadsService::new)
        .transpose()
        .context("construct squads service")?;
    let security_state = SecurityState::new(security);
    let metrics_handle = match PrometheusBuilder::new().install_recorder() {
        Ok(handle) => Some(handle),
        Err(err) => {
            warn!(error = ?err, "failed to install prometheus exporter");
            None
        }
    };
    let state = AppState {
        store,
        quotes: quote_service,
        squads: squads_service,
        squads_repo,
        security: security_state,
        metrics: metrics_handle.clone(),
    };
    if let Some(service) = state.squads.as_ref() {
        info!(
            config_digest = %service.config_digest(),
            attn_wallet = service.default_attn_wallet(),
            payer = ?service.payer_wallet(),
            status_sync = service.status_sync_enabled(),
            attn_kms = service.attn_kms_configured(),
            payer_kms = service.payer_kms_configured(),
            "squads service configured"
        );
    }
    if let (Some(service), Some(repo)) = (state.squads.clone(), state.squads_repo.clone()) {
        if service.status_sync_enabled() {
            spawn_status_sync(service, repo);
        } else {
            info!("squads status sync worker disabled by configuration");
        }
    }
    let app = build_router(state.clone());
    let listener = TcpListener::bind(bind_addr).await?;
    info!(
        "attn_api listening on {} (cluster: {}, ttl: {}s)",
        listener.local_addr()?,
        cluster.as_str(),
        quote_ttl_secs
    );
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;
    Ok(())
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn readyz(State(state): State<AppState>) -> Result<Json<HealthResponse>, ApiError> {
    state.store.health_check().await?;
    Ok(Json(HealthResponse { status: "ok" }))
}

#[derive(Serialize)]
struct VersionResponse {
    version: &'static str,
    git_sha: &'static str,
    built_at_unix: u64,
}

fn version_info() -> VersionResponse {
    VersionResponse {
        version: env!("CARGO_PKG_VERSION"),
        git_sha: option_env!("ATTN_BUILD_GIT_SHA").unwrap_or("unknown"),
        built_at_unix: option_env!("ATTN_BUILD_UNIX_TS")
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(0),
    }
}

async fn version() -> Response {
    let payload = version_info();
    let etag = etag_for(&payload);
    let response = Json(payload).into_response();
    apply_cache_headers(response, &etag)
}

async fn get_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let overview = state.store.overview().await?;
    let etag = etag_for(&overview);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(overview).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn list_markets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let markets = state.store.markets().await?;
    let etag = etag_for(&markets);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(markets).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn get_market(
    Path(market): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let detail = state
        .store
        .market(&market)
        .await?
        .ok_or_else(|| ApiError::not_found("market", market.clone()))?;
    let etag = etag_for(&detail);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(detail).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn get_market_yt_quote(
    Path(market): Path<String>,
    State(state): State<AppState>,
    Query(query): Query<QuoteQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let detail = state
        .store
        .market(&market)
        .await?
        .ok_or_else(|| ApiError::not_found("market", market.clone()))?;

    if query.maturity != detail.summary.maturity_ts {
        return Err(ApiError::bad_request(
            "maturity_mismatch",
            "requested maturity does not match market definition",
        ));
    }

    let quote = state
        .quotes
        .get_or_create_quote(
            &market,
            query.size,
            query.side,
            detail.summary.maturity_ts,
            detail.summary.implied_apy,
        )
        .await?;

    let etag = make_weak_etag(quote.id.as_bytes());
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }

    let payload = quote.response();
    let response = Json(payload).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn get_portfolio(
    Path(wallet): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let portfolio = state
        .store
        .portfolio(&wallet)
        .await?
        .ok_or_else(|| ApiError::not_found("portfolio", wallet.clone()))?;
    let etag = etag_for(&portfolio);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(portfolio).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn get_attnusd(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let stats = state.store.attnusd().await?;
    let etag = etag_for(&stats);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(stats).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn list_rewards(
    State(state): State<AppState>,
    Query(query): Query<RewardsQuery>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let limit = query.limit.unwrap_or(20);
    let page = state.store.rewards(query.cursor.clone(), limit).await?;
    let etag_key = format!(
        "{}:{}:{}",
        limit,
        page.updated_at.map(|ts| ts.timestamp()).unwrap_or_default(),
        page.next_cursor.as_deref().unwrap_or("")
    );
    let etag = make_weak_etag(etag_key.as_bytes());
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }

    let body = RewardsListResponse {
        pools: page.items,
        next_cursor: page.next_cursor,
    };
    let response = Json(body).into_response();
    let response = apply_cache_headers(response, &etag);
    Ok(response)
}

async fn get_rewards_pool(
    Path(pool): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let detail = state
        .store
        .rewards_pool(&pool)
        .await?
        .ok_or_else(|| ApiError::not_found("rewards_pool", pool.clone()))?;
    let etag_key = detail.summary.updated_at.timestamp().to_string();
    let etag = make_weak_etag(etag_key.as_bytes());
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(detail).into_response();
    let response = apply_cache_headers(response, &etag);
    Ok(response)
}

async fn get_governance(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let governance = state.store.governance().await?;
    let etag = etag_for(&governance);
    if let Some(value) = headers.get(IF_NONE_MATCH) {
        if header_matches_if_none(value, &etag) {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
    }
    let response = Json(governance).into_response();
    Ok(apply_cache_headers(response, &etag))
}

async fn post_rfq_sell(
    State(state): State<AppState>,
    Json(payload): Json<RfqSellRequest>,
) -> Result<Response, ApiError> {
    let (quote, caps) = state
        .quotes
        .finalize_execution(&payload.quote_id, &payload.wallet, TradeDirection::Advance)
        .await?;
    let quote_payload = quote.response();
    let response = RfqTradeResponse {
        quote_id: quote_payload.quote_id,
        route: quote_payload.route,
        side: quote_payload.side,
        price_usdc: quote_payload.price_usdc,
        size_yt: quote_payload.size_yt,
        expires_at: quote_payload.expires_at,
        ttl_seconds: state.quotes.ttl_secs(),
        settlement: SettlementInfo {
            lp_wallet: state.quotes.lp_wallet().to_string(),
        },
        caps,
    };
    let mut response = Json(response).into_response();
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=0, must-revalidate"),
    );
    response
        .headers_mut()
        .insert(VARY, HeaderValue::from_static("Origin"));
    Ok(response)
}

async fn post_rfq_buyback(
    State(state): State<AppState>,
    Json(payload): Json<RfqBuybackRequest>,
) -> Result<Response, ApiError> {
    let (quote, caps) = state
        .quotes
        .finalize_execution(&payload.quote_id, &payload.wallet, TradeDirection::Buyback)
        .await?;
    let quote_payload = quote.response();
    let response = RfqTradeResponse {
        quote_id: quote_payload.quote_id,
        route: quote_payload.route,
        side: quote_payload.side,
        price_usdc: quote_payload.price_usdc,
        size_yt: quote_payload.size_yt,
        expires_at: quote_payload.expires_at,
        ttl_seconds: state.quotes.ttl_secs(),
        settlement: SettlementInfo {
            lp_wallet: state.quotes.lp_wallet().to_string(),
        },
        caps,
    };
    let mut response = Json(response).into_response();
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=0, must-revalidate"),
    );
    response
        .headers_mut()
        .insert(VARY, HeaderValue::from_static("Origin"));
    Ok(response)
}

async fn create_squads_safe(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CreateSquadsSafeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(service) = state.squads.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_disabled",
            "Squads integration is not configured",
        ));
    };
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe creation",
        ));
    };

    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    let auth = state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;

    let idempotency_key = headers
        .get(IDEMPOTENCY_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let CreateSquadsSafeRequest {
        creator_wallet: raw_creator_wallet,
        attn_wallet,
        safe_name,
        cluster,
        threshold,
        contact_email,
        note,
        nonce,
        creator_signature,
    } = payload;

    let creator_wallet = sanitize_wallet(&raw_creator_wallet);
    if creator_wallet.is_empty() {
        return Err(ApiError::bad_request(
            "creator_wallet_required",
            "creator_wallet is required",
        ));
    }
    if !is_valid_pubkey(&creator_wallet) {
        return Err(ApiError::bad_request(
            "creator_wallet_invalid",
            "creator_wallet must be a valid Solana address",
        ));
    }

    state
        .security
        .enforce_wallet_allowlist(&creator_wallet)
        .map_err(|err| ApiError::forbidden("wallet_not_allowed", err.to_string()))?;
    state
        .security
        .check_rate_limits(&creator_wallet, remote_ip)
        .map_err(|err| ApiError::forbidden("rate_limited", err.to_string()))?;

    let nonce = nonce.trim().to_string();
    if nonce.is_empty() {
        return Err(ApiError::bad_request("nonce_required", "nonce is required"));
    }
    let creator_signature = creator_signature.trim().to_string();
    if creator_signature.is_empty() {
        return Err(ApiError::bad_request(
            "creator_signature_required",
            "creator_signature is required",
        ));
    }

    let attn_wallet = attn_wallet
        .as_ref()
        .map(|value| sanitize_wallet(value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| service.default_attn_wallet().to_string());
    if !is_valid_pubkey(&attn_wallet) {
        return Err(ApiError::bad_request(
            "attn_wallet_invalid",
            "attn_wallet must be a valid Solana address",
        ));
    }

    let cluster = cluster
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| service.default_cluster().to_string());

    let mut threshold = threshold.unwrap_or(service.default_threshold());
    if threshold == 0 {
        threshold = service.default_threshold();
    }
    if threshold > 10 {
        return Err(ApiError::bad_request(
            "threshold_invalid",
            "threshold must be between 1 and 10",
        ));
    }

    let safe_name = safe_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    let contact_email = contact_email
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    if let Some(email) = &contact_email {
        if !EMAIL_REGEX.is_match(email) {
            return Err(ApiError::bad_request(
                "contact_email_invalid",
                "contact_email must be a valid address",
            ));
        }
    }

    let note = note
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(NOTE_MAX_LEN).collect::<String>());

    if let Some(key) = idempotency_key.as_ref() {
        if let Some(existing) = repo
            .find_by_idempotency(key)
            .await
            .map_err(ApiError::from)?
        {
            let response = record_to_response(&existing, Some(service));
            return Ok((StatusCode::OK, Json(response)));
        }
    }

    let consumed_nonce = repo
        .consume_nonce(&creator_wallet, &nonce)
        .await
        .map_err(ApiError::from)?;
    if consumed_nonce.is_none() {
        return Err(ApiError::forbidden(
            "nonce_invalid",
            "nonce is expired or has already been used",
        ));
    }
    verify_creator_signature(&creator_wallet, &nonce, &creator_signature)?;

    let members = vec![creator_wallet.clone(), attn_wallet.clone()];
    if let Some(outcome) = service
        .check_wallets_on_chain(&cluster, &members)
        .await
        .map_err(|err| ApiError::service_unavailable("rpc_sanity_failed", err.to_string()))?
    {
        if !outcome.missing_accounts.is_empty() {
            if outcome.strict {
                return Err(ApiError::bad_request(
                    "wallet_account_missing",
                    format!(
                        "Wallets {} not found on {}",
                        outcome.missing_accounts.join(", "),
                        outcome.cluster
                    ),
                ));
            }
            warn!(
                missing = %outcome.missing_accounts.join(", "),
                cluster = %outcome.cluster,
                "wallets missing on rpc; continuing in lenient mode"
            );
        }
    }
    let request_timer = Instant::now();
    metrics::counter!(
        "squads_safe_requests_total",
        "event" => "attempt",
        "cluster" => cluster.clone()
    )
    .increment(1);
    let request_payload = json!({
        "creator_wallet": creator_wallet.clone(),
        "attn_wallet": attn_wallet.clone(),
        "safe_name": safe_name.clone(),
        "cluster": cluster.clone(),
        "threshold": threshold,
        "contact_email": contact_email.clone(),
        "note": note.clone(),
    });

    let new_request = NewSafeRequest {
        request_id: Uuid::new_v4(),
        idempotency_key: idempotency_key.clone(),
        creator_wallet: creator_wallet.clone(),
        attn_wallet: attn_wallet.clone(),
        cluster: cluster.clone(),
        threshold,
        safe_name: safe_name.clone(),
        contact_email: contact_email.clone(),
        note: note.clone(),
        members: members.clone(),
        request_payload: request_payload.clone(),
        requester_api_key: Some(auth.api_key_id.clone()),
        requester_wallet: creator_wallet.clone(),
        requester_ip: remote_ip,
        creator_signature: creator_signature.clone(),
        nonce: nonce.clone(),
    };

    let backoff = Duration::seconds(RESUBMIT_BACKOFF_SECS);
    let pending = repo
        .create_pending(new_request, backoff)
        .await
        .map_err(|err| match err.downcast::<SqlxError>() {
            Ok(SqlxError::Database(db_err)) => match db_err.constraint() {
                Some("squads_safe_requests_uniqueness_idx") => ApiError::bad_request(
                    "duplicate_request",
                    "A request for this creator already exists on the selected cluster",
                ),
                Some("squads_safe_requests_idempotency_idx") => ApiError::bad_request(
                    "duplicate_idempotency_key",
                    "This idempotency key has already been used",
                ),
                _ => ApiError::from(anyhow::Error::from(SqlxError::Database(db_err))),
            },
            Ok(other) => ApiError::from(anyhow::Error::from(other)),
            Err(err) => ApiError::from(err),
        })?;

    info!(
        request_id = %pending.id,
        creator = %pending.creator_wallet,
        cluster = %pending.cluster,
        "squads safe request persisted"
    );

    let input = CreateSafeInput {
        creator_wallet: pending.creator_wallet.clone(),
        attn_wallet: pending.attn_wallet.clone(),
        safe_name: pending.safe_name.clone(),
        cluster: pending.cluster.clone(),
        threshold,
        contact_email: pending.contact_email.clone(),
        note: pending.note.clone(),
    };

    let created = match service.create_safe(input).await {
        Ok(result) => result,
        Err(err) => {
            metrics::counter!(
                "squads_safe_requests_total",
                "event" => "failure",
                "cluster" => cluster.clone()
            )
            .increment(1);
            metrics::histogram!(
                "squads_safe_request_latency_seconds",
                "cluster" => cluster.clone(),
                "outcome" => "error"
            )
            .record(request_timer.elapsed().as_secs_f64());
            error!(
                request_id = %pending.id,
                error = %err,
                "squads safe creation failed"
            );
            let _ = repo
                .mark_failure(
                    pending.id,
                    "squads_create_failed",
                    &err.to_string(),
                    backoff,
                )
                .await;
            return Err(ApiError::upstream(
                "squads_create_failed",
                UPSTREAM_ERROR_MESSAGE,
            ));
        }
    };

    let stored = repo
        .update_submission(pending.id, &created, backoff)
        .await
        .map_err(ApiError::from)?;
    if let Some(address) = stored.safe_address.as_ref() {
        match service.verify_safe_account(&stored.cluster, address).await {
            Ok(Some(false)) => warn!(
                request_id = %stored.id,
                safe = %address,
                "safe account not yet present on rpc"
            ),
            Err(err) => warn!(
                request_id = %stored.id,
                safe = %address,
                error = %err,
                "failed to verify safe account"
            ),
            _ => {}
        }
    }
    let status_label = stored.status.clone();
    if status_label == "ready" {
        metrics::counter!(
            "squads_safe_requests_total",
            "event" => "success",
            "cluster" => cluster.clone()
        )
        .increment(1);
    } else {
        metrics::counter!(
            "squads_safe_requests_total",
            "event" => "submitted",
            "cluster" => cluster.clone()
        )
        .increment(1);
    }
    metrics::histogram!(
        "squads_safe_request_latency_seconds",
        "cluster" => cluster.clone(),
        "outcome" => status_label.clone()
    )
    .record(request_timer.elapsed().as_secs_f64());
    info!(
        request_id = %stored.id,
        status = %stored.status,
        safe = ?stored.safe_address,
        "squads safe request updated"
    );
    let response = record_to_response(&stored, Some(service));
    Ok((StatusCode::CREATED, Json(response)))
}

async fn issue_squads_nonce(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<IssueNonceRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe creation",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;

    let wallet = sanitize_wallet(&payload.creator_wallet);
    if wallet.is_empty() {
        return Err(ApiError::bad_request(
            "creator_wallet_required",
            "creator_wallet is required",
        ));
    }
    if !is_valid_pubkey(&wallet) {
        return Err(ApiError::bad_request(
            "creator_wallet_invalid",
            "creator_wallet must be a valid Solana address",
        ));
    }

    state
        .security
        .enforce_wallet_allowlist(&wallet)
        .map_err(|err| ApiError::forbidden("wallet_not_allowed", err.to_string()))?;
    state
        .security
        .check_rate_limits(&wallet, remote_ip)
        .map_err(|err| ApiError::forbidden("rate_limited", err.to_string()))?;

    let ttl =
        Duration::from_std(state.security.nonce_ttl()).unwrap_or_else(|_| Duration::seconds(300));
    let nonce = repo
        .issue_nonce(&wallet, ttl)
        .await
        .map_err(ApiError::from)?;
    metrics::counter!(
        "squads_safe_nonce_requests_total",
        "result" => "issued"
    )
    .increment(1);
    info!(wallet = %wallet, "issued squads nonce");
    let response = IssueNonceResponse {
        nonce: nonce.nonce,
        expires_at: format_timestamp(&nonce.expires_at),
        ttl_seconds: state.security.nonce_ttl().as_secs(),
    };
    Ok((StatusCode::CREATED, Json(response)))
}

async fn get_squads_safe(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe queries",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;

    let request_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_request_id", "id must be a valid UUID"))?;
    let record = repo
        .find_by_id(request_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("squads_safe", id.clone()))?;
    let response = record_to_response(&record, state.squads.as_ref());
    Ok(Json(response))
}

async fn list_squads_safes(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<ListSafesQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe queries",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    let auth = state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;
    if !auth.is_admin {
        return Err(ApiError::forbidden(
            "admin_required",
            "Admin API key required",
        ));
    }
    let limit = query.limit.unwrap_or(25).clamp(1, 200) as i64;
    let before = if let Some(cursor) = &query.before {
        Some(
            DateTime::parse_from_rfc3339(cursor)
                .map_err(|_| ApiError::bad_request("invalid_cursor", "before must be RFC3339"))?
                .with_timezone(&Utc),
        )
    } else {
        None
    };
    let filter = squads::SafeRequestFilter {
        status: query.status.clone(),
        creator_wallet: query.creator_wallet.clone(),
        attn_wallet: query.attn_wallet.clone(),
        cluster: query.cluster.clone(),
        before,
        limit,
    };
    let records = repo.list_requests(filter).await.map_err(ApiError::from)?;
    let payload: Vec<_> = records
        .iter()
        .map(|record| record_to_response(record, state.squads.as_ref()))
        .collect();
    Ok(Json(payload))
}

async fn resubmit_squads_safe(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<ResubmitSafeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(service) = state.squads.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_disabled",
            "Squads integration is not configured",
        ));
    };
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe queries",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    let auth = state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;
    if !auth.is_admin {
        return Err(ApiError::forbidden(
            "admin_required",
            "Admin API key required",
        ));
    }
    let request_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_request_id", "id must be a valid UUID"))?;
    let record = repo
        .find_by_id(request_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("squads_safe", id.clone()))?;
    if record.status != "failed" && record.status != "submitted" {
        return Err(ApiError::bad_request(
            "invalid_status",
            "Only failed or submitted safes may be retried",
        ));
    }
    if let Some(next_retry) = record.next_retry_at.as_ref() {
        if !request.force && *next_retry > Utc::now() {
            return Err(ApiError::forbidden(
                "resubmit_backoff",
                format!(
                    "Next retry available after {}",
                    format_timestamp(next_retry)
                ),
            ));
        }
    }
    let backoff = Duration::seconds(RESUBMIT_BACKOFF_SECS.max(MIN_MANUAL_RESUBMIT_SECS));
    let pending = repo
        .prepare_for_resubmit(record.id, backoff)
        .await
        .map_err(ApiError::from)?;
    info!(request_id = %pending.id, "resubmitting squads safe request");
    let input = CreateSafeInput::from_record(&pending);
    let created = match service.create_safe(input).await {
        Ok(result) => result,
        Err(err) => {
            let _ = repo
                .mark_failure(
                    pending.id,
                    "squads_create_failed",
                    &err.to_string(),
                    backoff,
                )
                .await;
            error!(request_id = %pending.id, error = %err, "squads safe resubmit failed");
            return Err(ApiError::upstream(
                "squads_create_failed",
                UPSTREAM_ERROR_MESSAGE,
            ));
        }
    };
    let stored = repo
        .update_submission(pending.id, &created, backoff)
        .await
        .map_err(ApiError::from)?;
    if let Some(address) = stored.safe_address.as_ref() {
        match service.verify_safe_account(&stored.cluster, address).await {
            Ok(Some(false)) => warn!(
                request_id = %stored.id,
                safe = %address,
                "safe account not yet present on rpc"
            ),
            Err(err) => warn!(
                request_id = %stored.id,
                safe = %address,
                error = %err,
                "failed to verify safe account"
            ),
            _ => {}
        }
    }
    let response = record_to_response(&stored, Some(service));
    Ok(Json(response))
}

async fn override_squads_safe_status(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<OverrideSafeStatusRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe queries",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    let auth = state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;
    if !auth.is_admin {
        return Err(ApiError::forbidden(
            "admin_required",
            "Admin API key required",
        ));
    }
    if !SAFE_ALLOWED_STATUSES.contains(&payload.status.as_str()) {
        return Err(ApiError::bad_request(
            "invalid_status",
            "status must be pending, submitted, ready, or failed",
        ));
    }
    if payload.status == "ready"
        && payload
            .safe_address
            .as_ref()
            .map(|s| s.is_empty())
            .unwrap_or(true)
    {
        return Err(ApiError::bad_request(
            "safe_address_required",
            "safe_address required when overriding to ready",
        ));
    }
    let request_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_request_id", "id must be a valid UUID"))?;
    let stored = repo
        .override_status(
            request_id,
            &payload.status,
            payload.safe_address.clone(),
            payload.transaction_url.clone(),
            payload.note.clone(),
        )
        .await
        .map_err(ApiError::from)?;
    let response = record_to_response(&stored, state.squads.as_ref());
    Ok(Json(response))
}

async fn link_squads_safe_governance(
    State(state): State<AppState>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<LinkGovernanceRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let Some(repo) = state.squads_repo.as_ref() else {
        return Err(ApiError::service_unavailable(
            "squads_storage_unavailable",
            "Persistence is required for Squads safe queries",
        ));
    };
    let remote_ip: Option<IpAddr> = Some(remote_addr.ip());
    state
        .security
        .authenticate(&headers, remote_ip)
        .map_err(|err| ApiError::forbidden("auth_failed", err.to_string()))?;
    if payload.creator_vault.trim().is_empty() {
        return Err(ApiError::bad_request(
            "creator_vault_required",
            "creator_vault is required",
        ));
    }
    if !is_valid_pubkey(&payload.creator_vault) {
        return Err(ApiError::bad_request(
            "creator_vault_invalid",
            "creator_vault must be a valid Solana address",
        ));
    }
    let request_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_request_id", "id must be a valid UUID"))?;
    let record = repo
        .find_by_id(request_id)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::not_found("squads_safe", id.clone()))?;
    if record
        .safe_address
        .as_ref()
        .map(|s| s.is_empty())
        .unwrap_or(true)
    {
        return Err(ApiError::bad_request(
            "safe_not_ready",
            "Safe must be ready before linking governance",
        ));
    }
    verify_governance_signature(
        &record.creator_wallet,
        &record.id,
        &payload.creator_vault,
        &payload.creator_signature,
        "creator_signature_invalid",
    )?;
    verify_governance_signature(
        &record.attn_wallet,
        &record.id,
        &payload.creator_vault,
        &payload.attn_signature,
        "attn_signature_invalid",
    )?;
    let stored = repo
        .link_governance(
            record.id,
            &payload.creator_vault,
            &payload.creator_signature,
            &payload.attn_signature,
        )
        .await
        .map_err(ApiError::from)?;
    let response = record_to_response(&stored, state.squads.as_ref());
    Ok(Json(response))
}

async fn metrics_endpoint(State(state): State<AppState>) -> Result<Response, ApiError> {
    let Some(handle) = state.metrics.as_ref() else {
        return Err(ApiError::service_unavailable(
            "metrics_disabled",
            "Prometheus exporter disabled",
        ));
    };
    let body = handle.render();
    let mut response = Response::new(body.into());
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/plain; version=0.0.4"),
    );
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use attn_indexer::Overview;
    use axum::body::Body;
    use axum::http::{Method, Request};
    use chrono::Duration;
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tower::ServiceExt;

    use std::sync::Arc;
    use tokio::sync::Mutex;

    fn test_app() -> (Router, DynStore) {
        let store = mock_store();
        let quote_service = QuoteService::new(
            Cluster::new("devnet"),
            AdvanceLimits {
                per_wallet_usdc: 5_000.0,
                per_epoch_usdc: 100_000.0,
                devnet_allowlist: None,
            },
            Duration::seconds(60),
            "LpWallet11111111111111111111111111111111",
        );
        let mut security_config = default_security_config();
        security_config
            .api_keys
            .insert("test".to_string(), "secret".to_string());
        let security = SecurityState::new(security_config);
        let state = AppState {
            store: store.clone(),
            quotes: quote_service,
            squads: None,
            squads_repo: None,
            security,
            metrics: None,
        };
        (build_router(state), store)
    }

    #[tokio::test]
    async fn overview_endpoint_works() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/overview")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let overview: Overview = serde_json::from_slice(&bytes).unwrap();
        assert!(overview.total_markets > 0);
    }

    #[tokio::test]
    async fn market_not_found_gives_404() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/markets/does-not-exist")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn rewards_endpoint_works() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/rewards")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let payload: RewardsListResponse = serde_json::from_slice(&bytes).unwrap();
        assert!(!payload.pools.is_empty());
    }

    #[tokio::test]
    async fn rewards_pool_not_found_returns_404() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/rewards/UnknownPool")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn readyz_endpoint_checks_store() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/readyz")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn version_endpoint_returns_payload() {
        let (app, _) = test_app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/version")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let payload: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(payload["version"].as_str(), Some(env!("CARGO_PKG_VERSION")));
        assert!(payload["git_sha"].is_string());
        assert!(payload["built_at_unix"].is_number());
    }

    #[tokio::test]
    async fn yt_quote_endpoint_returns_cached_payload() {
        let (app, store) = test_app();
        let market_id = "Market1111111111111111111111111111111111";
        let market = store.market(market_id).await.unwrap().unwrap();
        let url = format!(
            "/v1/markets/{}/yt-quote?size=100&maturity={}",
            market_id, market.summary.maturity_ts
        );

        let first_response = app
            .clone()
            .oneshot(Request::builder().uri(&url).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(first_response.status(), StatusCode::OK);
        let etag = first_response.headers().get(ETAG).cloned().unwrap();
        let bytes = first_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let payload: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(payload["route"], "rfq");
        assert_eq!(payload["side"], "sell");

        let second = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(&url)
                    .header(IF_NONE_MATCH, etag)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::NOT_MODIFIED);
    }

    #[tokio::test]
    async fn rfq_sell_executes_and_updates_caps() {
        let (app, store) = test_app();
        let market_id = "Market1111111111111111111111111111111111";
        let maturity = store
            .market(market_id)
            .await
            .unwrap()
            .unwrap()
            .summary
            .maturity_ts;
        let quote_url = format!(
            "/v1/markets/{}/yt-quote?size=250&maturity={}",
            market_id, maturity
        );

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(&quote_url)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let etag = response.headers().get(ETAG).cloned().unwrap();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let quote: Value = serde_json::from_slice(&bytes).unwrap();
        let quote_id = quote["quote_id"].as_str().unwrap();

        // Ensure 304 works as well
        let not_modified = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(&quote_url)
                    .header(IF_NONE_MATCH, etag)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);

        let body = serde_json::json!({
            "quote_id": quote_id,
            "wallet": "Wallet1111111111111111111111111111111111"
        })
        .to_string();

        let trade_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/rfq/yt-sell")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(trade_response.status(), StatusCode::OK);
        let bytes = trade_response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let payload: Value = serde_json::from_slice(&bytes).unwrap();
        assert!(payload["caps"]["wallet_used_usdc"].as_f64().unwrap() > 0.0);

        // Replaying the same quote should fail
        let replay = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/rfq/yt-sell")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        serde_json::json!({
                            "quote_id": quote_id,
                            "wallet": "Wallet1111111111111111111111111111111111"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(replay.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn rfq_buyback_reduces_wallet_usage() {
        let (app, store) = test_app();
        let wallet = "Wallet1111111111111111111111111111111111";
        let market_id = "Market1111111111111111111111111111111111";
        let maturity = store
            .market(market_id)
            .await
            .unwrap()
            .unwrap()
            .summary
            .maturity_ts;
        let sell_quote_url = format!(
            "/v1/markets/{}/yt-quote?size=150&maturity={}",
            market_id, maturity
        );
        let buyback_quote_url = format!(
            "/v1/markets/{}/yt-quote?size=150&maturity={}&side=buyback",
            market_id, maturity
        );

        let sell_quote_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(&sell_quote_url)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let sell_quote_bytes = sell_quote_resp
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let sell_quote: Value = serde_json::from_slice(&sell_quote_bytes).unwrap();
        let sell_quote_id = sell_quote["quote_id"].as_str().unwrap();

        let sell_body =
            serde_json::json!({ "quote_id": sell_quote_id, "wallet": wallet }).to_string();
        let sell_trade = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/rfq/yt-sell")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(sell_body))
                    .unwrap(),
            )
            .await
            .unwrap();
        let sell_trade_bytes = sell_trade.into_body().collect().await.unwrap().to_bytes();
        let sell_trade_payload: Value = serde_json::from_slice(&sell_trade_bytes).unwrap();
        let used_after_sell = sell_trade_payload["caps"]["wallet_used_usdc"]
            .as_f64()
            .unwrap();

        assert!(used_after_sell > 0.0);

        let buyback_quote_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(&buyback_quote_url)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let buyback_quote_bytes = buyback_quote_resp
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let buyback_quote: Value = serde_json::from_slice(&buyback_quote_bytes).unwrap();
        assert_eq!(buyback_quote["side"], "buyback");
        let buyback_quote_id = buyback_quote["quote_id"].as_str().unwrap();

        let buyback_body =
            serde_json::json!({ "quote_id": buyback_quote_id, "wallet": wallet }).to_string();
        let buyback_trade = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/v1/rfq/yt-buyback")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(buyback_body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(buyback_trade.status(), StatusCode::OK);
        let buyback_trade_bytes = buyback_trade
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes();
        let buyback_payload: Value = serde_json::from_slice(&buyback_trade_bytes).unwrap();
        let used_after_buyback = buyback_payload["caps"]["wallet_used_usdc"]
            .as_f64()
            .unwrap();

        assert!(used_after_buyback <= used_after_sell);
    }

    #[derive(Clone)]
    struct MockStatusRepo {
        inner: Arc<Mutex<Vec<SafeRequestRecord>>>,
    }

    impl MockStatusRepo {
        fn new(records: Vec<SafeRequestRecord>) -> Self {
            Self {
                inner: Arc::new(Mutex::new(records)),
            }
        }

        async fn get(&self, id: Uuid) -> Option<SafeRequestRecord> {
            let inner = self.inner.lock().await;
            inner.iter().find(|record| record.id == id).cloned()
        }
    }

    #[async_trait]
    impl StatusSyncStore for MockStatusRepo {
        async fn fetch_status_jobs(&self, limit: i64) -> Result<Vec<SafeRequestRecord>> {
            let inner = self.inner.lock().await;
            let mut matches: Vec<_> = inner
                .iter()
                .filter(|record| {
                    record.status == "submitted"
                        && record
                            .next_retry_at
                            .map(|ts| ts <= Utc::now())
                            .unwrap_or(false)
                        && record.status_url.is_some()
                })
                .cloned()
                .collect();
            matches.truncate(limit.max(1) as usize);
            Ok(matches)
        }

        async fn mark_ready(
            &self,
            request_id: Uuid,
            update: &StatusSyncUpdate,
        ) -> Result<SafeRequestRecord> {
            let mut inner = self.inner.lock().await;
            let record = inner
                .iter_mut()
                .find(|record| record.id == request_id)
                .ok_or_else(|| anyhow!("missing record"))?;
            record.status = "ready".to_string();
            if let Some(address) = update.safe_address.clone() {
                record.safe_address = Some(address);
            }
            if let Some(url) = update.transaction_url.clone() {
                record.transaction_url = Some(url);
            }
            record.status_last_checked_at = Some(Utc::now());
            record.status_last_response = Some(update.status_payload.clone());
            record.status_last_response_hash = Some(update.status_hash.clone());
            record.status_sync_error = None;
            record.next_retry_at = None;
            record.updated_at = Utc::now();
            Ok(record.clone())
        }

        async fn mark_pending(
            &self,
            request_id: Uuid,
            update: &StatusSyncUpdate,
            backoff: Duration,
        ) -> Result<SafeRequestRecord> {
            let mut inner = self.inner.lock().await;
            let record = inner
                .iter_mut()
                .find(|record| record.id == request_id)
                .ok_or_else(|| anyhow!("missing record"))?;
            record.status = "submitted".to_string();
            if let Some(address) = update.safe_address.clone() {
                record.safe_address = Some(address);
            }
            if let Some(url) = update.transaction_url.clone() {
                record.transaction_url = Some(url);
            }
            record.status_last_checked_at = Some(Utc::now());
            record.status_last_response = Some(update.status_payload.clone());
            record.status_last_response_hash = Some(update.status_hash.clone());
            record.status_sync_error = None;
            record.next_retry_at = Some(Utc::now() + backoff);
            record.updated_at = Utc::now();
            Ok(record.clone())
        }

        async fn mark_error(
            &self,
            request_id: Uuid,
            message: &str,
            backoff: Duration,
        ) -> Result<SafeRequestRecord> {
            let mut inner = self.inner.lock().await;
            let record = inner
                .iter_mut()
                .find(|record| record.id == request_id)
                .ok_or_else(|| anyhow!("missing record"))?;
            record.status_last_checked_at = Some(Utc::now());
            record.status_sync_error = Some(message.to_string());
            record.next_retry_at = Some(Utc::now() + backoff);
            record.updated_at = Utc::now();
            Ok(record.clone())
        }
    }

    fn sample_record(status: &str, status_url: Option<String>) -> SafeRequestRecord {
        SafeRequestRecord {
            id: Uuid::new_v4(),
            idempotency_key: None,
            creator_wallet: "Creator1111111111111111111111111111111111111".to_string(),
            attn_wallet: "Attn111111111111111111111111111111111111111".to_string(),
            cluster: "devnet".to_string(),
            threshold: 2,
            safe_name: None,
            contact_email: None,
            note: None,
            status: status.to_string(),
            safe_address: Some("Safe111111111111111111111111111111111111111".to_string()),
            transaction_url: None,
            status_url,
            members: json!(["Creator", "Attn"]),
            raw_response: None,
            raw_response_hash: None,
            status_last_checked_at: None,
            status_last_response: None,
            status_last_response_hash: None,
            status_sync_error: None,
            request_payload: json!({}),
            requester_api_key: None,
            requester_wallet: "Creator1111111111111111111111111111111111111".to_string(),
            requester_ip: None,
            creator_signature: "sig".to_string(),
            nonce: "nonce".to_string(),
            error_code: None,
            error_message: None,
            attempt_count: 1,
            last_attempt_at: Utc::now(),
            next_retry_at: Some(Utc::now()),
            creator_vault: None,
            governance_creator_signature: None,
            governance_attn_signature: None,
            governance_linked_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn status_sync_iteration_promotes_ready() {
        std::env::set_var("ATTN_API_SQUADS_BASE_URL", "local");
        let config = SquadsConfig::from_env().unwrap().unwrap();
        let service = SquadsService::new(config).unwrap();
        let record = sample_record("submitted", Some("https://status.local/1".to_string()));
        let request_id = record.id;
        let repo = MockStatusRepo::new(vec![record]);

        status_sync_iteration(&service, &repo).await.unwrap();
        let updated = repo.get(request_id).await.unwrap();
        assert_eq!(updated.status, "ready");
        assert!(updated.status_last_response_hash.is_some());
        assert!(updated.status_sync_error.is_none());

        std::env::remove_var("ATTN_API_SQUADS_BASE_URL");
    }

    #[tokio::test]
    async fn status_sync_iteration_returns_false_without_jobs() {
        std::env::set_var("ATTN_API_SQUADS_BASE_URL", "local");
        let config = SquadsConfig::from_env().unwrap().unwrap();
        let service = SquadsService::new(config).unwrap();
        let repo = MockStatusRepo::new(vec![sample_record(
            "ready",
            Some("https://status.local/1".to_string()),
        )]);

        let processed = status_sync_iteration(&service, &repo).await.unwrap();
        assert!(!processed);

        std::env::remove_var("ATTN_API_SQUADS_BASE_URL");
    }
}
