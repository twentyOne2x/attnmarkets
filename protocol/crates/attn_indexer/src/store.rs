use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{Duration, Utc};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

use crate::models::{
    AttnUsdStats, CreatorGovernance, GovernanceState, MarketDetail, MarketStatus, MarketSummary,
    Overview, Portfolio, RewardEvent, RewardEventKind, RewardsGovernance, RewardsPoolDetail,
    RewardsPoolSummary, StableVaultGovernance,
};

#[async_trait]
pub trait ReadStore: Send + Sync {
    async fn overview(&self) -> Result<Overview>;
    async fn markets(&self) -> Result<Vec<MarketSummary>>;
    async fn market(&self, market: &str) -> Result<Option<MarketDetail>>;
    async fn portfolio(&self, wallet: &str) -> Result<Option<Portfolio>>;
    async fn attnusd(&self) -> Result<AttnUsdStats>;
    async fn rewards(&self, cursor: Option<String>, limit: u16) -> Result<RewardsPage>;
    async fn rewards_pool(&self, pool: &str) -> Result<Option<RewardsPoolDetail>>;
    async fn governance(&self) -> Result<GovernanceState>;
    async fn health_check(&self) -> Result<()>;
}

pub type DynStore = Arc<dyn ReadStore>;

pub fn mock_store() -> DynStore {
    Arc::new(MockStore::default())
}

pub struct RewardsPage {
    pub items: Vec<RewardsPoolSummary>,
    pub next_cursor: Option<String>,
    pub updated_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Clone, Default)]
pub struct MockStore {
    inner: Arc<MockData>,
}

impl MockStore {
    pub fn with_data(inner: MockData) -> Self {
        Self {
            inner: Arc::new(inner),
        }
    }
}

pub async fn connect_pool(database_url: &str, max_connections: u32) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect_lazy(database_url)?;
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub struct SqlxStore {
    pool: PgPool,
}

impl SqlxStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ReadStore for SqlxStore {
    async fn overview(&self) -> Result<Overview> {
        let row = sqlx::query(
            r#"
            select
                (select count(*) from creator_vaults) as total_creator_vaults,
                (select count(*) from markets) as total_markets,
                coalesce(sum(total_fees_lamports), 0) as total_fees_lamports,
                (select coalesce(total_supply, 0) from attnusd_stats limit 1) as total_supply,
                (select coalesce(share_index, 1) from attnusd_stats limit 1) as share_index,
                greatest(
                    coalesce((select max(updated_at) from creator_vaults), 'epoch'),
                    coalesce((select max(updated_at) from markets), 'epoch'),
                    coalesce((select max(updated_at) from attnusd_stats), 'epoch')
                ) as updated_at
            "#,
        )
        .fetch_one(&self.pool)
        .await?;

        let total_creator_vaults: i64 = row.try_get("total_creator_vaults")?;
        let total_markets: i64 = row.try_get("total_markets")?;
        let total_fees_lamports: f64 = row.try_get("total_fees_lamports")?;
        let total_supply: f64 = row.try_get("total_supply")?;
        let share_index: f64 = row.try_get("share_index")?;
        let updated_at: chrono::DateTime<Utc> = row.try_get("updated_at")?;

        Ok(Overview {
            total_creator_vaults: total_creator_vaults.max(0) as u64,
            total_markets: total_markets.max(0) as u64,
            total_fees_collected_sol: total_fees_lamports / 1_000_000_000_f64,
            attnusd_supply: total_supply,
            attnusd_nav: total_supply * share_index,
            updated_at,
        })
    }

