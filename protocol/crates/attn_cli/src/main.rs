use std::{rc::Rc, str::FromStr};

use anchor_client::{Client, Cluster, Program};
use anyhow::{Context, Result};
use attn_client::{creator, rewards, splitter as splitter_client, stable};
use clap::{Parser, Subcommand};
use shellexpand;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::{AccountMeta, Instruction},
    pubkey,
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signature, Signer},
};
use tracing::{info, Level};

#[derive(Parser)]
#[command(author, version, about = "attn.markets CLI", long_about = None)]
struct Cli {
    /// RPC URL to use
    #[arg(long = "url", global = true, default_value = "http://127.0.0.1:8899")]
    rpc_url: String,
    /// Keypair used for signing transactions
    #[arg(
        long = "keypair",
        global = true,
        default_value = "~/.config/solana/id.json"
    )]
    keypair: String,
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
    /// Fund the rewards pool with SOL
    Fund {
        #[arg(long = "creator-vault", value_parser = parse_pubkey)]
        creator_vault: Pubkey,
        #[arg(long = "amount")]
        amount: u64,
    },
    /// RewardsVault helpers
    Rewards {
        #[command(subcommand)]
        command: RewardsCommands,
    },
    /// Wrap quote tokens into SY via CreatorVault
    Wrap {
        #[arg(long = "pump-mint", value_parser = parse_pubkey)]
        pump_mint: Pubkey,
        #[arg(long)]
        amount: u64,
    },
    /// Split SY into PT & YT for a given market
    Split {
        #[arg(long = "market", value_parser = parse_pubkey)]
        market: Pubkey,
        #[arg(long)]
        amount: u64,
    },
    /// Redeem accrued yield for a market
    RedeemYt {
        #[arg(long = "market", value_parser = parse_pubkey)]
        market: Pubkey,
        #[arg(long = "new-fee-index")]
        new_fee_index: Option<u128>,
    },
    /// Redeem PT back into SY after maturity
    RedeemPt {
        #[arg(long = "market", value_parser = parse_pubkey)]
        market: Pubkey,
        #[arg(long)]
        amount: u64,
    },
}

#[derive(Subcommand)]
enum StableVaultCommands {
    /// Derive PDA addresses for StableVault components
    Derive {
        /// Authority that seeds the StableVault PDA
        #[arg(long, value_parser = parse_pubkey)]
        authority: Pubkey,
        /// Primary stable mint accepted by the vault
        #[arg(long = "stable-mint", value_parser = parse_pubkey)]
        stable_mint: Pubkey,
    },
}

