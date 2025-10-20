use anyhow::Result;
use tracing::{info, Level};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    info!("attn_indexer starting (stub)");
    // TODO: wire Helius/websocket listeners and Postgres writer
    Ok(())
}