    async fn markets(&self) -> Result<Vec<MarketSummary>> {
        let rows = sqlx::query(
            r#"
            select m.market_pubkey,
                   m.pump_mint,
                   cv.vault_pubkey as creator_vault,
                   cv.sy_mint,
                   m.pt_mint,
                   m.yt_mint,
                   m.maturity_ts,
                   m.pt_supply,
                   m.yt_supply,
                   m.fee_index,
                   m.updated_at
            from markets m
            join creator_vaults cv on cv.pump_mint = m.pump_mint
            order by m.market_pubkey asc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let markets: Vec<_> = rows
            .into_iter()
            .map(|row| {
                let maturity_ts: i64 = row.get("maturity_ts");
                let status = if maturity_ts <= Utc::now().timestamp() {
                    MarketStatus::Matured
                } else {
                    MarketStatus::Active
                };
                MarketSummary {
                    market: row.get("market_pubkey"),
                    pump_mint: row.get("pump_mint"),
                    creator_vault: row.get("creator_vault"),
                    sy_mint: row.get("sy_mint"),
                    pt_mint: row.get("pt_mint"),
                    yt_mint: row.get("yt_mint"),
                    maturity_ts,
                    pt_supply: row.get("pt_supply"),
                    yt_supply: row.get("yt_supply"),
                    implied_apy: row.get("fee_index"),
                    status,
                }
            })
            .collect();

        Ok(markets)
    }

    async fn market(&self, market: &str) -> Result<Option<MarketDetail>> {
        let row = sqlx::query(
            r#"
            select m.market_pubkey,
                   m.pump_mint,
                   v.vault_pubkey as creator_vault,
                   v.sy_mint,
                   m.pt_mint,
                   m.yt_mint,
                   m.maturity_ts,
                   m.pt_supply,
                   m.yt_supply,
                   m.fee_index,
                   m.updated_at,
                   coalesce(v.total_fees_lamports, 0) as total_fees_lamports,
                   m.created_slot
            from markets m
            join creator_vaults v on v.pump_mint = m.pump_mint
            where m.market_pubkey = $1
            "#,
        )
        .bind(market)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let maturity_ts: i64 = row.get("maturity_ts");
        let status = if maturity_ts <= Utc::now().timestamp() {
            MarketStatus::Matured
        } else {
            MarketStatus::Active
        };

        Ok(Some(MarketDetail {
            summary: MarketSummary {
                market: row.get("market_pubkey"),
                pump_mint: row.get("pump_mint"),
                creator_vault: row.get("creator_vault"),
                sy_mint: row.get("sy_mint"),
                pt_mint: row.get("pt_mint"),
                yt_mint: row.get("yt_mint"),
                maturity_ts,
                pt_supply: row.get("pt_supply"),
                yt_supply: row.get("yt_supply"),
                implied_apy: row.get("fee_index"),
                status,
            },
            total_fees_distributed_sol: row.get::<f64, _>("total_fees_lamports")
                / 1_000_000_000_f64,
            fee_index: row.get("fee_index"),
            tvl_sol: row.get("pt_supply"),
            last_yield_slot: row.get::<i64, _>("created_slot") as u64,
            updated_at: row.get("updated_at"),
        }))
    }

    async fn portfolio(&self, wallet: &str) -> Result<Option<Portfolio>> {
        let rows = sqlx::query(
            r#"
            select market_pubkey, pt_balance, yt_balance, accrued_yield, last_index
            from user_positions
            where wallet = $1
            "#,
        )
        .bind(wallet)
        .fetch_all(&self.pool)
        .await?;

        if rows.is_empty() {
            return Ok(None);
        }

        let positions: Vec<_> = rows
            .into_iter()
            .map(|row| {
                let accrued_yield_lamports: f64 = row.get("accrued_yield");
                crate::models::PortfolioPosition {
                    market: row.get("market_pubkey"),
                    pt_balance: row.get("pt_balance"),
                    yt_balance: row.get("yt_balance"),
                    accrued_yield_sol: accrued_yield_lamports / 1_000_000_000_f64,
                    last_claimed_slot: row.get::<i64, _>("last_index").max(0) as u64,
                }
            })
            .collect();

        let total_value_sol = positions
            .iter()
            .map(|pos| pos.pt_balance + pos.yt_balance + pos.accrued_yield_sol)
            .sum();

        Ok(Some(Portfolio {
            wallet: wallet.to_string(),
            total_value_sol,
            positions,
            updated_at: Utc::now(),
        }))
    }

    async fn attnusd(&self) -> Result<AttnUsdStats> {
        let row = sqlx::query(
            r#"
            select total_supply, share_index, updated_at
            from attnusd_stats
            limit 1
            "#,
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(AttnUsdStats {
                total_supply: row.get("total_supply"),
                nav_sol: row.get::<f64, _>("total_supply") * row.get::<f64, _>("share_index"),
                price_per_share: row.get("share_index"),
                seven_day_apy: 0.0,
                last_rebalance_slot: 0,
                updated_at: row.get("updated_at"),
            })
        } else {
            Ok(AttnUsdStats {
                total_supply: 0.0,
                nav_sol: 0.0,
                price_per_share: 1.0,
                seven_day_apy: 0.0,
                last_rebalance_slot: 0,
                updated_at: Utc::now(),
            })
        }
    }

    async fn rewards(&self, cursor: Option<String>, limit: u16) -> Result<RewardsPage> {
        let limit = limit.clamp(1, 100) as i64;
        let rows = if let Some(cursor) = cursor {
            sqlx::query(
                r#"
                select rewards_pool,
                       creator_vault,
                       reward_bps,
                       total_staked_attnusd,
                       sol_per_share,
                       pending_rewards_lamports,
                       total_rewards_lamports,
                       admin,
                       allowed_funder,
                       treasury_balance_lamports,
                       paused,
                       attn_mint,
                       s_attn_mint,
                       attn_vault,
                       updated_at
                from rewards_pools
                where rewards_pool > $1
                order by rewards_pool asc
                limit $2
                "#,
            )
            .bind(&cursor)
            .bind(limit + 1)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                select rewards_pool,
                       creator_vault,
                       reward_bps,
                       total_staked_attnusd,
                       sol_per_share,
                       pending_rewards_lamports,
                       total_rewards_lamports,
                       admin,
                       allowed_funder,
                       treasury_balance_lamports,
                       paused,
                       attn_mint,
                       s_attn_mint,
                       attn_vault,
                       updated_at
                from rewards_pools
                order by rewards_pool asc
                limit $1
                "#,
            )
            .bind(limit + 1)
            .fetch_all(&self.pool)
            .await?
        };

        let mut summaries: Vec<RewardsPoolSummary> = rows
            .into_iter()
            .map(|row| RewardsPoolSummary {
                pool: row.get("rewards_pool"),
                creator_vault: row.get("creator_vault"),
                reward_bps: row.get::<i32, _>("reward_bps").max(0) as u16,
                total_staked_attnusd: row.get("total_staked_attnusd"),
                sol_per_share: row.get("sol_per_share"),
                pending_rewards_sol: row.get::<f64, _>("pending_rewards_lamports")
                    / 1_000_000_000_f64,
                total_rewards_sol: row.get::<f64, _>("total_rewards_lamports") / 1_000_000_000_f64,
                admin: row.get("admin"),
                allowed_funder: row.get("allowed_funder"),
                treasury_balance_sol: row.get::<f64, _>("treasury_balance_lamports")
                    / 1_000_000_000_f64,
                paused: row.get::<bool, _>("paused"),
                attn_mint: row.get("attn_mint"),
                s_attn_mint: row.get("s_attn_mint"),
                attn_vault: row.get("attn_vault"),
                updated_at: row.get("updated_at"),
            })
            .collect();

        let mut next_cursor = None;
        if summaries.len() as i64 > limit {
            summaries.pop();
            if let Some(last) = summaries.last() {
                next_cursor = Some(last.pool.clone());
            }
        }
        let updated_at = summaries.iter().map(|item| item.updated_at).max();

        Ok(RewardsPage {
            items: summaries,
            next_cursor,
            updated_at,
        })
    }