#[derive(Subcommand)]
enum RewardsCommands {
    /// Initialize the RewardsVault pool for a CreatorVault
    Initialize {
        #[arg(long = "creator-vault", value_parser = parse_pubkey)]
        creator_vault: Pubkey,
        #[arg(long = "attn-mint", value_parser = parse_pubkey)]
        attn_mint: Pubkey,
        #[arg(long = "reward-bps")]
        reward_bps: u16,
        #[arg(long = "allowed-funder", value_parser = parse_pubkey)]
        allowed_funder: Option<Pubkey>,
    },
    /// Stake attnUSD into the RewardsVault to receive sAttnUSD
    Stake {
        #[arg(long = "creator-vault", value_parser = parse_pubkey)]
        creator_vault: Pubkey,
        #[arg(long = "attn-mint", value_parser = parse_pubkey)]
        attn_mint: Pubkey,
        #[arg(long)]
        amount: u64,
    },
    /// Unstake attnUSD and settle the accrued SOL rewards
    Unstake {
        #[arg(long = "creator-vault", value_parser = parse_pubkey)]
        creator_vault: Pubkey,
        #[arg(long = "attn-mint", value_parser = parse_pubkey)]
        attn_mint: Pubkey,
        #[arg(long)]
        amount: u64,
    },
    /// Claim SOL rewards without changing stake
    Claim {
        #[arg(long = "creator-vault", value_parser = parse_pubkey)]
        creator_vault: Pubkey,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    let cli = Cli::parse();
    let keypair_path = shellexpand::tilde(&cli.keypair).into_owned();
    let payer =
        Rc::new(read_keypair_file(keypair_path).context("failed to read keypair from path")?);
    let cluster = Cluster::Custom(cli.rpc_url.clone(), cli.rpc_url.clone());
    let client = Client::new_with_options(cluster, payer.clone(), CommitmentConfig::confirmed());

    match cli.command {
        Commands::Ping => info!("pong"),
        Commands::StableVault { command } => match command {
            StableVaultCommands::Derive {
                authority,
                stable_mint,
            } => {
                let pdas = stable::derive_pdas(&authority, &stable_mint);
                println!("StableVault PDA: {}", pdas.stable_vault);
                println!("Treasury PDA: {}", pdas.treasury);
                println!("attnUSD mint PDA: {}", pdas.share_mint);
                println!("SOL vault PDA: {}", pdas.sol_vault);
            }
        },
        Commands::Rewards { command } => match command {
            RewardsCommands::Initialize {
                creator_vault,
                attn_mint,
                reward_bps,
                allowed_funder,
            } => {
                rewards_initialize(
                    &client,
                    payer.clone(),
                    creator_vault,
                    attn_mint,
                    reward_bps,
                    allowed_funder,
                )
                .await?
            }
            RewardsCommands::Stake {
                creator_vault,
                attn_mint,
                amount,
            } => rewards_stake(&client, payer.clone(), creator_vault, attn_mint, amount).await?,
            RewardsCommands::Unstake {
                creator_vault,
                attn_mint,
                amount,
            } => rewards_unstake(&client, payer.clone(), creator_vault, attn_mint, amount).await?,
            RewardsCommands::Claim { creator_vault } => {
                rewards_claim(&client, payer.clone(), creator_vault).await?
            }
            RewardsCommands::Fund {
                creator_vault,
                amount,
            } => rewards_fund(&client, payer.clone(), creator_vault, amount).await?,
        },
        Commands::Wrap { pump_mint, amount } => {
            wrap(&client, payer.clone(), pump_mint, amount).await?
        }
        Commands::Split { market, amount } => split(&client, payer.clone(), market, amount).await?,
        Commands::RedeemYt {
            market,
            new_fee_index,
        } => redeem_yield(&client, payer.clone(), market, new_fee_index).await?,
        Commands::RedeemPt { market, amount } => {
            redeem_principal(&client, payer.clone(), market, amount).await?
        }
    }

    Ok(())
}

async fn rewards_initialize(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    creator_vault: Pubkey,
    attn_mint: Pubkey,
    reward_bps: u16,
    allowed_funder: Option<Pubkey>,
) -> Result<()> {
    let program = client.program(rewards_vault::ID);
    let rewards_client = rewards::RewardsVaultClient::new(&program);
    let allowed = allowed_funder.unwrap_or(creator_vault);
    let pdas = rewards_client
        .initialize_pool(
            payer.as_ref(),
            payer.as_ref(),
            creator_vault,
            attn_mint,
            reward_bps,
            allowed,
        )
        .context("failed to initialize rewards pool")?;
    println!("Rewards pool: {}", pdas.rewards_pool);
    println!("sAttnUSD mint: {}", pdas.s_attn_mint);
    println!("attnUSD vault: {}", pdas.attn_vault);
    println!("SOL treasury: {}", pdas.sol_treasury);
    Ok(())
}

async fn rewards_stake(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    creator_vault: Pubkey,
    attn_mint: Pubkey,
    amount: u64,
) -> Result<()> {
    let program = client.program(rewards_vault::ID);
    let pdas = rewards::derive_pdas(&creator_vault);
    let user = payer.pubkey();
    let user_attn_ata = associated_token_address(&user, &attn_mint);
    let user_s_attn_ata = associated_token_address(&user, &pdas.s_attn_mint);
    let (stake_position, _) = rewards::stake_position_pda(&pdas.rewards_pool, &user);

    let mut instructions = vec![
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &attn_mint),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &pdas.s_attn_mint),
    ];

    let stake_ix = rewards::build_stake_attnusd_ix(
        pdas.rewards_pool,
        pdas.rewards_authority,
        user,
        user_attn_ata,
        user_s_attn_ata,
        pdas.attn_vault,
        attn_mint,
        pdas.s_attn_mint,
        stake_position,
        pdas.sol_treasury,
        amount,
    );
    instructions.push(stake_ix);

    let sig = send_instructions(program, payer, instructions).await?;
    println!("Rewards stake transaction signature: {}", sig);
    Ok(())
}

