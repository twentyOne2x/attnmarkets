use std::collections::BTreeSet;
use std::env;
use std::fmt;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, QueryBuilder, Row};
use uuid::Uuid;

use crate::kms::{HttpKmsClient, KmsSigner};
use solana_client::client_error::ClientErrorKind;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_client::rpc_request::RpcError;
use solana_sdk::{commitment_config::CommitmentConfig, pubkey::Pubkey, signature::Signature};

#[derive(Debug, Clone)]
pub struct SquadsService {
    inner: Arc<SquadsInner>,
}

#[derive(Debug, Clone)]
struct SquadsInner {
    mode: SquadsMode,
    default_attn_wallet: String,
    default_cluster: String,
    default_threshold: u8,
    default_name_prefix: String,
    payer_wallet: Option<String>,
    api_keys: Arc<Vec<String>>,
    config_digest: String,
    rpc: Option<RpcSanity>,
    status_sync_enabled: bool,
    kms_signer: Option<Arc<KmsSigner<HttpKmsClient>>>,
    kms_payer: Option<Arc<KmsSigner<HttpKmsClient>>>,
}

#[derive(Debug, Clone)]
enum SquadsMode {
    Local,
    Http(HttpMode),
}

#[derive(Debug, Clone)]
struct HttpMode {
    client: Client,
    base_url: String,
    api_keys: Arc<Vec<String>>,
}

#[derive(Clone)]
struct RpcSanity {
    client: Arc<RpcClient>,
    strict: bool,
    cluster: String,
}

impl fmt::Debug for RpcSanity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RpcSanity")
            .field("strict", &self.strict)
            .field("cluster", &self.cluster)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SquadsModeKind {
    Local,
    Http,
}

impl SquadsModeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SquadsModeKind::Local => "local",
            SquadsModeKind::Http => "http",
        }
    }
}

fn is_account_not_found(kind: &ClientErrorKind) -> bool {
    match kind {
        ClientErrorKind::RpcError(RpcError::ForUser(message)) => {
            message.contains("AccountNotFound")
        }
        ClientErrorKind::RpcError(RpcError::RpcResponseError { message, .. }) => {
            message.contains("AccountNotFound")
        }
        _ => false,
    }
}

#[derive(Debug, Clone)]
pub struct SquadsConfig {
    pub base_url: Option<String>,
    pub api_keys: Vec<String>,
    pub default_attn_wallet: String,
    pub default_cluster: String,
    pub default_threshold: u8,
    pub default_name_prefix: String,
    pub payer_wallet: Option<String>,
    pub rpc_url: Option<String>,
    pub rpc_strict: bool,
    pub expected_config_digest: Option<String>,
    pub config_digest: String,
    pub status_sync_enabled: bool,
    pub kms_signer_resource: Option<String>,
    pub kms_payer_resource: Option<String>,
}