    async fn rewards_pool(&self, pool: &str) -> Result<Option<RewardsPoolDetail>> {
        let row = sqlx::query(
            r#"
            select rewards_pool,
                   creator_vault,
                   reward_bps,
                   total_staked_attnusd,
                   sol_per_share,
                   pending_rewards_lamports,
                   total_rewards_lamports,
                   admin,
                   allowed_funder,
                   treasury_balance_lamports,
                   paused,
                   attn_mint,
                   s_attn_mint,
                   attn_vault,
                   updated_at
            from rewards_pools
            where rewards_pool = $1
            "#,
        )
        .bind(pool)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let summary = RewardsPoolSummary {
            pool: row.get("rewards_pool"),
            creator_vault: row.get("creator_vault"),
            reward_bps: row.get::<i32, _>("reward_bps").max(0) as u16,
            total_staked_attnusd: row.get("total_staked_attnusd"),
            sol_per_share: row.get("sol_per_share"),
            pending_rewards_sol: row.get::<f64, _>("pending_rewards_lamports") / 1_000_000_000_f64,
            total_rewards_sol: row.get::<f64, _>("total_rewards_lamports") / 1_000_000_000_f64,
            admin: row.get("admin"),
            allowed_funder: row.get("allowed_funder"),
            treasury_balance_sol: row.get::<f64, _>("treasury_balance_lamports")
                / 1_000_000_000_f64,
            paused: row.get::<bool, _>("paused"),
            attn_mint: row.get("attn_mint"),
            s_attn_mint: row.get("s_attn_mint"),
            attn_vault: row.get("attn_vault"),
            updated_at: row.get("updated_at"),
        };

        let stakers_row = sqlx::query(
            r#"
            select count(*) as count
            from rewards_positions
            where pool = $1
            "#,
        )
        .bind(pool)
        .fetch_one(&self.pool)
        .await?;
        let total_stakers = stakers_row.get::<i64, _>("count").max(0) as u64;

        let event_rows = sqlx::query(
            r#"
            select sig, slot, kind, payload, ts
            from events
            where program = 'rewards_vault'
              and payload->>'pool' = $1
            order by slot desc
            limit 50
            "#,
        )
        .bind(pool)
        .fetch_all(&self.pool)
        .await?;

        let events = event_rows
            .into_iter()
            .map(|row| {
                let kind_raw: String = row.get("kind");
                let kind = match kind_raw.as_str() {
                    "rewards_initialized" => RewardEventKind::Initialized,
                    "rewards_funded" => RewardEventKind::Funded,
                    "rewards_staked" => RewardEventKind::Staked,
                    "rewards_unstaked" => RewardEventKind::Unstaked,
                    "rewards_claimed" => RewardEventKind::Claimed,
                    other => return Err(anyhow!("unknown reward event kind: {other}")),
                };
                let payload: Value = row.get("payload");
                let user = payload
                    .get("user")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let amount_sol = match kind {
                    RewardEventKind::Funded => payload
                        .get("source_amount")
                        .and_then(|v| v.as_u64())
                        .map(|lamports| lamports as f64 / 1_000_000_000_f64),
                    RewardEventKind::Claimed => payload
                        .get("amount")
                        .and_then(|v| v.as_u64())
                        .map(|lamports| lamports as f64 / 1_000_000_000_f64),
                    _ => None,
                };
                let amount_attnusd = payload
                    .get("amount")
                    .and_then(|v| v.as_u64())
                    .map(|raw| raw as f64)
                    .filter(|_| {
                        matches!(kind, RewardEventKind::Staked | RewardEventKind::Unstaked)
                    });
                let total_staked_attnusd = payload
                    .get("total_staked")
                    .and_then(|v| v.as_u64())
                    .map(|raw| raw as f64);
                let treasury_balance_sol = payload
                    .get("treasury_balance")
                    .and_then(|v| v.as_u64())
                    .map(|lamports| lamports as f64 / 1_000_000_000_f64);
                Ok(RewardEvent {
                    slot: row.get::<i64, _>("slot").max(0) as u64,
                    signature: row.get("sig"),
                    kind,
                    user,
                    amount_sol,
                    amount_attnusd,
                    total_staked_attnusd,
                    treasury_balance_sol,
                    created_at: row.get("ts"),
                })
            })
            .collect::<Result<Vec<RewardEvent>>>()?;

        Ok(Some(RewardsPoolDetail {
            summary,
            total_stakers,
            events,
        }))
    }