async fn rewards_unstake(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    creator_vault: Pubkey,
    attn_mint: Pubkey,
    amount: u64,
) -> Result<()> {
    let program = client.program(rewards_vault::ID);
    let pdas = rewards::derive_pdas(&creator_vault);
    let user = payer.pubkey();
    let user_attn_ata = associated_token_address(&user, &attn_mint);
    let user_s_attn_ata = associated_token_address(&user, &pdas.s_attn_mint);
    let (stake_position, _) = rewards::stake_position_pda(&pdas.rewards_pool, &user);

    let mut instructions = vec![
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &attn_mint),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &pdas.s_attn_mint),
    ];

    let unstake_ix = rewards::build_unstake_attnusd_ix(
        pdas.rewards_pool,
        pdas.rewards_authority,
        user,
        user_attn_ata,
        user_s_attn_ata,
        pdas.attn_vault,
        attn_mint,
        pdas.s_attn_mint,
        stake_position,
        pdas.sol_treasury,
        amount,
    );
    instructions.push(unstake_ix);

    let sig = send_instructions(program, payer, instructions).await?;
    println!("Rewards unstake transaction signature: {}", sig);
    Ok(())
}

async fn rewards_claim(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    creator_vault: Pubkey,
) -> Result<()> {
    let program = client.program(rewards_vault::ID);
    let pdas = rewards::derive_pdas(&creator_vault);
    let user = payer.pubkey();
    let (stake_position, _) = rewards::stake_position_pda(&pdas.rewards_pool, &user);

    let claim_ix =
        rewards::build_claim_rewards_ix(pdas.rewards_pool, user, stake_position, pdas.sol_treasury);
    let sig = send_instructions(program, payer, vec![claim_ix]).await?;
    println!("Rewards claim transaction signature: {}", sig);
    Ok(())
}

async fn rewards_fund(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    creator_vault: Pubkey,
    amount: u64,
) -> Result<()> {
    let program = client.program(rewards_vault::ID);
    let pdas = rewards::derive_pdas(&creator_vault);
    let instruction = rewards::build_fund_rewards_ix(
        creator_vault,
        pdas.rewards_pool,
        payer.pubkey(),
        pdas.sol_treasury,
        amount,
    );
    let sig = send_instructions(program, payer, vec![instruction]).await?;
    println!("Rewards fund transaction signature: {}", sig);
    Ok(())
}

async fn wrap(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    pump_mint: Pubkey,
    amount: u64,
) -> Result<()> {
    let program = client.program(creator_vault::ID);
    let (creator_vault_addr, _) = creator::creator_vault_pda(&pump_mint);
    let creator_state = creator::fetch_account(&program, creator_vault_addr)
        .await
        .context("failed to fetch creator vault account")?;

    let pdas = creator::derive_pdas(&pump_mint);
    let user = payer.pubkey();
    let user_quote_ata = associated_token_address(&user, &creator_state.quote_mint);
    let user_sy_ata = associated_token_address(&user, &pdas.sy_mint);

    let instructions = vec![
        create_associated_token_account_idempotent_ix(
            &payer.pubkey(),
            &user,
            &creator_state.quote_mint,
        ),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &pdas.sy_mint),
        creator::build_wrap_fees_ix(
            pump_mint,
            creator_state.quote_mint,
            user,
            user_quote_ata,
            user_sy_ata,
            amount,
        ),
    ];

    let sig = send_instructions(program, payer, instructions).await?;
    println!("Wrap transaction signature: {}", sig);
    Ok(())
}

async fn split(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    market_pubkey: Pubkey,
    amount: u64,
) -> Result<()> {
    let splitter_program = client.program(splitter::ID);
    let creator_program = client.program(creator_vault::ID);

    let market = splitter_client::fetch_market(&splitter_program, market_pubkey)
        .await
        .context("failed to fetch market account")?;

    let creator_vault_addr = market.creator_vault;
    let creator_state = creator::fetch_account(&creator_program, creator_vault_addr)
        .await
        .context("failed to fetch creator vault account")?;

    let user = payer.pubkey();
    let user_sy_ata = associated_token_address(&user, &market.sy_mint);
    let user_pt_ata = associated_token_address(&user, &market.pt_mint);
    let user_yt_ata = associated_token_address(&user, &market.yt_mint);

    let mut instructions = vec![
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &market.sy_mint),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &market.pt_mint),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &market.yt_mint),
    ];

    let (mint_ix, pdas) = splitter_client::build_mint_pt_yt_ix(
        market_pubkey,
        creator_vault_addr,
        user,
        market.sy_mint,
        market.pt_mint,
        market.yt_mint,
        user_sy_ata,
        user_pt_ata,
        user_yt_ata,
        amount,
    );
    instructions.push(mint_ix);

    let sig = send_instructions(splitter_program, payer, instructions).await?;
    println!(
        "Split transaction signature: {}\nSplitter authority: {}\nUser position: {}",
        sig, pdas.splitter_authority, pdas.user_position
    );
    Ok(())
}

