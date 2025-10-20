use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing::{info, Level};

#[derive(Parser)]
#[command(author, version, about = "attn.markets CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Check CLI is wired up
    Ping,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let cli = Cli::parse();
    match cli.command {
        Commands::Ping => info!("pong"),
    }
    Ok(())
}