    async fn governance(&self) -> Result<GovernanceState> {
        let creator_rows = sqlx::query(
            r#"
            select vault_pubkey, pump_mint, admin, sol_rewards_bps, paused, sy_mint,
                   coalesce(advance_enabled, false) as advance_enabled
            from creator_vaults
            order by pump_mint asc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let creator_vaults = creator_rows
            .into_iter()
            .map(|row| CreatorGovernance {
                creator_vault: row.get("vault_pubkey"),
                pump_mint: row.get("pump_mint"),
                admin: row.get("admin"),
                sol_rewards_bps: row.get::<i32, _>("sol_rewards_bps").max(0) as u16,
                paused: row.get::<bool, _>("paused"),
                sy_mint: row.get("sy_mint"),
                advance_enabled: row.get::<bool, _>("advance_enabled"),
            })
            .collect();

        let rewards_rows = sqlx::query(
            r#"
            select rewards_pool, creator_vault, admin, allowed_funder, reward_bps, paused
            from rewards_pools
            order by rewards_pool asc
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let rewards_pools = rewards_rows
            .into_iter()
            .map(|row| RewardsGovernance {
                rewards_pool: row.get("rewards_pool"),
                creator_vault: row.get("creator_vault"),
                admin: row.get("admin"),
                allowed_funder: row.get("allowed_funder"),
                reward_bps: row.get::<i32, _>("reward_bps").max(0) as u16,
                paused: row.get::<bool, _>("paused"),
            })
            .collect();

        let stable_row = sqlx::query(
            r#"
            select stable_vault, authority_seed, admin, keeper_authority, share_mint, stable_mint, pending_sol_lamports, paused, last_sweep_id, last_conversion_id
            from stable_vaults
            order by stable_vault asc
            limit 1
            "#,
        )
        .fetch_optional(&self.pool)
        .await?;

        let stable_vault = stable_row.map(|row| StableVaultGovernance {
            stable_vault: row.get("stable_vault"),
            admin: row.get("admin"),
            keeper_authority: row.get("keeper_authority"),
            authority_seed: row.get("authority_seed"),
            share_mint: row.get("share_mint"),
            stable_mint: row.get("stable_mint"),
            pending_sol_lamports: row.get::<f64, _>("pending_sol_lamports"),
            paused: row.get::<bool, _>("paused"),
            last_sweep_id: row.get::<f64, _>("last_sweep_id"),
            last_conversion_id: row.get::<f64, _>("last_conversion_id"),
        });

        Ok(GovernanceState {
            creator_vaults,
            rewards_pools,
            stable_vault,
        })
    }

    async fn health_check(&self) -> Result<()> {
        sqlx::query("select 1")
            .fetch_one(&self.pool)
            .await
            .map(|_| ())?;

        let tables = [
            "creator_vaults",
            "markets",
            "attnusd_stats",
            "rewards_pools",
            "stable_vaults",
        ];

        for table in tables {
            let query = format!("select 1 from {table} limit 1");
            sqlx::query(&query).fetch_optional(&self.pool).await?;
        }

        Ok(())
    }
}

#[async_trait]
impl ReadStore for MockStore {
    async fn overview(&self) -> Result<Overview> {
        Ok(self.inner.overview.clone())
    }

    async fn markets(&self) -> Result<Vec<MarketSummary>> {
        let mut markets: Vec<_> = self
            .inner
            .markets
            .values()
            .cloned()
            .map(|detail| detail.summary)
            .collect();
        markets.sort_by(|a, b| a.market.cmp(&b.market));
        Ok(markets)
    }

    async fn market(&self, market: &str) -> Result<Option<MarketDetail>> {
        Ok(self.inner.markets.get(market).cloned())
    }

    async fn portfolio(&self, wallet: &str) -> Result<Option<Portfolio>> {
        Ok(self.inner.portfolios.get(wallet).cloned())
    }

    async fn attnusd(&self) -> Result<AttnUsdStats> {
        Ok(self.inner.attnusd.clone())
    }

    async fn rewards(&self, cursor: Option<String>, limit: u16) -> Result<RewardsPage> {
        let mut summaries: Vec<_> = self
            .inner
            .rewards
            .iter()
            .map(|detail| detail.summary.clone())
            .collect();
        summaries.sort_by(|a, b| a.pool.cmp(&b.pool));

        let limit = limit.clamp(1, 100) as usize;
        let start = cursor
            .as_ref()
            .map(|cur| {
                summaries
                    .iter()
                    .position(|item| item.pool > *cur)
                    .unwrap_or(summaries.len())
            })
            .unwrap_or(0);
        let mut window = summaries[start..].to_vec();
        let mut next_cursor = None;
        if window.len() > limit {
            window.truncate(limit + 1);
            window.pop();
            if let Some(last) = window.last() {
                next_cursor = Some(last.pool.clone());
            }
        }
        window.truncate(window.len().min(limit));
        let updated_at = window.iter().map(|item| item.updated_at).max();

        Ok(RewardsPage {
            items: window,
            next_cursor,
            updated_at,
        })
    }

    async fn rewards_pool(&self, pool: &str) -> Result<Option<RewardsPoolDetail>> {
        Ok(self
            .inner
            .rewards
            .iter()
            .find(|detail| detail.summary.pool == pool)
            .cloned())
    }

    async fn governance(&self) -> Result<GovernanceState> {
        Ok(self.inner.governance.clone())
    }

    async fn health_check(&self) -> Result<()> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct MockData {
    pub overview: Overview,
    pub markets: HashMap<String, MarketDetail>,
    pub portfolios: HashMap<String, Portfolio>,
    pub attnusd: AttnUsdStats,
    pub rewards: Vec<RewardsPoolDetail>,
    pub governance: GovernanceState,
}

impl Default for MockData {
    fn default() -> Self {
        Self::fixture()
    }
}

impl MockData {
    fn fixture() -> Self {
        let now = Utc::now();
        let market_one_summary = MarketSummary {
            market: "Market1111111111111111111111111111111111".into(),
            pump_mint: "PumpMint11111111111111111111111111111111".into(),
            creator_vault: "CreatorVault1111111111111111111111111111111".into(),
            sy_mint: "SyMint111111111111111111111111111111111".into(),
            pt_mint: "PtMint111111111111111111111111111111111".into(),
            yt_mint: "YtMint111111111111111111111111111111111".into(),
            maturity_ts: (now + Duration::days(30)).timestamp(),
            pt_supply: 125_000.0,
            yt_supply: 125_000.0,
            implied_apy: 0.1825,
            status: MarketStatus::Active,
        };

        let market_two_summary = MarketSummary {
            market: "Market2222222222222222222222222222222222".into(),
            pump_mint: "PumpMint22222222222222222222222222222222".into(),
            creator_vault: "CreatorVault2222222222222222222222222222222".into(),
            sy_mint: "SyMint222222222222222222222222222222222".into(),
            pt_mint: "PtMint222222222222222222222222222222222".into(),
            yt_mint: "YtMint222222222222222222222222222222222".into(),
            maturity_ts: (now - Duration::days(3)).timestamp(),
            pt_supply: 64_000.0,
            yt_supply: 64_000.0,
            implied_apy: 0.0,
            status: MarketStatus::Matured,
        };

        let market_one_detail = MarketDetail {
            summary: market_one_summary.clone(),
            total_fees_distributed_sol: 482.17,
            fee_index: 1.0384,
            tvl_sol: 97_500.0,
            last_yield_slot: 234_987_654,
            updated_at: now,
        };

        let market_two_detail = MarketDetail {
            summary: market_two_summary.clone(),
            total_fees_distributed_sol: 812.92,
            fee_index: 1.1243,
            tvl_sol: 58_210.0,
            last_yield_slot: 233_004_111,
            updated_at: now - Duration::hours(2),
        };

        let overview = Overview {
            total_creator_vaults: 3,
            total_markets: 2,
            total_fees_collected_sol: 1_742.55,
            attnusd_supply: 225_500.0,
            attnusd_nav: 229_650.72,
            updated_at: now,
        };

        let attnusd = AttnUsdStats {
            total_supply: 225_500.0,
            nav_sol: 229_650.72,
            price_per_share: 1.0184,
            seven_day_apy: 0.1275,
            last_rebalance_slot: 235_001_002,
            updated_at: now,
        };

        let mut portfolios = HashMap::new();
        portfolios.insert(
            "Wallet1111111111111111111111111111111111".into(),
            Portfolio {
                wallet: "Wallet1111111111111111111111111111111111".into(),
                total_value_sol: 12_345.67,
                positions: vec![
                    crate::models::PortfolioPosition {
                        market: market_one_summary.market.clone(),
                        pt_balance: 1_250.0,
                        yt_balance: 1_250.0,
                        accrued_yield_sol: 8.42,
                        last_claimed_slot: 234_900_000,
                    },
                    crate::models::PortfolioPosition {
                        market: market_two_summary.market.clone(),
                        pt_balance: 500.0,
                        yt_balance: 500.0,
                        accrued_yield_sol: 4.01,
                        last_claimed_slot: 232_990_555,
                    },
                ],
                updated_at: now,
            },
        );

        let markets = HashMap::from([
            (market_one_summary.market.clone(), market_one_detail),
            (market_two_summary.market.clone(), market_two_detail),
        ]);

        let rewards_summary = RewardsPoolSummary {
            pool: "RewardsPool11111111111111111111111111111111".into(),
            creator_vault: "CreatorVault1111111111111111111111111111111".into(),
            reward_bps: 1_500,
            total_staked_attnusd: 85_000.0,
            sol_per_share: 0.000_002_5,
            pending_rewards_sol: 2.15,
            total_rewards_sol: 54.3,
            admin: "Admin1111111111111111111111111111111111".into(),
            allowed_funder: "Funder111111111111111111111111111111111".into(),
            treasury_balance_sol: 12.5,
            paused: false,
            attn_mint: "AttnMint111111111111111111111111111111111".into(),
            s_attn_mint: "SAttnMint11111111111111111111111111111111".into(),
            attn_vault: "AttnVault1111111111111111111111111111111".into(),
            updated_at: now,
        };

        let rewards_events = vec![
            RewardEvent {
                slot: 1_235_000,
                signature: "SigRewardFunded1111111111111111111111111111111".into(),
                kind: RewardEventKind::Funded,
                user: None,
                amount_sol: Some(1.25),
                amount_attnusd: None,
                total_staked_attnusd: None,
                treasury_balance_sol: Some(12.5),
                created_at: now,
            },
            RewardEvent {
                slot: 1_234_500,
                signature: "SigRewardStaked1111111111111111111111111111111".into(),
                kind: RewardEventKind::Staked,
                user: Some("Wallet1111111111111111111111111111111111".into()),
                amount_sol: None,
                amount_attnusd: Some(5_000.0),
                total_staked_attnusd: Some(85_000.0),
                treasury_balance_sol: Some(12.5),
                created_at: now - Duration::minutes(30),
            },
        ];

        let rewards = vec![RewardsPoolDetail {
            summary: rewards_summary.clone(),
            total_stakers: 42,
            events: rewards_events,
        }];

        let governance = GovernanceState {
            creator_vaults: vec![CreatorGovernance {
                creator_vault: "CreatorVault1111111111111111111111111111111".into(),
                pump_mint: "PumpMint11111111111111111111111111111111".into(),
                admin: "Admin11111111111111111111111111111111111".into(),
                sol_rewards_bps: 500,
                paused: false,
                sy_mint: "SyMint111111111111111111111111111111111".into(),
                advance_enabled: true,
            }],
            rewards_pools: vec![RewardsGovernance {
                rewards_pool: "RewardsPool111111111111111111111111111111".into(),
                creator_vault: "CreatorVault1111111111111111111111111111111".into(),
                admin: "Admin11111111111111111111111111111111111".into(),
                allowed_funder: "Funder111111111111111111111111111111111".into(),
                reward_bps: 300,
                paused: false,
            }],
            stable_vault: Some(StableVaultGovernance {
                stable_vault: "StableVault111111111111111111111111111111".into(),
                admin: "StableAdmin11111111111111111111111111111".into(),
                keeper_authority: "Keeper11111111111111111111111111111111".into(),
                authority_seed: "Keeper11111111111111111111111111111111".into(),
                share_mint: "ShareMint111111111111111111111111111111".into(),
                stable_mint: "StableMint111111111111111111111111111111".into(),
                pending_sol_lamports: 0.0,
                paused: false,
                last_sweep_id: 0.0,
                last_conversion_id: 0.0,
            }),
        };

        Self {
            overview,
            markets,
            portfolios,
            attnusd,
            rewards,
            governance,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mock_store_returns_overview() {
        let store = MockStore::default();
        let overview = store.overview().await.unwrap();
        assert!(overview.total_creator_vaults > 0);
    }

    #[tokio::test]
    async fn mock_store_lists_markets() {
        let store = MockStore::default();
        let markets = store.markets().await.unwrap();
        assert_eq!(markets.len(), 2);
    }

    #[tokio::test]
    async fn mock_store_fetches_market_detail() {
        let store = MockStore::default();
        let markets = store.markets().await.unwrap();
        let first = &markets[0];
        let detail = store.market(&first.market).await.unwrap();
        assert!(detail.is_some());
    }

    #[tokio::test]
    async fn mock_store_fetches_portfolio() {
        let store = MockStore::default();
        let portfolio = store
            .portfolio("Wallet1111111111111111111111111111111111")
            .await
            .unwrap();
        assert!(portfolio.is_some());
    }

    #[tokio::test]
    async fn mock_store_lists_rewards() {
        let store = MockStore::default();
        let pools = store.rewards(None, 50).await.unwrap();
        assert!(!pools.items.is_empty());
    }

    #[tokio::test]
    async fn mock_store_fetches_reward_detail() {
        let store = MockStore::default();
        let pools = store.rewards(None, 50).await.unwrap();
        let first = &pools.items[0];
        let detail = store.rewards_pool(&first.pool).await.unwrap();
        assert!(detail.is_some());
        assert!(!detail.unwrap().events.is_empty());
    }
}