async fn redeem_yield(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    market_pubkey: Pubkey,
    new_fee_index: Option<u128>,
) -> Result<()> {
    let splitter_program = client.program(splitter::ID);
    let creator_program = client.program(creator_vault::ID);

    let market = splitter_client::fetch_market(&splitter_program, market_pubkey)
        .await
        .context("failed to fetch market account")?;

    let creator_vault_addr = market.creator_vault;
    let creator_state = creator::fetch_account(&creator_program, creator_vault_addr)
        .await
        .context("failed to fetch creator vault account")?;

    let user = payer.pubkey();
    let (user_position, _) = splitter_client::user_position_pda(&market_pubkey, &user);
    let fee_vault = creator::fee_vault_pda(&market.pump_mint).0;
    let user_yt_ata = associated_token_address(&user, &market.yt_mint);
    let user_quote_ata = associated_token_address(&user, &creator_state.quote_mint);

    let mut instructions = vec![create_associated_token_account_idempotent_ix(
        &payer.pubkey(),
        &user,
        &creator_state.quote_mint,
    )];

    let ix = splitter_client::build_redeem_yield_ix(
        market_pubkey,
        creator_vault_addr,
        user,
        user_position,
        user_yt_ata,
        fee_vault,
        user_quote_ata,
        new_fee_index.unwrap_or(market.fee_index),
    );
    instructions.push(ix);

    let sig = send_instructions(splitter_program, payer, instructions).await?;
    println!("Redeem yield transaction signature: {}", sig);
    Ok(())
}

async fn redeem_principal(
    client: &Client<Rc<Keypair>>,
    payer: Rc<Keypair>,
    market_pubkey: Pubkey,
    amount: u64,
) -> Result<()> {
    let splitter_program = client.program(splitter::ID);
    let creator_program = client.program(creator_vault::ID);

    let market = splitter_client::fetch_market(&splitter_program, market_pubkey)
        .await
        .context("failed to fetch market account")?;

    let creator_vault_addr = market.creator_vault;
    let _creator_state = creator::fetch_account(&creator_program, creator_vault_addr)
        .await
        .context("failed to fetch creator vault account")?;

    let user = payer.pubkey();
    let user_pt_ata = associated_token_address(&user, &market.pt_mint);
    let user_sy_ata = associated_token_address(&user, &market.sy_mint);

    let mut instructions = vec![
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &market.pt_mint),
        create_associated_token_account_idempotent_ix(&payer.pubkey(), &user, &market.sy_mint),
    ];

    let ix = splitter_client::build_redeem_principal_ix(
        market_pubkey,
        creator_vault_addr,
        user,
        user_pt_ata,
        user_sy_ata,
        market.pt_mint,
        market.sy_mint,
        amount,
    );
    instructions.push(ix);

    let sig = send_instructions(splitter_program, payer, instructions).await?;
    println!("Redeem principal transaction signature: {}", sig);
    Ok(())
}

async fn send_instructions<C>(
    program: Program<C>,
    payer: Rc<Keypair>,
    instructions: Vec<Instruction>,
) -> Result<Signature>
where
    C: std::ops::Deref + Clone,
    C::Target: Signer,
{
    let sig = program
        .request()
        .instructions(instructions)
        .signer(payer.as_ref())
        .send()
        .await?;
    Ok(sig)
}

fn parse_pubkey(value: &str) -> Result<Pubkey, String> {
    Pubkey::from_str(value).map_err(|err| err.to_string())
}

const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            owner.as_ref(),
            anchor_spl::token::ID.as_ref(),
            mint.as_ref(),
        ],
        &ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    .0
}

fn create_associated_token_account_idempotent_ix(
    payer: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    let ata = associated_token_address(owner, mint);
    Instruction {
        program_id: ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(solana_sdk::system_program::ID, false),
            AccountMeta::new_readonly(anchor_spl::token::ID, false),
        ],
        data: vec![1],
    }
}
