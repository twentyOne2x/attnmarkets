use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::ApiError;

const SIX_DECIMAL_FACTOR: f64 = 1_000_000.0;
const EPSILON: f64 = 0.000_001;

fn round_six(value: f64) -> f64 {
    (value * SIX_DECIMAL_FACTOR).round() / SIX_DECIMAL_FACTOR
}

#[derive(Debug, Clone)]
pub struct Cluster {
    value: String,
}

impl Cluster {
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            value: value.into().to_lowercase(),
        }
    }

    pub fn as_str(&self) -> &str {
        &self.value
    }

    pub fn is_devnet(&self) -> bool {
        self.value == "devnet"
    }
}

#[derive(Debug, Clone)]
pub struct AdvanceLimits {
    pub per_wallet_usdc: f64,
    pub per_epoch_usdc: f64,
    pub devnet_allowlist: Option<HashSet<String>>,
}

impl AdvanceLimits {
    pub fn wallet_allowed(&self, wallet: &str) -> bool {
        match &self.devnet_allowlist {
            Some(set) => set.contains(wallet),
            None => true,
        }
    }

    fn wallet_limit_opt(&self) -> Option<f64> {
        if self.per_wallet_usdc.is_finite() && self.per_wallet_usdc > 0.0 {
            Some(self.per_wallet_usdc)
        } else {
            None
        }
    }

