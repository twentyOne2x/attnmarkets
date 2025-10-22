use anyhow::{Context, Result};
use attn_client::stable;
use clap::{Parser, Subcommand};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;
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
    /// StableVault helpers
    StableVault {
        #[command(subcommand)]
        command: StableVaultCommands,
    },
}

#[derive(Subcommand)]
enum StableVaultCommands {
    /// Derive PDA addresses for StableVault components
    Derive {
        /// Authority that seeds the StableVault PDA
        #[arg(long)]
        authority: String,
        /// Primary stable mint accepted by the vault
        #[arg(long = "stable-mint")]
        stable_mint: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let cli = Cli::parse();
    match cli.command {
        Commands::Ping => info!("pong"),
        Commands::StableVault { command } => match command {
            StableVaultCommands::Derive {
                authority,
                stable_mint,
            } => {
                let authority = Pubkey::from_str(&authority).context("invalid authority pubkey")?;
                let stable_mint =
                    Pubkey::from_str(&stable_mint).context("invalid stable mint pubkey")?;
                let pdas = stable::derive_pdas(&authority, &stable_mint);
                println!("StableVault PDA: {}", pdas.stable_vault);
                println!("Treasury PDA: {}", pdas.treasury);
                println!("attnUSD mint PDA: {}", pdas.share_mint);
                println!("SOL vault PDA: {}", pdas.sol_vault);
            }
        },
    }
    Ok(())
}
