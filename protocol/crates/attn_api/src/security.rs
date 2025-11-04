use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, HeaderValue};
use dashmap::DashMap;
use rand::{distributions::Alphanumeric, Rng};

const API_KEY_HEADER: &str = "x-api-key";
const CSRF_HEADER: &str = "x-attn-client";
const DEFAULT_CSRF_TOKEN: &str = "attn-dapp";

#[derive(Debug, Clone)]
pub struct SecurityConfig {
    pub api_keys: HashMap<String, String>,
    pub ip_allowlist: Option<HashSet<String>>,
    pub wallet_allowlist: Option<HashSet<String>>,
    pub admin_keys: HashSet<String>,
    pub csrf_token: String,
    pub per_ip_limit: u32,
    pub per_wallet_limit: u32,
    pub rate_limit_window: Duration,
    pub nonce_ttl: Duration,
}

#[derive(Debug, Clone)]
pub struct AuthenticatedClient {
    pub api_key_id: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone)]
pub struct SecurityState {
    inner: Arc<SecurityInner>,
}

#[derive(Debug)]
struct SecurityInner {
    config: SecurityConfig,
    rate_ip: DashMap<String, RateWindow>,
    rate_wallet: DashMap<String, RateWindow>,
}

#[derive(Debug, Clone)]
struct RateWindow {
    count: u32,
    reset_at: Instant,
}

impl SecurityState {
    pub fn new(config: SecurityConfig) -> Self {
        let inner = SecurityInner {
            config,
            rate_ip: DashMap::new(),
            rate_wallet: DashMap::new(),
        };
        Self {
            inner: Arc::new(inner),
        }
    }

    pub fn authenticate(
        &self,
        headers: &HeaderMap,
        remote_ip: Option<IpAddr>,
    ) -> Result<AuthenticatedClient> {
        let key = extract_api_key(headers)?;
        let Some((key_id, _stored)) = self
            .inner
            .config
            .api_keys
            .iter()
            .find(|(_, value)| value == &&key)
        else {
            return Err(anyhow!("invalid api key"));
        };

        if let Some(allowlist) = &self.inner.config.ip_allowlist {
            if let Some(ip) = remote_ip {
                let ip_str = ip.to_string();
                if !allowlist.contains(&ip_str) {
                    return Err(anyhow!("ip_not_allowed"));
                }
            }
        }

        let token = headers
            .get(CSRF_HEADER)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("");
        if token != self.inner.config.csrf_token {
            return Err(anyhow!("invalid_csrf_token"));
        }

        let is_admin = self.inner.config.admin_keys.contains(key_id);

        Ok(AuthenticatedClient {
            api_key_id: key_id.clone(),
            is_admin,
        })
    }

    pub fn enforce_wallet_allowlist(&self, wallet: &str) -> Result<()> {
        if let Some(allowlist) = &self.inner.config.wallet_allowlist {
            if !allowlist.contains(&wallet.to_lowercase()) {
                return Err(anyhow!("wallet_not_allowed"));
            }
        }
        Ok(())
    }

    pub fn check_rate_limits(&self, wallet: &str, remote_ip: Option<IpAddr>) -> Result<()> {
        let now = Instant::now();
        if let Some(ip) = remote_ip {
            self.bump(
                &self.inner.rate_ip,
                &ip.to_string(),
                self.inner.config.per_ip_limit,
                now,
            )?;
        }
        self.bump(
            &self.inner.rate_wallet,
            &wallet.to_lowercase(),
            self.inner.config.per_wallet_limit,
            now,
        )?;
        Ok(())
    }

    pub fn nonce_ttl(&self) -> Duration {
        self.inner.config.nonce_ttl
    }
}

impl SecurityState {
    fn bump(
        &self,
        map: &DashMap<String, RateWindow>,
        key: &str,
        limit: u32,
        now: Instant,
    ) -> Result<()> {
        if limit == 0 {
            return Ok(());
        }
        let window = self.inner.config.rate_limit_window;
        let mut entry = map.entry(key.to_string()).or_insert_with(|| RateWindow {
            count: 0,
            reset_at: now + window,
        });
        if now >= entry.reset_at {
            entry.count = 0;
            entry.reset_at = now + window;
        }
        entry.count += 1;
        if entry.count > limit {
            return Err(anyhow!("rate_limited"));
        }
        Ok(())
    }
}

