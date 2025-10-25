mod advance;

use std::collections::HashSet;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use advance::{
    AdvanceCapSnapshot, AdvanceLimits, Cluster, QuoteRoute, QuoteService, QuoteSide, TradeDirection,
};
use anyhow::{anyhow, Context, Result};
use attn_indexer::{
    connect_pool, mock_store, run_migrations, DynStore, Overview, RewardsPoolSummary, SqlxStore,
};
use axum::{
    extract::{Path, Query, State},
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, ETAG, IF_NONE_MATCH, VARY},
        HeaderMap, HeaderValue, Method, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Duration;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;
use tower_http::cors::{AllowHeaders, AllowOrigin, CorsLayer};
use tracing::{error, info, warn, Level};

#[derive(Serialize, Deserialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Clone)]
struct AppState {
    store: DynStore,
    quotes: QuoteService,
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
}

impl ApiConfig {
    fn from_env() -> Result<Self> {
        let bind_addr = env::var("ATTN_API_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
            .parse()
            .context("invalid ATTN_API_BIND_ADDR")?;
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
        Ok(Self {
            bind_addr,
            data_mode,
            cluster,
            advance_limits,
            quote_ttl_secs,
            rfq_lp_wallet,
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

fn build_router(state: AppState) -> Router {
    Router::new()
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
        .with_state(state)
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
        ]))
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
    } = config;
    let store: DynStore = match data_mode {
        DataMode::Mock => {
            warn!("ATTN_API_DATA_MODE=mock; serving static dataset");
            mock_store()
        }
        DataMode::Postgres {
            database_url,
            max_connections,
        } => {
            let pool = connect_pool(&database_url, max_connections).await?;
            if let Err(err) = run_migrations(&pool).await {
                warn!(error = ?err, "failed to run migrations");
            }
            Arc::new(SqlxStore::new(pool))
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
    let state = AppState {
        store,
        quotes: quote_service,
    };
    let app = build_router(state.clone());
    let listener = TcpListener::bind(bind_addr).await?;
    info!(
        "attn_api listening on {} (cluster: {}, ttl: {}s)",
        listener.local_addr()?,
        cluster.as_str(),
        quote_ttl_secs
    );
    axum::serve(listener, app).await?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Method, Request};
    use chrono::Duration;
    use http_body_util::BodyExt;
    use serde_json::Value;
    use tower::ServiceExt;

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
        let state = AppState {
            store: store.clone(),
            quotes: quote_service,
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
}
