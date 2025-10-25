use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use attn_indexer::{
    connect_pool, mock_store, run_migrations, DynStore, Overview, RewardsPoolSummary, SqlxStore,
};
use axum::{
    extract::{Path, Query, State},
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, ETAG, IF_NONE_MATCH},
        HeaderMap, HeaderValue, Method, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
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
        Ok(Self {
            bind_addr,
            data_mode,
        })
    }
}

#[derive(Debug)]
enum ApiError {
    NotFound { resource: &'static str, id: String },
    Internal(anyhow::Error),
}

impl ApiError {
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

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/readyz", get(readyz))
        .route("/version", get(version))
        .route("/health", get(health))
        .route("/v1/overview", get(get_overview))
        .route("/v1/markets", get(list_markets))
        .route("/v1/markets/:market", get(get_market))
        .route("/v1/portfolio/:wallet", get(get_portfolio))
        .route("/v1/attnusd", get(get_attnusd))
        .route("/v1/rewards", get(list_rewards))
        .route("/v1/rewards/:pool", get(get_rewards_pool))
        .route("/v1/governance", get(get_governance))
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
    let store: DynStore = match config.data_mode {
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
    let state = AppState { store };
    let app = build_router(state.clone());
    let listener = TcpListener::bind(config.bind_addr).await?;
    info!("attn_api listening on {}", listener.local_addr()?);
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn test_app() -> Router {
        build_router(AppState {
            store: mock_store(),
        })
    }

    #[tokio::test]
    async fn overview_endpoint_works() {
        let app = test_app();
        let response = app
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
        let app = test_app();
        let response = app
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
        let app = test_app();
        let response = app
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
        let app = test_app();
        let response = app
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
        let app = test_app();
        let response = app
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
        let app = test_app();
        let response = app
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
}