    fn epoch_limit_opt(&self) -> Option<f64> {
        if self.per_epoch_usdc.is_finite() && self.per_epoch_usdc > 0.0 {
            Some(self.per_epoch_usdc)
        } else {
            None
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuoteSide {
    Sell,
    Buyback,
}

impl Default for QuoteSide {
    fn default() -> Self {
        QuoteSide::Sell
    }
}

impl QuoteSide {
    pub fn as_str(&self) -> &'static str {
        match self {
            QuoteSide::Sell => "sell",
            QuoteSide::Buyback => "buyback",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuoteRoute {
    Rfq,
    Amm,
}

#[derive(Clone, Debug)]
pub struct QuoteRecord {
    pub id: String,
    pub key: String,
    pub market: String,
    pub size_yt: f64,
    pub price_usdc: f64,
    pub implied_apr: f64,
    pub est_slippage: f64,
    pub route: QuoteRoute,
    pub side: QuoteSide,
    pub maturity_ts: i64,
    pub cursor: String,
    pub expires_at: DateTime<Utc>,
}

impl QuoteRecord {
    pub fn epoch_key(&self) -> String {
        format!("{}:{}", self.market, self.maturity_ts)
    }

    pub fn is_expired(&self, now: DateTime<Utc>) -> bool {
        self.expires_at <= now
    }

    pub fn response(&self) -> QuoteResponse {
        QuoteResponse {
            quote_id: self.id.clone(),
            market: self.market.clone(),
            size_yt: self.size_yt,
            price_usdc: self.price_usdc,
            implied_apr: self.implied_apr,
            est_slippage: self.est_slippage,
            route: self.route,
            side: self.side,
            expires_at: self
                .expires_at
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            cursor: self.cursor.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct QuoteResponse {
    pub quote_id: String,
    pub market: String,
    pub size_yt: f64,
    pub price_usdc: f64,
    pub implied_apr: f64,
    pub est_slippage: f64,
    pub route: QuoteRoute,
    pub side: QuoteSide,
    pub expires_at: String,
    pub cursor: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AdvanceCapSnapshot {
    pub wallet_limit_usdc: Option<f64>,
    pub wallet_used_usdc: f64,
    pub wallet_remaining_usdc: Option<f64>,
    pub epoch_limit_usdc: Option<f64>,
    pub epoch_used_usdc: f64,
    pub epoch_remaining_usdc: Option<f64>,
}

impl AdvanceCapSnapshot {
    fn new(wallet_used: f64, epoch_used: f64, limits: &AdvanceLimits) -> Self {
        let wallet_limit = limits.wallet_limit_opt();
        let epoch_limit = limits.epoch_limit_opt();
        let wallet_used = round_six(wallet_used.max(0.0));
        let epoch_used = round_six(epoch_used.max(0.0));
        let wallet_remaining = wallet_limit.map(|limit| round_six((limit - wallet_used).max(0.0)));
        let epoch_remaining = epoch_limit.map(|limit| round_six((limit - epoch_used).max(0.0)));
        Self {
            wallet_limit_usdc: wallet_limit.map(round_six),
            wallet_used_usdc: wallet_used,
            wallet_remaining_usdc: wallet_remaining,
            epoch_limit_usdc: epoch_limit.map(round_six),
            epoch_used_usdc: epoch_used,
            epoch_remaining_usdc: epoch_remaining,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradeDirection {
    Advance,
    Buyback,
}

#[derive(Clone)]
pub struct QuoteService {
    inner: Arc<QuoteState>,
}

struct QuoteState {
    cache: RwLock<QuoteCache>,
    execution: RwLock<ExecutionBook>,
    limits: AdvanceLimits,
    ttl: Duration,
    cluster: Cluster,
    lp_wallet: String,
}

impl QuoteService {
    pub fn new(
        cluster: Cluster,
        limits: AdvanceLimits,
        ttl: Duration,
        lp_wallet: impl Into<String>,
    ) -> Self {
        Self {
            inner: Arc::new(QuoteState {
                cache: RwLock::new(QuoteCache::default()),
                execution: RwLock::new(ExecutionBook::default()),
                limits,
                ttl,
                cluster,
                lp_wallet: lp_wallet.into(),
            }),
        }
    }

    pub fn ttl_secs(&self) -> u64 {
        self.inner.ttl.num_seconds().max(0) as u64
    }

    pub fn lp_wallet(&self) -> &str {
        &self.inner.lp_wallet
    }

    pub async fn get_or_create_quote(
        &self,
        market: &str,
        size_yt: f64,
        side: QuoteSide,
        maturity_ts: i64,
        implied_apr: f64,
    ) -> Result<QuoteRecord, ApiError> {
        if !size_yt.is_finite() || size_yt <= 0.0 {
            return Err(ApiError::bad_request(
                "invalid_size",
                "quote size must be greater than zero",
            ));
        }

        let now = Utc::now();
        if side == QuoteSide::Sell && maturity_ts <= now.timestamp() {
            return Err(ApiError::bad_request(
                "market_matured",
                "market has matured; advances are closed",
            ));
        }

        let mut cache = self.inner.cache.write().await;
        cache.cleanup_expired(now);

        let normalized_size = round_six(size_yt);
        let key = QuoteCache::compose_key(market, side, maturity_ts, normalized_size);
        if let Some(existing) = cache.by_key.get(&key) {
            return Ok(existing.clone());
        }

        let quote = build_quote(
            market,
            normalized_size,
            side,
            maturity_ts,
            implied_apr,
            self.inner.ttl,
        );
        cache.insert(quote.clone());
        Ok(quote)
    }

    pub async fn finalize_execution(
        &self,
        quote_id: &str,
        wallet: &str,
        direction: TradeDirection,
    ) -> Result<(QuoteRecord, AdvanceCapSnapshot), ApiError> {
        if wallet.trim().is_empty() {
            return Err(ApiError::bad_request(
                "wallet_required",
                "wallet is required for RFQ execution",
            ));
        }

        if !self.inner.cluster.is_devnet() {
            return Err(ApiError::forbidden(
                "advances_disabled",
                "advance trades are disabled on this cluster",
            ));
        }

        if !self.inner.limits.wallet_allowed(wallet) {
            return Err(ApiError::forbidden(
                "wallet_not_allowlisted",
                "wallet is not allowed for advance trades",
            ));
        }

        let now = Utc::now();
        let mut cache = self.inner.cache.write().await;
        cache.cleanup_expired(now);

        if cache.consumed.contains(quote_id) {
            return Err(ApiError::bad_request(
                "quote_consumed",
                "quote was already executed",
            ));
        }
        if !cache.inflight.insert(quote_id.to_string()) {
            return Err(ApiError::bad_request(
                "quote_in_progress",
                "quote execution is already in progress",
            ));
        }

        let quote = match cache.by_id.get(quote_id).cloned() {
            Some(quote) => quote,
            None => {
                cache.inflight.remove(quote_id);
                return Err(ApiError::bad_request("quote_not_found", "quote not found"));
            }
        };

        if quote.is_expired(now) {
            cache.inflight.remove(quote_id);
            cache.remove_by_id(quote_id);
            return Err(ApiError::bad_request("quote_expired", "quote has expired"));
        }

        let expected_side = match direction {
            TradeDirection::Advance => QuoteSide::Sell,
            TradeDirection::Buyback => QuoteSide::Buyback,
        };
        if quote.side != expected_side {
            cache.inflight.remove(quote_id);
            return Err(ApiError::bad_request(
                "wrong_quote_side",
                "quote side does not match requested trade",
            ));
        }

        drop(cache);

        let result = {
            let mut execution = self.inner.execution.write().await;
            execution.apply(
                &quote,
                wallet,
                quote.price_usdc,
                direction,
                &self.inner.limits,
            )
        };

        match result {
            Ok(snapshot) => {
                let mut cache = self.inner.cache.write().await;
                cache.inflight.remove(quote_id);
                cache.mark_consumed(&quote);
                Ok((quote, snapshot))
            }
            Err(err) => {
                let mut cache = self.inner.cache.write().await;
                cache.inflight.remove(quote_id);
                Err(err)
            }
        }
    }
}

#[derive(Default)]
struct QuoteCache {
    by_key: HashMap<String, QuoteRecord>,
    by_id: HashMap<String, QuoteRecord>,
    inflight: HashSet<String>,
    consumed: HashSet<String>,
}

impl QuoteCache {
    fn compose_key(market: &str, side: QuoteSide, maturity_ts: i64, size_yt: f64) -> String {
        format!(
            "{}:{}:{}:{:.6}",
            market,
            maturity_ts,
            side.as_str(),
            size_yt
        )
    }

    fn cleanup_expired(&mut self, now: DateTime<Utc>) {
        let expired: Vec<String> = self
            .by_id
            .iter()
            .filter_map(|(id, quote)| quote.is_expired(now).then(|| id.clone()))
            .collect();

        for id in expired {
            self.remove_by_id(&id);
            self.inflight.remove(&id);
            self.consumed.remove(&id);
        }
    }

    fn insert(&mut self, quote: QuoteRecord) {
        self.by_key.insert(quote.key.clone(), quote.clone());
        self.by_id.insert(quote.id.clone(), quote);
    }

    fn remove_by_id(&mut self, quote_id: &str) {
        if let Some(existing) = self.by_id.remove(quote_id) {
            self.by_key.remove(&existing.key);
        }
    }

    fn mark_consumed(&mut self, quote: &QuoteRecord) {
        self.consumed.insert(quote.id.clone());
        self.remove_by_id(&quote.id);
    }
}

#[derive(Default)]
struct ExecutionBook {
    epochs: HashMap<String, EpochTotals>,
}

impl ExecutionBook {
    fn apply(
        &mut self,
        quote: &QuoteRecord,
        wallet: &str,
        amount_usdc: f64,
        direction: TradeDirection,
        limits: &AdvanceLimits,
    ) -> Result<AdvanceCapSnapshot, ApiError> {
        let epoch_key = quote.epoch_key();
        let wallet_key = wallet.to_string();
        let (wallet_used, epoch_used, should_prune_epoch) = {
            let totals = self.epochs.entry(epoch_key.clone()).or_default();
            let current_wallet_total = totals
                .wallet_totals
                .get(&wallet_key)
                .copied()
                .unwrap_or(0.0);

            let (new_wallet_total, new_epoch_total) = match direction {
                TradeDirection::Advance => {
                    let proposed_wallet_total = current_wallet_total + amount_usdc;
                    if let Some(limit) = limits.wallet_limit_opt() {
                        if proposed_wallet_total - limit > EPSILON {
                            return Err(ApiError::bad_request(
                                "wallet_cap_exceeded",
                                "wallet advance cap exceeded",
                            ));
                        }
                    }
                    let proposed_epoch_total = totals.total + amount_usdc;
                    if let Some(limit) = limits.epoch_limit_opt() {
                        if proposed_epoch_total - limit > EPSILON {
                            return Err(ApiError::bad_request(
                                "epoch_cap_exceeded",
                                "epoch advance cap exceeded",
                            ));
                        }
                    }
                    (proposed_wallet_total, proposed_epoch_total)
                }
                TradeDirection::Buyback => (
                    (current_wallet_total - amount_usdc).max(0.0),
                    (totals.total - amount_usdc).max(0.0),
                ),
            };

            if new_wallet_total > EPSILON {
                totals
                    .wallet_totals
                    .insert(wallet_key.clone(), round_six(new_wallet_total));
            } else {
                totals.wallet_totals.remove(&wallet_key);
            }
            totals.total = round_six(new_epoch_total);

            let wallet_used = totals
                .wallet_totals
                .get(&wallet_key)
                .copied()
                .unwrap_or(0.0);
            let epoch_used = totals.total;
            let should_prune = totals.wallet_totals.is_empty() && totals.total <= EPSILON;

            (wallet_used, epoch_used, should_prune)
        };

        if should_prune_epoch {
            self.epochs.remove(&epoch_key);
        }

        Ok(AdvanceCapSnapshot::new(wallet_used, epoch_used, limits))
    }
}

#[derive(Default)]
struct EpochTotals {
    total: f64,
    wallet_totals: HashMap<String, f64>,
}

fn build_quote(
    market: &str,
    size_yt: f64,
    side: QuoteSide,
    maturity_ts: i64,
    implied_apr: f64,
    ttl: Duration,
) -> QuoteRecord {
    let now = Utc::now();
    let expires_at = now + ttl;
    let apr = if implied_apr.is_finite() {
        implied_apr.max(0.0)
    } else {
        0.0
    };

    let seconds_to_maturity = (maturity_ts - now.timestamp()).max(0);
    let period_fraction = if seconds_to_maturity == 0 {
        15.0 / 365.0
    } else {
        ((seconds_to_maturity as f64) / 86_400.0 / 365.0).clamp(1.0 / 365.0, 0.5)
    };

    let base_price = size_yt * apr * period_fraction;

    let (adjusted_price, slippage_raw) = match side {
        QuoteSide::Sell => {
            let price = base_price * (1.0 - 0.0015);
            let slip = 0.002 + (size_yt / 100_000.0).min(0.01);
            (price, slip)
        }
        QuoteSide::Buyback => {
            let price = base_price * (1.0 + 0.0025);
            let slip = 0.003 + (size_yt / 120_000.0).min(0.012);
            (price, slip)
        }
    };

    let price_usdc = round_six(adjusted_price.max(0.0));
    let slippage = round_six(slippage_raw.max(0.0));
    let key = QuoteCache::compose_key(market, side, maturity_ts, size_yt);
    let cursor = format!("{}:{}:{}", market, side.as_str(), now.timestamp_millis());

    QuoteRecord {
        id: Uuid::new_v4().to_string(),
        key,
        market: market.to_string(),
        size_yt,
        price_usdc,
        implied_apr: round_six(apr),
        est_slippage: slippage,
        route: QuoteRoute::Rfq,
        side,
        maturity_ts,
        cursor,
        expires_at,
    }
}
