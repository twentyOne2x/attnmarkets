use axum::{routing::get, Router};
use serde::Serialize;
use tracing::{info, Level};

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> axum::Json<HealthResponse> {
    axum::Json(HealthResponse { status: "ok" })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let app = Router::new().route("/health", get(health));
    let addr = "0.0.0.0:8080".parse()?;
    info!("attn_api listening on {addr}");
    axum::Server::bind(&addr).serve(app.into_make_service()).await?;
    Ok(())
}
