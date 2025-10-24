use std::{collections::HashMap, str::FromStr, sync::Arc};

use anyhow::{Context, Result};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use solana_client::{
    nonblocking::pubsub_client::PubsubClient,
    rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter},
    rpc_response::{Response, RpcLogsResponse},
};
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey};
use sqlx::{PgPool, Row};
use tracing::{info, warn};

const SOL_INDEX_SCALE: f64 = 1_000_000_000_f64;

#[derive(Debug, Clone)]
pub struct LogIngestorConfig {
    pub ws_url: String,
    pub programs: Vec<Pubkey>,
    pub from_slot: Option<u64>,
}

pub struct LogIngestor {
    cfg: LogIngestorConfig,
    pool: PgPool,
}

impl LogIngestor {
    pub fn new(cfg: LogIngestorConfig, pool: PgPool) -> Self {
        Self { cfg, pool }
    }

    pub async fn run(self) -> Result<()> {
        if self.cfg.programs.is_empty() {
            warn!("LogIngestor started without any programs; exiting");
            return Ok(());
        }

        info!("connecting to log stream at {}", self.cfg.ws_url);

        let program_strings: Vec<String> =
            self.cfg.programs.iter().map(|p| p.to_string()).collect();

        let client = PubsubClient::new(&self.cfg.ws_url)
            .await
            .context("failed to create pubsub client")?;

        let config = RpcTransactionLogsConfig {
            commitment: Some(CommitmentConfig::confirmed()),
        };
        let (mut stream, _subscription) = client
            .logs_subscribe(RpcTransactionLogsFilter::Mentions(program_strings), config)
            .await
            .context("failed to subscribe to log stream")?;

        let pool = Arc::new(self.pool);
        let mut checkpoints = load_checkpoints(pool.clone(), &self.cfg.programs).await?;
        if let Some(from_slot) = self.cfg.from_slot {
            for program in &self.cfg.programs {
                checkpoints
                    .entry(*program)
                    .and_modify(|slot| *slot = (*slot).max(from_slot))
                    .or_insert(from_slot);
            }
        }
        while let Some(response) = stream.next().await {
            let Some(program_id) = extract_program_id(&response, &self.cfg.programs) else {
                continue;
            };
            if let Err(err) =
                handle_logs(pool.clone(), response, program_id, &mut checkpoints).await
            {
                warn!(error = ?err, "failed to handle log update");
            }
        }

        Ok(())
    }
}