impl SquadsConfig {
    pub fn from_env() -> Result<Option<Self>> {
        let parse_flag = |key: &str| {
            env::var(key).ok().map(|value| {
                matches!(
                    value.trim().to_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
        };
        let enabled = parse_flag("ATTN_ENABLE_SQUADS")
            .or_else(|| parse_flag("ATTN_API_SQUADS_ENABLED"))
            .unwrap_or(false);

        if !enabled {
            return Ok(None);
        }

        let status_sync_enabled = parse_flag("ATTN_ENABLE_SQUADS_STATUS_SYNC")
            .or_else(|| parse_flag("ATTN_API_SQUADS_STATUS_SYNC_ENABLED"))
            .unwrap_or(false);

        let base_url = env::var("ATTN_API_SQUADS_BASE_URL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let mut api_keys: Vec<String> = env::var("ATTN_API_SQUADS_API_KEYS")
            .ok()
            .into_iter()
            .flat_map(|raw| {
                raw.split(',')
                    .map(|value| value.trim().to_string())
                    .collect::<Vec<_>>()
                    .into_iter()
            })
            .filter(|value| !value.is_empty())
            .collect();
        if let Some(primary) = env::var("ATTN_API_SQUADS_API_KEY")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            api_keys.insert(0, primary);
        }
        if api_keys.len() > 1 {
            let mut dedup = BTreeSet::new();
            api_keys.retain(|value| dedup.insert(value.clone()));
        }
        let default_attn_wallet = env::var("ATTN_API_SQUADS_DEFAULT_MEMBER")
            .unwrap_or_else(|_| "Attn111111111111111111111111111111111111111".to_string())
            .trim()
            .to_string();
        if !is_valid_pubkey(&default_attn_wallet) {
            return Err(anyhow!(
                "ATTN_API_SQUADS_DEFAULT_MEMBER must be a valid Solana address"
            ));
        }
        let default_cluster = env::var("ATTN_API_SQUADS_CLUSTER")
            .unwrap_or_else(|_| "mainnet-beta".to_string())
            .trim()
            .to_string();
        let default_threshold = env::var("ATTN_API_SQUADS_THRESHOLD")
            .ok()
            .and_then(|value| value.parse::<u8>().ok())
            .unwrap_or(2)
            .max(1);
        let default_name_prefix =
            env::var("ATTN_API_SQUADS_SAFE_PREFIX").unwrap_or_else(|_| "CreatorVault-".to_string());
        let payer_wallet = env::var("ATTN_API_SQUADS_PAYER")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if let Some(payer) = payer_wallet.as_ref() {
            if !is_valid_pubkey(payer) {
                return Err(anyhow!(
                    "ATTN_API_SQUADS_PAYER must be a valid Solana address"
                ));
            }
        }
        let rpc_url = env::var("ATTN_API_SQUADS_RPC_URL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let rpc_strict = env::var("ATTN_API_SQUADS_RPC_STRICT")
            .ok()
            .map(|value| {
                matches!(
                    value.trim().to_lowercase().as_str(),
                    "1" | "true" | "yes" | "on"
                )
            })
            .unwrap_or(false);
        let expected_config_digest = env::var("ATTN_API_SQUADS_CONFIG_DIGEST")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let kms_signer_resource = env::var("ATTN_KMS_SIGNER_KEY")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let kms_payer_resource = env::var("ATTN_KMS_PAYER_KEY")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let config_digest = compute_config_digest(
            base_url.as_deref(),
            &default_attn_wallet,
            &default_cluster,
            default_threshold,
            &default_name_prefix,
            payer_wallet.as_deref(),
            rpc_url.as_deref(),
            status_sync_enabled,
            &api_keys,
            kms_signer_resource.as_deref(),
            kms_payer_resource.as_deref(),
        );
        if let Some(expected) = expected_config_digest.as_ref() {
            if expected != &config_digest {
                return Err(anyhow!(
                    "Squads configuration digest mismatch (expected {}, got {})",
                    expected,
                    config_digest
                ));
            }
        }

        Ok(Some(Self {
            base_url,
            api_keys,
            default_attn_wallet,
            default_cluster,
            default_threshold,
            default_name_prefix,
            payer_wallet,
            rpc_url,
            rpc_strict,
            expected_config_digest,
            config_digest,
            status_sync_enabled,
            kms_signer_resource,
            kms_payer_resource,
        }))
    }
}

#[derive(Debug, Clone)]
pub struct CreateSafeInput {
    pub creator_wallet: String,
    pub attn_wallet: String,
    pub safe_name: Option<String>,
    pub cluster: String,
    pub threshold: u8,
    pub contact_email: Option<String>,
    pub note: Option<String>,
}

impl CreateSafeInput {
    pub fn from_record(record: &SafeRequestRecord) -> Self {
        Self {
            creator_wallet: record.creator_wallet.clone(),
            attn_wallet: record.attn_wallet.clone(),
            safe_name: record.safe_name.clone(),
            cluster: record.cluster.clone(),
            threshold: record.threshold.max(0).min(u8::MAX as i16) as u8,
            contact_email: record.contact_email.clone(),
            note: record.note.clone(),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct CreateSafeResult {
    pub request_id: String,
    pub safe_address: String,
    pub transaction_url: Option<String>,
    pub cluster: String,
    pub threshold: u8,
    pub members: Vec<String>,
    pub raw_response: Value,
    pub mode: SquadsModeKind,
    pub status_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RpcSanityOutcome {
    pub missing_accounts: Vec<String>,
    pub strict: bool,
    pub cluster: String,
}

#[derive(Debug, Clone)]
pub struct SafeStatusResult {
    pub status: Option<String>,
    pub safe_address: Option<String>,
    pub transaction_url: Option<String>,
    pub raw_response: Value,
}

impl SquadsService {
    pub async fn new(config: SquadsConfig) -> Result<Self> {
        let base_url = config
            .base_url
            .as_deref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty());

        let api_keys = Arc::new(config.api_keys.clone());
        let mode = match base_url {
            Some(url) if url != "local" => {
                let client = Client::builder()
                    .user_agent("attn_api/0.1")
                    .build()
                    .context("build squads http client")?;
                SquadsMode::Http(HttpMode {
                    client,
                    base_url: url.trim_end_matches('/').to_string(),
                    api_keys: api_keys.clone(),
                })
            }
            _ => SquadsMode::Local,
        };
        let rpc = if let Some(url) = config.rpc_url.as_ref() {
            let client = Arc::new(RpcClient::new_with_commitment(
                url.clone(),
                CommitmentConfig::confirmed(),
            ));
            Some(RpcSanity {
                client,
                strict: config.rpc_strict,
                cluster: config.default_cluster.clone(),
            })
        } else {
            None
        };
        let kms_signer = if let Some(resource) = config.kms_signer_resource.as_ref() {
            Some(Arc::new(
                KmsSigner::google_cloud(resource.clone())
                    .await
                    .context("initialize kms signer")?,
            ))
        } else {
            None
        };
        let kms_payer = if let Some(resource) = config.kms_payer_resource.as_ref() {
            Some(Arc::new(
                KmsSigner::google_cloud(resource.clone())
                    .await
                    .context("initialize kms payer signer")?,
            ))
        } else {
            None
        };
        let inner = SquadsInner {
            mode,
            default_attn_wallet: config.default_attn_wallet,
            default_cluster: config.default_cluster,
            default_threshold: config.default_threshold.max(1),
            default_name_prefix: config.default_name_prefix,
            payer_wallet: config.payer_wallet,
            api_keys,
            config_digest: config.config_digest,
            rpc,
            status_sync_enabled: config.status_sync_enabled,
            kms_signer,
            kms_payer,
        };

        Ok(Self {
            inner: Arc::new(inner),
        })
    }

    pub fn default_attn_wallet(&self) -> &str {
        &self.inner.default_attn_wallet
    }

    pub fn status_sync_enabled(&self) -> bool {
        self.inner.status_sync_enabled
    }

    pub fn default_cluster(&self) -> &str {
        &self.inner.default_cluster
    }

    pub fn payer_wallet(&self) -> Option<&str> {
        self.inner.payer_wallet.as_deref()
    }

    pub fn attn_signer(&self) -> Option<Arc<KmsSigner<HttpKmsClient>>> {
        self.inner.kms_signer.as_ref().map(Arc::clone)
    }

    pub fn payer_signer(&self) -> Option<Arc<KmsSigner<HttpKmsClient>>> {
        self.inner.kms_payer.as_ref().map(Arc::clone)
    }

    pub fn default_threshold(&self) -> u8 {
        self.inner.default_threshold
    }

    pub fn config_digest(&self) -> &str {
        &self.inner.config_digest
    }

    pub fn default_safe_name(&self, creator_wallet: &str) -> String {
        let prefix = &self.inner.default_name_prefix;
        let short = creator_wallet.chars().take(6).collect::<String>();
        format!("{}{}", prefix, short)
    }

    pub async fn sign_with_attn(&self, message: &[u8]) -> Result<Signature> {
        let signer = self
            .inner
            .kms_signer
            .as_ref()
            .ok_or_else(|| anyhow!("ATTN_KMS_SIGNER_KEY not configured"))?;
        signer.sign(message).await
    }

    pub async fn sign_with_payer(&self, message: &[u8]) -> Result<Option<Signature>> {
        match self.inner.kms_payer.as_ref() {
            Some(signer) => Ok(Some(signer.sign(message).await?)),
            None => Ok(None),
        }
    }

    pub fn attn_kms_configured(&self) -> bool {
        self.inner.kms_signer.is_some()
    }

    pub fn payer_kms_configured(&self) -> bool {
        self.inner.kms_payer.is_some()
    }

    pub async fn check_wallets_on_chain(
        &self,
        cluster: &str,
        wallets: &[String],
    ) -> Result<Option<RpcSanityOutcome>> {
        let Some(rpc) = &self.inner.rpc else {
            return Ok(None);
        };
        if rpc.cluster != cluster {
            return Ok(None);
        }
        let mut missing = Vec::new();
        for wallet in wallets {
            let pubkey = Pubkey::from_str(wallet)
                .map_err(|_| anyhow!("wallet {} failed base58 decoding", wallet))?;
            match rpc.client.get_account(&pubkey).await {
                Ok(_) => {}
                Err(err) => {
                    if is_account_not_found(err.kind()) {
                        missing.push(wallet.clone());
                        continue;
                    }
                    match err.kind() {
                        ClientErrorKind::RpcError(_) => {
                            if rpc.strict {
                                return Err(anyhow!("rpc error checking {}: {}", wallet, err));
                            } else {
                                missing.push(wallet.clone());
                            }
                        }
                        _ => {
                            return Err(anyhow!("rpc transport error: {}", err));
                        }
                    }
                }
            }
        }

        Ok(Some(RpcSanityOutcome {
            missing_accounts: missing,
            strict: rpc.strict,
            cluster: rpc.cluster.clone(),
        }))
    }

    pub async fn verify_safe_account(
        &self,
        cluster: &str,
        safe_address: &str,
    ) -> Result<Option<bool>> {
        let Some(rpc) = &self.inner.rpc else {
            return Ok(None);
        };
        if rpc.cluster != cluster {
            return Ok(None);
        }
        let pubkey = Pubkey::from_str(safe_address)
            .map_err(|_| anyhow!("safe_address {} failed base58 decoding", safe_address))?;
        match rpc.client.get_account(&pubkey).await {
            Ok(_) => Ok(Some(true)),
            Err(err) => {
                if is_account_not_found(err.kind()) {
                    if rpc.strict {
                        Err(anyhow!(
                            "safe {} missing from cluster {}",
                            safe_address,
                            cluster
                        ))
                    } else {
                        Ok(Some(false))
                    }
                } else {
                    match err.kind() {
                        ClientErrorKind::RpcError(_) => Err(anyhow!(
                            "rpc error verifying safe {}: {}",
                            safe_address,
                            err
                        )),
                        _ => Err(anyhow!(
                            "rpc transport error verifying safe {}: {}",
                            safe_address,
                            err
                        )),
                    }
                }
            }
        }
    }

    pub async fn fetch_status(&self, status_url: &str) -> Result<SafeStatusResult> {
        match &self.inner.mode {
            SquadsMode::Local => Ok(SafeStatusResult {
                status: Some("ready".to_string()),
                safe_address: None,
                transaction_url: None,
                raw_response: json!({
                    "mode": "local",
                    "status": "ready",
                }),
            }),
            SquadsMode::Http(http) => {
                let mut request = http.client.get(status_url);
                if let Some(api_key) = http.api_keys.first() {
                    request = request.bearer_auth(api_key);
                }
                let response = request
                    .send()
                    .await
                    .with_context(|| format!("send squads status request to {}", status_url))?;
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .context("read squads status response body")?;
                if !status.is_success() {
                    return Err(anyhow!(
                        "squads status {} returned {}: {}",
                        status_url,
                        status,
                        body
                    ));
                }
                let raw: Value =
                    serde_json::from_str(&body).unwrap_or_else(|_| json!({ "raw": body }));
                let status_value = extract_status(&raw);
                let safe_address = extract_string(
                    &raw,
                    &[
                        &["safe", "address"],
                        &["data", "safe", "address"],
                        &["safeAddress"],
                        &["safe_address"],
                        &["address"],
                        &["multisig", "address"],
                        &["squad", "address"],
                    ],
                );
                let transaction_url = extract_string(
                    &raw,
                    &[
                        &["transaction", "explorerUrl"],
                        &["transaction", "url"],
                        &["transactionUrl"],
                        &["transaction_url"],
                        &["explorer", "url"],
                    ],
                );
                Ok(SafeStatusResult {
                    status: status_value,
                    safe_address,
                    transaction_url,
                    raw_response: raw,
                })
            }
        }
    }

    pub async fn create_safe(&self, mut input: CreateSafeInput) -> Result<CreateSafeResult> {
        if input.safe_name.is_none() {
            input.safe_name = Some(self.default_safe_name(&input.creator_wallet));
        }

        if input.threshold == 0 {
            input.threshold = self.inner.default_threshold;
        }

        let request_id = Uuid::new_v4().to_string();
        let members = vec![input.creator_wallet.clone(), input.attn_wallet.clone()];

        match &self.inner.mode {
            SquadsMode::Local => Ok(self.create_safe_local(&input, request_id, members)),
            SquadsMode::Http(http) => {
                self.create_safe_http(http, &input, request_id, members)
                    .await
            }
        }
    }

    fn create_safe_local(
        &self,
        input: &CreateSafeInput,
        request_id: String,
        members: Vec<String>,
    ) -> CreateSafeResult {
        let safe_address = generate_deterministic_address(
            &input.creator_wallet,
            &input.attn_wallet,
            &input.cluster,
        );

        let raw_response = json!({
            "mode": "local",
            "request_id": request_id,
            "safe_address": safe_address,
            "members": members,
            "cluster": input.cluster,
            "threshold": input.threshold,
            "note": input.note,
            "contact_email": input.contact_email,
        });

        CreateSafeResult {
            request_id,
            safe_address,
            transaction_url: None,
            cluster: input.cluster.clone(),
            threshold: input.threshold,
            members,
            raw_response,
            mode: self.current_mode(),
            status_url: None,
        }
    }

    async fn create_safe_http(
        &self,
        http: &HttpMode,
        input: &CreateSafeInput,
        request_id: String,
        members: Vec<String>,
    ) -> Result<CreateSafeResult> {
        let url = format!("{}/squads", http.base_url);
        let payload = HttpCreateSafeRequest::from_input(input.clone());

        let mut request = http.client.post(url);
        if let Some(api_key) = http.api_keys.first() {
            request = request.bearer_auth(api_key);
        }
        request = request.json(&payload);

        let response = request.send().await.context("send squads create request")?;
        let status = response.status();
        let body = response.text().await.context("read squads response body")?;

        if !status.is_success() {
            return Err(anyhow!("squads api returned {}: {}", status, body));
        }

        let raw_response: Value =
            serde_json::from_str(&body).unwrap_or_else(|_| json!({ "raw": body }));
        let safe_address = extract_string(
            &raw_response,
            &[
                &["safe", "address"],
                &["data", "safe", "address"],
                &["safeAddress"],
                &["safe_address"],
                &["address"],
                &["multisig", "address"],
                &["squad", "address"],
            ],
        )
        .unwrap_or_else(|| {
            generate_deterministic_address(
                &input.creator_wallet,
                &input.attn_wallet,
                &input.cluster,
            )
        });

        let transaction_url = extract_string(
            &raw_response,
            &[
                &["transaction", "explorerUrl"],
                &["transaction", "url"],
                &["transactionUrl"],
                &["transaction_url"],
                &["explorer", "url"],
            ],
        );

        let status_url = extract_string(
            &raw_response,
            &[&["status", "url"], &["links", "status"], &["status_url"]],
        );

        Ok(CreateSafeResult {
            request_id,
            safe_address,
            transaction_url,
            cluster: input.cluster.clone(),
            threshold: input.threshold,
            members,
            raw_response,
            mode: self.current_mode(),
            status_url,
        })
    }
}

impl SquadsService {
    pub fn current_mode(&self) -> SquadsModeKind {
        match self.inner.mode {
            SquadsMode::Local => SquadsModeKind::Local,
            SquadsMode::Http(_) => SquadsModeKind::Http,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct HttpCreateSafeRequest {
    name: String,
    threshold: u8,
    members: Vec<HttpMember>,
    cluster: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<HttpMetadata>,
}

impl HttpCreateSafeRequest {
    fn from_input(input: CreateSafeInput) -> Self {
        Self {
            name: input.safe_name.unwrap_or_else(|| {
                format!(
                    "CreatorVault-{}",
                    input.creator_wallet.chars().take(6).collect::<String>()
                )
            }),
            threshold: input.threshold,
            members: vec![
                HttpMember {
                    address: input.creator_wallet,
                    role: "member".to_string(),
                },
                HttpMember {
                    address: input.attn_wallet,
                    role: "member".to_string(),
                },
            ],
            cluster: input.cluster,
            metadata: HttpMetadata::from_optional_fields(input.contact_email, input.note),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct HttpMember {
    address: String,
    role: String,
}

#[derive(Debug, Clone, Serialize)]
struct HttpMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    contact_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

impl HttpMetadata {
    fn from_optional_fields(contact_email: Option<String>, note: Option<String>) -> Option<Self> {
        if contact_email.is_none() && note.is_none() {
            None
        } else {
            Some(Self {
                contact_email,
                note,
            })
        }
    }
}

fn extract_string(value: &Value, paths: &[&[&str]]) -> Option<String> {
    for path in paths {
        let mut current = value;
        let mut found = true;
        for segment in *path {
            match current.get(segment) {
                Some(next) => current = next,
                None => {
                    found = false;
                    break;
                }
            }
        }
        if found {
            if let Some(result) = current.as_str() {
                if !result.is_empty() {
                    return Some(result.to_string());
                }
            }
        }
    }
    None
}

fn extract_status(value: &Value) -> Option<String> {
    extract_string(
        value,
        &[
            &["status", "state"],
            &["status", "value"],
            &["status", "status"],
            &["status"],
            &["data", "status"],
            &["result", "status"],
            &["state"],
        ],
    )
    .map(|raw| raw.to_lowercase())
}

fn generate_deterministic_address(creator: &str, attn: &str, cluster: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"attn-squads-local");
    hasher.update(creator.as_bytes());
    hasher.update(attn.as_bytes());
    hasher.update(cluster.as_bytes());
    let digest = hasher.finalize();
    bs58::encode(digest).into_string()
}

pub fn is_valid_pubkey(value: &str) -> bool {
    const BASE58_ALPHABET: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let len = value.len();
    if !(32..=44).contains(&len) {
        return false;
    }
    value
        .chars()
        .all(|ch| BASE58_ALPHABET.chars().any(|valid| valid == ch))
}

pub fn sanitize_wallet(value: &str) -> String {
    value.trim().to_string()
}

fn hash_json(value: &Value) -> String {
    let mut hasher = Sha256::new();
    let serialized = serde_json::to_vec(value).unwrap_or_default();
    hasher.update(serialized);
    hex::encode(hasher.finalize())
}

fn hash_secret(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hex::encode(hasher.finalize())
}

fn compute_config_digest(
    base_url: Option<&str>,
    attn_wallet: &str,
    cluster: &str,
    threshold: u8,
    name_prefix: &str,
    payer_wallet: Option<&str>,
    rpc_url: Option<&str>,
    status_sync_enabled: bool,
    api_keys: &[String],
    kms_signer_resource: Option<&str>,
    kms_payer_resource: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    if let Some(url) = base_url {
        hasher.update(url.as_bytes());
    }
    hasher.update(attn_wallet.as_bytes());
    hasher.update(cluster.as_bytes());
    hasher.update(&[threshold]);
    hasher.update(name_prefix.as_bytes());
    if let Some(payer) = payer_wallet {
        hasher.update(payer.as_bytes());
    }
    if let Some(rpc) = rpc_url {
        hasher.update(rpc.as_bytes());
    }
    hasher.update(&[status_sync_enabled as u8]);
    if let Some(resource) = kms_signer_resource {
        hasher.update(resource.as_bytes());
    }
    if let Some(resource) = kms_payer_resource {
        hasher.update(resource.as_bytes());
    }
    let mut hashed_keys: Vec<String> = api_keys.iter().map(|key| hash_secret(key)).collect();
    hashed_keys.sort();
    for key in hashed_keys {
        hasher.update(key.as_bytes());
    }
    hex::encode(hasher.finalize())
}

#[derive(Debug, Clone)]
pub struct SquadsSafeRepository {
    pool: PgPool,
}

#[derive(Debug, Clone)]
pub struct StatusSyncUpdate {
    pub safe_address: Option<String>,
    pub transaction_url: Option<String>,
    pub status_payload: Value,
    pub status_hash: String,
}

const STATUS_ERROR_MAX_LEN: usize = 512;

impl StatusSyncUpdate {
    pub fn from_status(result: &SafeStatusResult) -> Self {
        Self {
            safe_address: result.safe_address.clone(),
            transaction_url: result.transaction_url.clone(),
            status_payload: result.raw_response.clone(),
            status_hash: hash_json(&result.raw_response),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SafeRequestFilter {
    pub status: Option<String>,
    pub creator_wallet: Option<String>,
    pub attn_wallet: Option<String>,
    pub cluster: Option<String>,
    pub before: Option<DateTime<Utc>>,
    pub limit: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct SafeRequestRecord {
    pub id: Uuid,
    pub idempotency_key: Option<String>,
    pub creator_wallet: String,
    pub attn_wallet: String,
    pub cluster: String,
    pub threshold: i16,
    pub safe_name: Option<String>,
    pub contact_email: Option<String>,
    pub note: Option<String>,
    pub status: SafeStatus,
    pub safe_address: Option<String>,
    pub transaction_url: Option<String>,
    pub status_url: Option<String>,
    pub members: Value,
    pub raw_response: Option<Value>,
    pub raw_response_hash: Option<String>,
    pub status_last_checked_at: Option<DateTime<Utc>>,
    pub status_last_response: Option<Value>,
    pub status_last_response_hash: Option<String>,
    pub status_sync_error: Option<String>,
    pub request_payload: Value,
    pub requester_api_key: Option<String>,
    pub requester_wallet: String,
    pub requester_ip: Option<String>,
    pub creator_signature: String,
    pub nonce: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub attempt_count: i32,
    pub last_attempt_at: DateTime<Utc>,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub creator_vault: Option<String>,
    pub governance_creator_signature: Option<String>,
    pub governance_attn_signature: Option<String>,
    pub governance_linked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "squads_safe_status", rename_all = "lowercase")]
pub enum SafeStatus {
    Pending,
    Submitted,
    Ready,
    Failed,
}

impl SafeStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SafeStatus::Pending => "pending",
            SafeStatus::Submitted => "submitted",
            SafeStatus::Ready => "ready",
            SafeStatus::Failed => "failed",
        }
    }
}

impl fmt::Display for SafeStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct NewSafeRequest {
    pub request_id: Uuid,
    pub idempotency_key: Option<String>,
    pub creator_wallet: String,
    pub attn_wallet: String,
    pub cluster: String,
    pub threshold: u8,
    pub safe_name: Option<String>,
    pub contact_email: Option<String>,
    pub note: Option<String>,
    pub members: Vec<String>,
    pub request_payload: Value,
    pub requester_api_key: Option<String>,
    pub requester_wallet: String,
    pub requester_ip: Option<IpAddr>,
    pub creator_signature: String,
    pub nonce: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct NonceRecord {
    pub wallet: String,
    pub nonce: String,
    pub expires_at: DateTime<Utc>,
}

impl SquadsSafeRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn issue_nonce(&self, wallet: &str, ttl: ChronoDuration) -> Result<NonceRecord> {
        let nonce = crate::security::generate_nonce(48);
        let expires_at = Utc::now() + ttl;
        let row = sqlx::query(
            "insert into squads_safe_nonces (wallet, nonce, expires_at) values ($1, $2, $3)\n             on conflict (wallet) do update set nonce = excluded.nonce, expires_at = excluded.expires_at, created_at = now()\n             returning wallet, nonce, expires_at",
        )
        .bind(wallet)
        .bind(&nonce)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(NonceRecord {
            wallet: row.get("wallet"),
            nonce: row.get("nonce"),
            expires_at: row.get("expires_at"),
        })
    }

    pub async fn consume_nonce(&self, wallet: &str, nonce: &str) -> Result<Option<NonceRecord>> {
        let row = sqlx::query(
            "delete from squads_safe_nonces where wallet = $1 and nonce = $2 and expires_at > now() returning wallet, nonce, expires_at",
        )
        .bind(wallet)
        .bind(nonce)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| NonceRecord {
            wallet: row.get("wallet"),
            nonce: row.get("nonce"),
            expires_at: row.get("expires_at"),
        }))
    }

    pub async fn find_by_idempotency(&self, key: &str) -> Result<Option<SafeRequestRecord>> {
        let row = sqlx::query("select * from squads_safe_requests where idempotency_key = $1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(row_to_request))
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<SafeRequestRecord>> {
        let row = sqlx::query("select * from squads_safe_requests where id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(row_to_request))
    }

    pub async fn create_pending(
        &self,
        input: NewSafeRequest,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let members = Value::Array(
            input
                .members
                .iter()
                .map(|m| Value::String(m.clone()))
                .collect(),
        );
        let requester_ip = input.requester_ip.map(|ip| ip.to_string());
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "insert into squads_safe_requests (
                id, idempotency_key, creator_wallet, attn_wallet, cluster, threshold, safe_name, contact_email, note,
                status, members, request_payload, requester_api_key, requester_wallet, requester_ip, creator_signature, nonce,
                status_url, status_last_checked_at, status_last_response, status_last_response_hash, status_sync_error,
                attempt_count, last_attempt_at, next_retry_at,
                created_at, updated_at
            ) values (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                'pending', $10, $11, $12, $13, $14::inet, $15, $16,
                null, null, null, null, null,
                1, now(), $17,
                now(), now()
            ) returning *",
        )
        .bind(input.request_id)
        .bind(input.idempotency_key)
        .bind(input.creator_wallet)
        .bind(input.attn_wallet)
        .bind(input.cluster)
        .bind(i32::from(input.threshold))
        .bind(input.safe_name)
        .bind(input.contact_email)
        .bind(input.note)
        .bind(members)
        .bind(input.request_payload)
        .bind(input.requester_api_key)
        .bind(input.requester_wallet)
        .bind(requester_ip)
        .bind(input.creator_signature)
        .bind(input.nonce)
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn update_submission(
        &self,
        request_id: Uuid,
        upstream: &CreateSafeResult,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let raw_response = upstream.raw_response.clone();
        let hash = hash_json(&raw_response);
        let status = if upstream.safe_address.is_empty() {
            "submitted"
        } else {
            "ready"
        };
        let next_retry_at = if status == "submitted" {
            Some(Utc::now() + backoff)
        } else {
            None
        };
        let members = Value::Array(
            upstream
                .members
                .iter()
                .map(|m| Value::String(m.clone()))
                .collect(),
        );
        let row = sqlx::query(
            "update squads_safe_requests set
                status = $2,
                safe_address = $3,
                transaction_url = $4,
                members = $5,
                raw_response = $6,
                raw_response_hash = $7,
                last_attempt_at = now(),
                next_retry_at = $8,
                status_url = $9,
                status_last_checked_at = now(),
                status_last_response = $10,
                status_last_response_hash = $11,
                status_sync_error = null,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(status)
        .bind(if upstream.safe_address.is_empty() {
            None
        } else {
            Some(upstream.safe_address.clone())
        })
        .bind(upstream.transaction_url.clone())
        .bind(members)
        .bind(raw_response.clone())
        .bind(hash.clone())
        .bind(next_retry_at)
        .bind(upstream.status_url.clone())
        .bind(raw_response)
        .bind(hash)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn find_due_status_checks(&self, limit: i64) -> Result<Vec<SafeRequestRecord>> {
        let rows = sqlx::query(
            "select * from squads_safe_requests
             where status = 'submitted'
               and status_url is not null
               and next_retry_at is not null
               and next_retry_at <= now()
             order by next_retry_at asc
             limit $1",
        )
        .bind(limit.max(1))
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(row_to_request).collect())
    }

    pub async fn mark_status_ready(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
    ) -> Result<SafeRequestRecord> {
        let row = sqlx::query(
            "update squads_safe_requests set
                status = 'ready',
                safe_address = coalesce($2, safe_address),
                transaction_url = coalesce($3, transaction_url),
                status_last_checked_at = now(),
                status_last_response = $4,
                status_last_response_hash = $5,
                status_sync_error = null,
                next_retry_at = null,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(update.safe_address.as_ref())
        .bind(update.transaction_url.as_ref())
        .bind(update.status_payload.clone())
        .bind(update.status_hash.clone())
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn mark_status_pending(
        &self,
        request_id: Uuid,
        update: &StatusSyncUpdate,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "update squads_safe_requests set
                status = 'submitted',
                safe_address = coalesce($2, safe_address),
                transaction_url = coalesce($3, transaction_url),
                status_last_checked_at = now(),
                status_last_response = $4,
                status_last_response_hash = $5,
                status_sync_error = null,
                next_retry_at = $6,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(update.safe_address.as_ref())
        .bind(update.transaction_url.as_ref())
        .bind(update.status_payload.clone())
        .bind(update.status_hash.clone())
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn record_status_error(
        &self,
        request_id: Uuid,
        message: &str,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let truncated = message
            .chars()
            .take(STATUS_ERROR_MAX_LEN)
            .collect::<String>();
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "update squads_safe_requests set
                status_last_checked_at = now(),
                status_sync_error = $2,
                next_retry_at = $3,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(truncated)
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn record_status_failure(
        &self,
        request_id: Uuid,
        message: &str,
    ) -> Result<SafeRequestRecord> {
        let truncated = message
            .chars()
            .take(STATUS_ERROR_MAX_LEN)
            .collect::<String>();
        let row = sqlx::query(
            "update squads_safe_requests set
                status = 'failed',
                status_last_checked_at = now(),
                status_sync_error = $2,
                error_code = 'status_sync_failed',
                error_message = $2,
                next_retry_at = null,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(truncated)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn schedule_status_retry(
        &self,
        request_id: Uuid,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "update squads_safe_requests set
                next_retry_at = $2,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn mark_failure(
        &self,
        request_id: Uuid,
        code: &str,
        message: &str,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "update squads_safe_requests set
                status = 'failed',
                error_code = $2,
                error_message = $3,
                last_attempt_at = now(),
                next_retry_at = $4,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(code)
        .bind(message)
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn prepare_for_resubmit(
        &self,
        request_id: Uuid,
        backoff: ChronoDuration,
    ) -> Result<SafeRequestRecord> {
        let next_retry_at = Utc::now() + backoff;
        let row = sqlx::query(
            "update squads_safe_requests set
                status = 'pending',
                attempt_count = attempt_count + 1,
                last_attempt_at = now(),
                next_retry_at = $2,
                error_code = null,
                error_message = null,
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(next_retry_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn override_status(
        &self,
        request_id: Uuid,
        status: &str,
        safe_address: Option<String>,
        transaction_url: Option<String>,
        note: Option<String>,
    ) -> Result<SafeRequestRecord> {
        let row = sqlx::query(
            "update squads_safe_requests set
                status = $2,
                safe_address = $3,
                transaction_url = $4,
                note = coalesce($5, note),
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(status)
        .bind(safe_address)
        .bind(transaction_url)
        .bind(note)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn link_governance(
        &self,
        request_id: Uuid,
        creator_vault: &str,
        creator_signature: &str,
        attn_signature: &str,
    ) -> Result<SafeRequestRecord> {
        let row = sqlx::query(
            "update squads_safe_requests set
                creator_vault = $2,
                governance_creator_signature = $3,
                governance_attn_signature = $4,
                governance_linked_at = now(),
                updated_at = now()
             where id = $1
             returning *",
        )
        .bind(request_id)
        .bind(creator_vault)
        .bind(creator_signature)
        .bind(attn_signature)
        .fetch_one(&self.pool)
        .await?;

        Ok(row_to_request(row))
    }

    pub async fn list_requests(&self, filter: SafeRequestFilter) -> Result<Vec<SafeRequestRecord>> {
        let SafeRequestFilter {
            status,
            creator_wallet,
            attn_wallet,
            cluster,
            before,
            limit,
        } = filter;
        let mut builder = QueryBuilder::new("select * from squads_safe_requests");
        let mut has_where = false;
        if let Some(status) = status {
            builder.push(if has_where { " and " } else { " where " });
            has_where = true;
            builder.push("status = ");
            builder.push_bind(status);
        }
        if let Some(wallet) = creator_wallet {
            builder.push(if has_where { " and " } else { " where " });
            has_where = true;
            builder.push("lower(creator_wallet) = lower(");
            builder.push_bind(wallet);
            builder.push(")");
        }
        if let Some(wallet) = attn_wallet {
            builder.push(if has_where { " and " } else { " where " });
            has_where = true;
            builder.push("lower(attn_wallet) = lower(");
            builder.push_bind(wallet);
            builder.push(")");
        }
        if let Some(cluster) = cluster {
            builder.push(if has_where { " and " } else { " where " });
            has_where = true;
            builder.push("cluster = ");
            builder.push_bind(cluster);
        }
        if let Some(before) = before {
            builder.push(if has_where { " and " } else { " where " });
            has_where = true;
            builder.push("created_at < ");
            builder.push_bind(before);
        }
        builder.push(" order by created_at desc limit ");
        builder.push_bind(limit.max(1));
        let query = builder.build();
        let rows = query.fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(row_to_request).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;
    use serde_json::json;

    #[test]
    fn validates_base58_addresses() {
        assert!(is_valid_pubkey("11111111111111111111111111111111"));
        assert!(!is_valid_pubkey("O0Il"));
    }

    #[test]
    fn sanitize_wallet_strips_whitespace() {
        assert_eq!(sanitize_wallet("  Wallet111  "), "Wallet111");
    }

    #[tokio::test]
    async fn http_service_extracts_status_url() {
        let server = MockServer::start_async().await;
        let mock = server.mock(|when, then| {
            when.method(POST).path("/squads");
            then.status(200).json_body(json!({
                "safe": { "address": "Safe111111111111111111111111111111111111111" },
                "transaction": { "url": "https://explorer/tx" },
                "status": { "url": "https://status/123" }
            }));
        });

        let base_url = server.uri();
        let api_keys = vec!["token".to_string()];
        let digest = compute_config_digest(
            Some(base_url.as_str()),
            "Attn111111111111111111111111111111111111111",
            "mainnet-beta",
            2,
            "CreatorVault-",
            None,
            None,
            false,
            &api_keys,
            None,
            None,
        );
        let config = SquadsConfig {
            base_url: Some(base_url),
            api_keys,
            default_attn_wallet: "Attn111111111111111111111111111111111111111".to_string(),
            default_cluster: "mainnet-beta".to_string(),
            default_threshold: 2,
            default_name_prefix: "CreatorVault-".to_string(),
            payer_wallet: None,
            rpc_url: None,
            rpc_strict: false,
            expected_config_digest: None,
            config_digest: digest,
            status_sync_enabled: false,
            kms_signer_resource: None,
            kms_payer_resource: None,
        };
        let service = SquadsService::new(config).await.unwrap();

        let input = CreateSafeInput {
            creator_wallet: "Creator1111111111111111111111111111111111111".to_string(),
            attn_wallet: "Attn111111111111111111111111111111111111111".to_string(),
            safe_name: Some("CreatorVault-123".to_string()),
            cluster: "mainnet-beta".to_string(),
            threshold: 2,
            contact_email: None,
            note: None,
        };

        let result = service.create_safe(input).await.unwrap();
        mock.assert();
        assert_eq!(
            result.transaction_url.as_deref(),
            Some("https://explorer/tx")
        );
        assert_eq!(result.status_url.as_deref(), Some("https://status/123"));
    }
}

fn row_to_request(row: sqlx::postgres::PgRow) -> SafeRequestRecord {
    SafeRequestRecord {
        id: row.get("id"),
        idempotency_key: row.get("idempotency_key"),
        creator_wallet: row.get("creator_wallet"),
        attn_wallet: row.get("attn_wallet"),
        cluster: row.get("cluster"),
        threshold: row.get("threshold"),
        safe_name: row.get("safe_name"),
        contact_email: row.get("contact_email"),
        note: row.get("note"),
        status: row.get("status"),
        safe_address: row.get("safe_address"),
        transaction_url: row.get("transaction_url"),
        status_url: row.get("status_url"),
        members: row.get("members"),
        raw_response: row.get("raw_response"),
        raw_response_hash: row.get("raw_response_hash"),
        status_last_checked_at: row.get("status_last_checked_at"),
        status_last_response: row.get("status_last_response"),
        status_last_response_hash: row.get("status_last_response_hash"),
        status_sync_error: row.get("status_sync_error"),
        request_payload: row.get("request_payload"),
        requester_api_key: row.get("requester_api_key"),
        requester_wallet: row.get("requester_wallet"),
        requester_ip: row.get("requester_ip"),
        creator_signature: row.get("creator_signature"),
        nonce: row.get("nonce"),
        error_code: row.get("error_code"),
        error_message: row.get("error_message"),
        attempt_count: row.get("attempt_count"),
        last_attempt_at: row.get("last_attempt_at"),
        next_retry_at: row.get("next_retry_at"),
        creator_vault: row.get("creator_vault"),
        governance_creator_signature: row.get("governance_creator_signature"),
        governance_attn_signature: row.get("governance_attn_signature"),
        governance_linked_at: row.get("governance_linked_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}
