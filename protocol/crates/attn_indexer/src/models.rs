use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Overview {
    pub total_creator_vaults: u64,
    pub total_markets: u64,
    pub total_fees_collected_sol: f64,
    pub attnusd_supply: f64,
    pub attnusd_nav: f64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MarketStatus {
    Active,
    Matured,
    Settled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarketSummary {
    pub market: String,
    pub pump_mint: String,
    pub maturity_ts: i64,
    pub pt_supply: f64,
    pub yt_supply: f64,
    pub implied_apy: f64,
    pub status: MarketStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarketDetail {
    pub summary: MarketSummary,
    pub total_fees_distributed_sol: f64,
    pub fee_index: f64,
    pub tvl_sol: f64,
    pub last_yield_slot: u64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortfolioPosition {
    pub market: String,
    pub pt_balance: f64,
    pub yt_balance: f64,
    pub accrued_yield_sol: f64,
    pub last_claimed_slot: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Portfolio {
    pub wallet: String,
    pub total_value_sol: f64,
    pub positions: Vec<PortfolioPosition>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AttnUsdStats {
    pub total_supply: f64,
    pub nav_sol: f64,
    pub price_per_share: f64,
    pub seven_day_apy: f64,
    pub last_rebalance_slot: u64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RewardsPoolSummary {
    pub pool: String,
    pub creator_vault: String,
    pub reward_bps: u16,
    pub total_staked_attnusd: f64,
    pub sol_per_share: f64,
    pub pending_rewards_sol: f64,
    pub total_rewards_sol: f64,
    pub admin: String,
    pub allowed_funder: String,
    pub treasury_balance_sol: f64,
    pub paused: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RewardEventKind {
    Funded,
    Staked,
    Unstaked,
    Claimed,
    Initialized,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RewardEvent {
    pub slot: u64,
    pub signature: String,
    pub kind: RewardEventKind,
    pub user: Option<String>,
    pub amount_sol: Option<f64>,
    pub amount_attnusd: Option<f64>,
    pub total_staked_attnusd: Option<f64>,
    pub treasury_balance_sol: Option<f64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RewardsPoolDetail {
    pub summary: RewardsPoolSummary,
    pub total_stakers: u64,
    pub events: Vec<RewardEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CreatorGovernance {
    pub creator_vault: String,
    pub pump_mint: String,
    pub admin: String,
    pub sol_rewards_bps: u16,
    pub paused: bool,
    pub sy_mint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RewardsGovernance {
    pub rewards_pool: String,
    pub creator_vault: String,
    pub admin: String,
    pub allowed_funder: String,
    pub reward_bps: u16,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StableVaultGovernance {
    pub stable_vault: String,
    pub admin: String,
    pub keeper_authority: String,
    pub authority_seed: String,
    pub share_mint: String,
    pub stable_mint: String,
    pub pending_sol_lamports: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GovernanceState {
    pub creator_vaults: Vec<CreatorGovernance>,
    pub rewards_pools: Vec<RewardsGovernance>,
    pub stable_vault: Option<StableVaultGovernance>,
}