async fn handle_logs(
    pool: Arc<PgPool>,
    response: Response<RpcLogsResponse>,
    program_id: Pubkey,
    checkpoints: &mut HashMap<Pubkey, u64>,
) -> Result<()> {
    let slot = response.context.slot as u64;
    if let Some(min_slot) = checkpoints.get(&program_id) {
        if slot <= *min_slot {
            return Ok(());
        }
    }

    let mut processed = false;
    for event in parse_anchor_events(&response) {
        match event.name.as_str() {
            "FeeCollected" => {
                let data: FeeCollectedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_fee_collected(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "VaultInitialized" => {
                let data: VaultInitializedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_creator_vault_initialized(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "RewardsSplitUpdated" => {
                let data: RewardsSplitUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_creator_rewards_split(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "AdminUpdated" => {
                let data: CreatorAdminUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_creator_admin_updated(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "VaultPauseToggled" => {
                let data: VaultPauseToggledEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_creator_pause(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "RewardsPoolInitialized" => {
                let data: RewardsPoolInitializedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_rewards_pool_initialized(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "RewardsFunded" => {
                let data: RewardsFundedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_funded(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "Staked" => {
                let data: RewardsStakeEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_staked(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "Unstaked" => {
                let data: RewardsStakeEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_unstaked(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "RewardsClaimed" => {
                let data: RewardsClaimedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_claimed(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "AllowedFunderUpdated" => {
                let data: AllowedFunderUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_rewards_allowed_funder(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "RewardBpsUpdated" => {
                let data: RewardBpsUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_reward_bps(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "RewardsAdminUpdated" => {
                let data: RewardsAdminUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_rewards_admin_updated(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "RewardsPoolPaused" => {
                let data: RewardsPoolPausedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_rewards_paused(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "StableVaultInitialized" => {
                let data: StableVaultInitializedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_stable_vault_initialized(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "StableVaultAdminUpdated" => {
                let data: StableVaultAdminUpdatedEvent =
                    serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_stable_admin_updated(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "KeeperAuthorityUpdated" => {
                let data: KeeperAuthorityUpdatedEvent = serde_json::from_value(event.data.clone())?;
                processed |= persist_keeper_authority_updated(
                    pool.clone(),
                    event.signature.clone(),
                    slot,
                    data,
                )
                .await?;
            }
            "StableVaultPauseToggled" => {
                let data: StableVaultPauseToggledEvent =
                    serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_stable_pause_toggled(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "CreatorFeesSwept" => {
                let data: CreatorFeesSweptEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_creator_fees_swept(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            "ConversionProcessed" => {
                let data: ConversionProcessedEvent = serde_json::from_value(event.data.clone())?;
                processed |=
                    persist_conversion_processed(pool.clone(), event.signature.clone(), slot, data)
                        .await?;
            }
            _ => {}
        }
    }

    if processed {
        persist_checkpoint(pool.clone(), program_id, slot).await?;
        checkpoints.insert(program_id, slot);
    }

    Ok(())
}

#[derive(Debug)]
struct AnchorEvent {
    signature: String,
    slot: u64,
    name: String,
    data: Value,
}

fn parse_anchor_events(response: &Response<RpcLogsResponse>) -> Vec<AnchorEvent> {
    response
        .value
        .logs
        .iter()
        .filter_map(|log| {
            let json = log.strip_prefix("Program log: Event: ")?;
            let parsed: Value = serde_json::from_str(json).ok()?;
            let name = parsed.get("name")?.as_str()?.to_string();
            let data = parsed.get("data")?.clone();
            Some(AnchorEvent {
                signature: response.value.signature.clone(),
                slot: response.context.slot as u64,
                name,
                data,
            })
        })
        .collect()
}

async fn load_checkpoints(pool: Arc<PgPool>, programs: &[Pubkey]) -> Result<HashMap<Pubkey, u64>> {
    let rows = sqlx::query("select program, last_slot from ingest_checkpoints")
        .fetch_all(pool.as_ref())
        .await?;
    let mut checkpoints = HashMap::new();
    for row in rows {
        let program: String = row.get("program");
        if let Ok(pk) = program.parse::<Pubkey>() {
            let slot: i64 = row.get("last_slot");
            checkpoints.insert(pk, slot.max(0) as u64);
        }
    }
    for program in programs {
        checkpoints.entry(*program).or_insert(0);
    }
    Ok(checkpoints)
}

async fn persist_checkpoint(pool: Arc<PgPool>, program: Pubkey, slot: u64) -> Result<()> {
    sqlx::query(
        r#"
        insert into ingest_checkpoints (program, last_slot, updated_at)
        values ($1, $2, now())
        on conflict (program)
        do update set
            last_slot = greatest(ingest_checkpoints.last_slot, EXCLUDED.last_slot),
            updated_at = now()
        "#,
    )
    .bind(program.to_string())
    .bind(slot as i64)
    .execute(pool.as_ref())
    .await?;
    Ok(())
}

fn extract_program_id(response: &Response<RpcLogsResponse>, expected: &[Pubkey]) -> Option<Pubkey> {
    for log in &response.value.logs {
        if let Some(rest) = log.strip_prefix("Program ") {
            let mut parts = rest.split_whitespace();
            if let Some(program_str) = parts.next() {
                if let Ok(pk) = program_str.parse::<Pubkey>() {
                    if expected.iter().any(|p| p == &pk) {
                        return Some(pk);
                    }
                }
            }
        }
    }
    expected.first().copied()
}

#[derive(Debug, Deserialize)]
struct FeeCollectedEvent {
    pub pump_mint: String,
    pub amount: u64,
    pub user: String,
}

#[derive(Debug, Deserialize)]
struct RewardsPoolInitializedEvent {
    pub pool: String,
    pub creator_vault: String,
    pub attn_mint: String,
    pub s_attn_mint: String,
    pub reward_bps: u16,
    pub admin: String,
    pub allowed_funder: String,
}

#[derive(Debug, Deserialize)]
struct RewardsFundedEvent {
    pub pool: String,
    pub amount: u64,
    pub source_amount: u64,
    pub sol_per_share: String,
    pub treasury_balance: u64,
    #[serde(default)]
    pub operation_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RewardsStakeEvent {
    pub pool: String,
    pub user: String,
    pub amount: u64,
    pub total_staked: u64,
    pub claimed: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RewardsClaimedEvent {
    pub pool: String,
    pub user: String,
    pub amount: u64,
}

#[derive(Debug, Deserialize)]
struct VaultInitializedEvent {
    pub creator_vault: String,
    pub pump_mint: String,
    pub quote_mint: String,
    pub sy_mint: String,
    pub admin: String,
}

#[derive(Debug, Deserialize)]
struct RewardsSplitUpdatedEvent {
    pub creator_vault: String,
    pub sol_rewards_bps: u16,
}

#[derive(Debug, Deserialize)]
struct CreatorAdminUpdatedEvent {
    pub creator_vault: String,
    pub previous_admin: String,
    pub new_admin: String,
}

#[derive(Debug, Deserialize)]
struct VaultPauseToggledEvent {
    pub creator_vault: String,
    pub paused: bool,
}

#[derive(Debug, Deserialize)]
struct AllowedFunderUpdatedEvent {
    pub pool: String,
    pub allowed_funder: String,
}

#[derive(Debug, Deserialize)]
struct RewardBpsUpdatedEvent {
    pub pool: String,
    pub reward_bps: u16,
}

#[derive(Debug, Deserialize)]
struct RewardsAdminUpdatedEvent {
    pub pool: String,
    pub previous_admin: String,
    pub new_admin: String,
}

#[derive(Debug, Deserialize)]
struct RewardsPoolPausedEvent {
    pub pool: String,
    pub paused: bool,
}

#[derive(Debug, Deserialize)]
struct StableVaultInitializedEvent {
    pub stable_vault: String,
    pub authority_seed: String,
    pub share_mint: String,
    pub stable_mint: String,
    pub admin: String,
}

#[derive(Debug, Deserialize)]
struct StableVaultAdminUpdatedEvent {
    pub stable_vault: String,
    pub previous_admin: String,
    pub new_admin: String,
}

#[derive(Debug, Deserialize)]
struct KeeperAuthorityUpdatedEvent {
    pub stable_vault: String,
    pub keeper_authority: String,
}

#[derive(Debug, Deserialize)]
struct StableVaultPauseToggledEvent {
    pub stable_vault: String,
    pub is_paused: bool,
}

#[derive(Debug, Deserialize)]
struct CreatorFeesSweptEvent {
    pub stable_vault: String,
    pub pending_sol: u64,
    #[serde(default)]
    pub operation_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ConversionProcessedEvent {
    pub stable_vault: String,
    pub pending_sol: u64,
    #[serde(default)]
    pub operation_id: Option<u64>,
}

fn decode_sol_index(value: &str) -> Result<f64> {
    let raw = u128::from_str(value)?;
    Ok(raw as f64 / SOL_INDEX_SCALE)
}

async fn persist_fee_collected(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: FeeCollectedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("creator_vault")
    .bind("fee_collected")
    .bind(json!({
        "pump_mint": event.pump_mint,
        "amount": event.amount,
        "user": event.user,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        insert into creator_vaults (pump_mint, vault_pubkey, total_fees_lamports, updated_at)
        values ($1, '', $2, now())
        on conflict (pump_mint)
        do update set
            total_fees_lamports = creator_vaults.total_fees_lamports + EXCLUDED.total_fees_lamports,
            updated_at = now()
        "#,
    )
    .bind(&event.pump_mint)
    .bind(event.amount as i64)
    .execute(pool.as_ref())
    .await?;

    info!(
        signature = signature,
        slot,
        pump_mint = event.pump_mint,
        amount = event.amount,
        "persisted fee-collected event"
    );
    Ok(true)
}

async fn persist_rewards_pool_initialized(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsPoolInitializedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_initialized")
    .bind(json!({
        "pool": event.pool,
        "creator_vault": event.creator_vault,
        "attn_mint": event.attn_mint,
        "s_attn_mint": event.s_attn_mint,
        "reward_bps": event.reward_bps,
        "admin": event.admin,
        "allowed_funder": event.allowed_funder,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        insert into rewards_pools (rewards_pool, creator_vault, reward_bps, total_staked_attnusd, sol_per_share, pending_rewards_lamports, total_rewards_lamports, admin, allowed_funder, treasury_balance_lamports, updated_at)
        values ($1, $2, $3, 0, 0, 0, 0, $4, $5, 0, now())
        on conflict (rewards_pool)
        do update set
            creator_vault = EXCLUDED.creator_vault,
            reward_bps = EXCLUDED.reward_bps,
            admin = EXCLUDED.admin,
            allowed_funder = EXCLUDED.allowed_funder,
            updated_at = now()
        "#,
    )
    .bind(&event.pool)
    .bind(&event.creator_vault)
    .bind(event.reward_bps as i32)
    .bind(&event.admin)
    .bind(&event.allowed_funder)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_stable_pause_toggled(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: StableVaultPauseToggledEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("stable_vault")
    .bind("stable_pause")
    .bind(json!({
        "stable_vault": event.stable_vault,
        "is_paused": event.is_paused,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update stable_vaults
        set paused = $1, updated_at = now()
        where stable_vault = $2
        "#,
    )
    .bind(event.is_paused)
    .bind(&event.stable_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_funded(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsFundedEvent,
) -> Result<bool> {
    let sol_per_share = decode_sol_index(&event.sol_per_share)?;
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_funded")
    .bind(json!({
        "pool": event.pool,
        "amount": event.amount,
        "source_amount": event.source_amount,
        "sol_per_share": event.sol_per_share,
        "treasury_balance": event.treasury_balance,
        "operation_id": event.operation_id,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        insert into rewards_pools (
            rewards_pool,
            creator_vault,
            reward_bps,
            total_staked_attnusd,
            sol_per_share,
            pending_rewards_lamports,
            total_rewards_lamports,
            admin,
            allowed_funder,
            treasury_balance_lamports,
            updated_at
        )
        values (
            $1,
            '',
            0,
            0,
            $4,
            greatest($2 - $3, 0),
            $3,
            '',
            '',
            $5,
            now()
        )
        on conflict (rewards_pool)
        do update set
            total_rewards_lamports = rewards_pools.total_rewards_lamports + EXCLUDED.total_rewards_lamports,
            sol_per_share = EXCLUDED.sol_per_share,
            treasury_balance_lamports = EXCLUDED.treasury_balance_lamports,
            pending_rewards_lamports = case
                when $3 = 0 then rewards_pools.pending_rewards_lamports + ($2 - $3)
                when $3 > $2 then 0
                else $2 - $3
            end,
            updated_at = now()
        "#,
    )
    .bind(&event.pool)
    .bind(event.source_amount as i64)
    .bind(event.amount as i64)
    .bind(sol_per_share)
    .bind(event.treasury_balance as i64)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_staked(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsStakeEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_staked")
    .bind(json!({
        "pool": event.pool,
        "user": event.user,
        "amount": event.amount,
        "total_staked": event.total_staked,
        "claimed": event.claimed.unwrap_or(0),
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set total_staked_attnusd = $2,
            updated_at = now()
        where rewards_pool = $1
        "#,
    )
    .bind(&event.pool)
    .bind(event.total_staked as f64)
    .execute(pool.as_ref())
    .await?;

    sqlx::query(
        r#"
        insert into rewards_positions (pool, wallet, staked_amount_attnusd, reward_debt, updated_at)
        values ($1, $2, $3, 0, now())
        on conflict (pool, wallet)
        do update set
            staked_amount_attnusd = rewards_positions.staked_amount_attnusd + EXCLUDED.staked_amount_attnusd,
            updated_at = now()
        "#,
    )
    .bind(&event.pool)
    .bind(&event.user)
    .bind(event.amount as f64)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_unstaked(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsStakeEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_unstaked")
    .bind(json!({
        "pool": event.pool,
        "user": event.user,
        "amount": event.amount,
        "total_staked": event.total_staked,
        "claimed": event.claimed.unwrap_or(0),
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set total_staked_attnusd = $2,
            updated_at = now()
        where rewards_pool = $1
        "#,
    )
    .bind(&event.pool)
    .bind(event.total_staked as f64)
    .execute(pool.as_ref())
    .await?;

    sqlx::query(
        r#"
        update rewards_positions
        set staked_amount_attnusd = greatest(staked_amount_attnusd - $3, 0),
            updated_at = now()
        where pool = $1 and wallet = $2
        "#,
    )
    .bind(&event.pool)
    .bind(&event.user)
    .bind(event.amount as f64)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_claimed(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsClaimedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_claimed")
    .bind(json!({
        "pool": event.pool,
        "user": event.user,
        "amount": event.amount,
    }))
    .execute(pool.as_ref())
    .await?;

    Ok(insert_result.rows_affected() > 0)
}

async fn persist_creator_vault_initialized(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: VaultInitializedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("creator_vault")
    .bind("creator_initialized")
    .bind(json!({
        "creator_vault": event.creator_vault,
        "pump_mint": event.pump_mint,
        "quote_mint": event.quote_mint,
        "sy_mint": event.sy_mint,
        "admin": event.admin,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        insert into creator_vaults (pump_mint, vault_pubkey, total_fees_lamports, total_sy, last_slot, admin, sol_rewards_bps, paused, sy_mint, updated_at)
        values ($1, $2, 0, 0, $3, $4, 0, false, $5, now())
        on conflict (pump_mint)
        do update set
            vault_pubkey = EXCLUDED.vault_pubkey,
            admin = EXCLUDED.admin,
            sy_mint = EXCLUDED.sy_mint,
            updated_at = now()
        "#,
    )
    .bind(&event.pump_mint)
    .bind(&event.creator_vault)
    .bind(slot as i64)
    .bind(&event.admin)
    .bind(&event.sy_mint)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_creator_rewards_split(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsSplitUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("creator_vault")
    .bind("creator_rewards_split")
    .bind(json!({
        "creator_vault": event.creator_vault,
        "sol_rewards_bps": event.sol_rewards_bps,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update creator_vaults
        set sol_rewards_bps = $1, updated_at = now()
        where vault_pubkey = $2
        "#,
    )
    .bind(event.sol_rewards_bps as i32)
    .bind(&event.creator_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_creator_admin_updated(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: CreatorAdminUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("creator_vault")
    .bind("creator_admin_updated")
    .bind(json!({
        "creator_vault": event.creator_vault,
        "previous_admin": event.previous_admin,
        "new_admin": event.new_admin,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update creator_vaults
        set admin = $1, updated_at = now()
        where vault_pubkey = $2
        "#,
    )
    .bind(&event.new_admin)
    .bind(&event.creator_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_creator_pause(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: VaultPauseToggledEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("creator_vault")
    .bind("creator_paused")
    .bind(json!({
        "creator_vault": event.creator_vault,
        "paused": event.paused,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update creator_vaults
        set paused = $1, updated_at = now()
        where vault_pubkey = $2
        "#,
    )
    .bind(event.paused)
    .bind(&event.creator_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_allowed_funder(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: AllowedFunderUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_allowed_funder")
    .bind(json!({
        "pool": event.pool,
        "allowed_funder": event.allowed_funder,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set allowed_funder = $1, updated_at = now()
        where rewards_pool = $2
        "#,
    )
    .bind(&event.allowed_funder)
    .bind(&event.pool)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_reward_bps(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardBpsUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_bps_updated")
    .bind(json!({
        "pool": event.pool,
        "reward_bps": event.reward_bps,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set reward_bps = $1, updated_at = now()
        where rewards_pool = $2
        "#,
    )
    .bind(event.reward_bps as i32)
    .bind(&event.pool)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_admin_updated(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsAdminUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_admin_updated")
    .bind(json!({
        "pool": event.pool,
        "previous_admin": event.previous_admin,
        "new_admin": event.new_admin,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set admin = $1, updated_at = now()
        where rewards_pool = $2
        "#,
    )
    .bind(&event.new_admin)
    .bind(&event.pool)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_rewards_paused(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: RewardsPoolPausedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("rewards_vault")
    .bind("rewards_paused")
    .bind(json!({
        "pool": event.pool,
        "paused": event.paused,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update rewards_pools
        set paused = $1, updated_at = now()
        where rewards_pool = $2
        "#,
    )
    .bind(event.paused)
    .bind(&event.pool)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_stable_vault_initialized(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: StableVaultInitializedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("stable_vault")
    .bind("stable_initialized")
    .bind(json!({
        "stable_vault": event.stable_vault,
        "authority_seed": event.authority_seed,
        "share_mint": event.share_mint,
        "stable_mint": event.stable_mint,
        "admin": event.admin,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        insert into stable_vaults (stable_vault, authority_seed, admin, keeper_authority, share_mint, stable_mint, pending_sol_lamports, paused, updated_at)
        values ($1, $2, $3, $2, $4, $5, 0, false, now())
        on conflict (stable_vault)
        do update set
            authority_seed = EXCLUDED.authority_seed,
            admin = EXCLUDED.admin,
            keeper_authority = EXCLUDED.keeper_authority,
            share_mint = EXCLUDED.share_mint,
            stable_mint = EXCLUDED.stable_mint,
            paused = EXCLUDED.paused,
            updated_at = now()
        "#,
    )
    .bind(&event.stable_vault)
    .bind(&event.authority_seed)
    .bind(&event.admin)
    .bind(&event.share_mint)
    .bind(&event.stable_mint)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_stable_admin_updated(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: StableVaultAdminUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("stable_vault")
    .bind("stable_admin_updated")
    .bind(json!({
        "stable_vault": event.stable_vault,
        "previous_admin": event.previous_admin,
        "new_admin": event.new_admin,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update stable_vaults
        set admin = $1, updated_at = now()
        where stable_vault = $2
        "#,
    )
    .bind(&event.new_admin)
    .bind(&event.stable_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_keeper_authority_updated(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: KeeperAuthorityUpdatedEvent,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("stable_vault")
    .bind("stable_keeper_updated")
    .bind(json!({
        "stable_vault": event.stable_vault,
        "keeper_authority": event.keeper_authority,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"
        update stable_vaults
        set keeper_authority = $1, updated_at = now()
        where stable_vault = $2
        "#,
    )
    .bind(&event.keeper_authority)
    .bind(&event.stable_vault)
    .execute(pool.as_ref())
    .await?;

    Ok(true)
}

async fn persist_stable_pending_sol(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    stable_vault: String,
    pending_sol: u64,
    kind: &'static str,
    operation_id: Option<u64>,
    op_column: Option<&'static str>,
) -> Result<bool> {
    let insert_result = sqlx::query(
        r#"
        insert into events (sig, slot, program, kind, payload)
        values ($1, $2, $3, $4, $5)
        on conflict (sig) do nothing
        "#,
    )
    .bind(&signature)
    .bind(slot as i64)
    .bind("stable_vault")
    .bind(kind)
    .bind(json!({
        "stable_vault": stable_vault,
        "pending_sol": pending_sol,
        "operation_id": operation_id,
    }))
    .execute(pool.as_ref())
    .await?;

    if insert_result.rows_affected() == 0 {
        return Ok(false);
    }

    match op_column {
        Some("last_sweep_id") => {
            sqlx::query(
                r#"
                update stable_vaults
                set pending_sol_lamports = $1,
                    last_sweep_id = $2,
                    updated_at = now()
                where stable_vault = $3
                "#,
            )
            .bind(pending_sol as f64)
            .bind(operation_id.unwrap_or_default() as f64)
            .bind(stable_vault)
            .execute(pool.as_ref())
            .await?;
        }
        Some("last_conversion_id") => {
            sqlx::query(
                r#"
                update stable_vaults
                set pending_sol_lamports = $1,
                    last_conversion_id = $2,
                    updated_at = now()
                where stable_vault = $3
                "#,
            )
            .bind(pending_sol as f64)
            .bind(operation_id.unwrap_or_default() as f64)
            .bind(stable_vault)
            .execute(pool.as_ref())
            .await?;
        }
        _ => {
            sqlx::query(
                r#"
                update stable_vaults
                set pending_sol_lamports = $1, updated_at = now()
                where stable_vault = $2
                "#,
            )
            .bind(pending_sol as f64)
            .bind(stable_vault)
            .execute(pool.as_ref())
            .await?;
        }
    }

    Ok(true)
}

async fn persist_creator_fees_swept(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: CreatorFeesSweptEvent,
) -> Result<bool> {
    persist_stable_pending_sol(
        pool,
        signature,
        slot,
        event.stable_vault,
        event.pending_sol,
        "stable_fees_swept",
        event.operation_id,
        Some("last_sweep_id"),
    )
    .await
}

async fn persist_conversion_processed(
    pool: Arc<PgPool>,
    signature: String,
    slot: u64,
    event: ConversionProcessedEvent,
) -> Result<bool> {
    persist_stable_pending_sol(
        pool,
        signature,
        slot,
        event.stable_vault,
        event.pending_sol,
        "stable_conversion",
        event.operation_id,
        Some("last_conversion_id"),
    )
    .await
}
