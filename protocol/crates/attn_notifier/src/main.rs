use anyhow::Result;
use tracing::{info, Level};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    info!("attn_notifier started (stub)");
    Ok(())
}
