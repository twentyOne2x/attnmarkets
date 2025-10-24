use std::env;
use std::sync::Arc;

use anyhow::Result;
use attn_indexer::{
    connect_pool,
    ingest::{LogIngestor, LogIngestorConfig},
    mock_store, run_migrations, DynStore, SqlxStore,
};
use solana_sdk::pubkey::Pubkey;
use sqlx::PgPool;
use tokio::signal;
use tracing::{error, info, warn, Level};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let StoreBootstrap { store, pool } = initialise_store().await?;
    let from_slot = parse_from_slot_arg();
    let overview = store.overview().await?;
    info!(
        "attn_indexer starting ({markets} markets tracked)",
        markets = overview.total_markets
    );
    if let Some(pool) = pool {
        if let Some(ws_url) = env::var("ATTN_INDEXER_WS_URL").ok() {
            if let Some(programs) = parse_programs_env() {
                let cfg = LogIngestorConfig {
                    ws_url,
                    programs,
                    from_slot,
                };
                tokio::spawn(async move {
                    if let Err(err) = LogIngestor::new(cfg, pool).run().await {
                        error!(error = ?err, "log ingestor terminated with error");
                    }
                });
            } else {
                warn!("ATTN_INDEXER_PROGRAMS not set; skipping log ingestion");
            }
        }
    }
    info!("indexer running; press Ctrl+C to exit");
    if let Err(err) = signal::ctrl_c().await {
        warn!(error = ?err, "failed to listen for ctrl+c");
    }
    info!("shutdown signal received");
    Ok(())
}

struct StoreBootstrap {
    store: DynStore,
    pool: Option<PgPool>,
}

async fn initialise_store() -> Result<StoreBootstrap> {
    if let Ok(url) = env::var("ATTN_INDEXER_DATABASE_URL") {
        let pool = connect_pool(&url, 8).await?;
        if let Err(err) = run_migrations(&pool).await {
            warn!(error = ?err, "failed to run migrations");
        }
        Ok(StoreBootstrap {
            store: Arc::new(SqlxStore::new(pool.clone())),
            pool: Some(pool),
        })
    } else {
        warn!("ATTN_INDEXER_DATABASE_URL not set, falling back to in-memory mock store");
        Ok(StoreBootstrap {
            store: mock_store(),
            pool: None,
        })
    }
}

fn parse_programs_env() -> Option<Vec<Pubkey>> {
    let raw = env::var("ATTN_INDEXER_PROGRAMS").ok()?;
    let mut programs = Vec::new();
    for part in raw.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        match trimmed.parse::<Pubkey>() {
            Ok(pk) => programs.push(pk),
            Err(err) => {
                warn!(program = trimmed, error = ?err, "invalid program pubkey");
            }
        }
    }
    if programs.is_empty() {
        None
    } else {
        Some(programs)
    }
}

fn parse_from_slot_arg() -> Option<u64> {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--from-slot" {
            if let Some(value) = args.next() {
                if let Ok(slot) = value.parse::<u64>() {
                    return Some(slot);
                }
            }
        }
    }
    None
}