fn extract_api_key(headers: &HeaderMap) -> Result<String> {
    if let Some(value) = headers.get(API_KEY_HEADER) {
        let key = value
            .to_str()
            .map_err(|_| anyhow!("invalid api key header"))?;
        if key.is_empty() {
            return Err(anyhow!("api key required"));
        }
        return Ok(key.to_string());
    }
    if let Some(value) = headers.get(AUTHORIZATION) {
        let token = value
            .to_str()
            .map_err(|_| anyhow!("invalid authorization header"))?;
        if let Some(raw) = token.strip_prefix("Bearer ") {
            if raw.is_empty() {
                return Err(anyhow!("api key required"));
            }
            return Ok(raw.to_string());
        }
    }
    Err(anyhow!("api key required"))
}

pub fn parse_api_keys(raw: Option<String>) -> Result<HashMap<String, String>> {
    let mut map = HashMap::new();
    if let Some(raw) = raw {
        for entry in raw.split(',') {
            let entry = entry.trim();
            if entry.is_empty() {
                continue;
            }
            let (id, key) = entry
                .split_once(':')
                .context("api key entries must be id:key")?;
            if id.is_empty() || key.is_empty() {
                return Err(anyhow!("api key entries must provide id and key"));
            }
            map.insert(id.trim().to_string(), key.trim().to_string());
        }
    }
    Ok(map)
}

pub fn parse_allowlist_values(raw: Option<String>) -> Option<HashSet<String>> {
    let values: HashSet<String> = raw
        .unwrap_or_default()
        .split(',')
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
        .collect();
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

pub fn generate_nonce(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

pub fn default_security_config() -> SecurityConfig {
    SecurityConfig {
        api_keys: HashMap::new(),
        ip_allowlist: None,
        wallet_allowlist: None,
        admin_keys: HashSet::new(),
        csrf_token: DEFAULT_CSRF_TOKEN.to_string(),
        per_ip_limit: 30,
        per_wallet_limit: 10,
        rate_limit_window: Duration::from_secs(60),
        nonce_ttl: Duration::from_secs(300),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn config_with_key() -> SecurityConfig {
        let mut cfg = default_security_config();
        cfg.api_keys
            .insert("test".to_string(), "secret".to_string());
        cfg
    }

    #[test]
    fn parse_api_keys_accepts_multiple_pairs() {
        let parsed = parse_api_keys(Some("a:1,b:2".to_string())).unwrap();
        assert_eq!(parsed.get("a"), Some(&"1".to_string()));
        assert_eq!(parsed.get("b"), Some(&"2".to_string()));
    }

    #[test]
    fn rate_limits_roll_over_after_window() {
        let mut cfg = config_with_key();
        cfg.per_wallet_limit = 1;
        cfg.rate_limit_window = Duration::from_millis(10);
        let security = SecurityState::new(cfg);
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("secret"));
        headers.insert(CSRF_HEADER, HeaderValue::from_static(DEFAULT_CSRF_TOKEN));
        let client = security.authenticate(&headers, None).unwrap();
        assert!(!client.is_admin);
        security.check_rate_limits("wallet", None).unwrap();
        assert!(security.check_rate_limits("wallet", None).is_err());
        std::thread::sleep(Duration::from_millis(11));
        security.check_rate_limits("wallet", None).unwrap();
    }

    #[test]
    fn admin_keys_are_detected() {
        let mut cfg = config_with_key();
        cfg.admin_keys.insert("test".to_string());
        let security = SecurityState::new(cfg);
        let mut headers = HeaderMap::new();
        headers.insert(API_KEY_HEADER, HeaderValue::from_static("secret"));
        headers.insert(CSRF_HEADER, HeaderValue::from_static(DEFAULT_CSRF_TOKEN));
        let client = security.authenticate(&headers, None).unwrap();
        assert!(client.is_admin);
    }
}
