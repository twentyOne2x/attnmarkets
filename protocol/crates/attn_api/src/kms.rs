use std::fmt;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use gcp_auth::Config as GcpAuthConfig;
use reqwest::Client as HttpClient;
use serde::Deserialize;
use solana_sdk::signature::Signature;

const CLOUD_PLATFORM_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform";

#[async_trait]
pub trait KmsClient: Send + Sync + fmt::Debug + 'static {
    async fn asymmetric_sign(&self, resource_name: &str, message: &[u8]) -> Result<Vec<u8>>;
}

#[derive(Clone)]
pub struct HttpKmsClient {
    http: HttpClient,
    auth: GcpAuthConfig,
}

impl HttpKmsClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: HttpClient::builder()
                .build()
                .context("build kms http client")?,
            auth: GcpAuthConfig::default(),
        })
    }
}

impl fmt::Debug for HttpKmsClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HttpKmsClient").finish()
    }
}

#[derive(Deserialize)]
struct KmsAsymmetricSignResponse {
    signature: Option<String>,
}

#[async_trait]
impl KmsClient for HttpKmsClient {
    async fn asymmetric_sign(&self, resource_name: &str, message: &[u8]) -> Result<Vec<u8>> {
        let token = self
            .auth
            .get_token(&[CLOUD_PLATFORM_SCOPE])
            .await
            .context("fetch kms oauth token")?;

        let url = format!(
            "https://cloudkms.googleapis.com/v1/{}:asymmetricSign",
            resource_name
        );
        let payload = serde_json::json!({
            "data": BASE64_STANDARD.encode(message),
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(token.as_str())
            .json(&payload)
            .send()
            .await
            .context("call kms asymmetricSign")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "kms asymmetricSign failed with status {}: {}",
                status,
                body
            ));
        }

        let body: KmsAsymmetricSignResponse = response
            .json()
            .await
            .context("decode kms asymmetricSign response")?;
        let signature_b64 = body
            .signature
            .as_deref()
            .ok_or_else(|| anyhow!("kms response missing signature field"))?;
        let signature = BASE64_STANDARD
            .decode(signature_b64)
            .context("decode kms signature bytes")?;
        Ok(signature)
    }
}

#[derive(Clone)]
pub struct KmsSigner<C: KmsClient> {
    resource_name: String,
    client: Arc<C>,
}

impl<C: KmsClient> fmt::Debug for KmsSigner<C> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KmsSigner")
            .field("resource_name", &self.resource_name)
            .finish()
    }
}

impl<C: KmsClient> KmsSigner<C> {
    pub fn new(resource_name: impl Into<String>, client: C) -> Self {
        Self {
            resource_name: resource_name.into(),
            client: Arc::new(client),
        }
    }

    pub fn resource_name(&self) -> &str {
        &self.resource_name
    }

    pub async fn sign(&self, message: &[u8]) -> Result<Signature> {
        let raw = self
            .client
            .asymmetric_sign(&self.resource_name, message)
            .await?;
        if raw.len() != 64 {
            return Err(anyhow!(
                "kms signature length {} unexpected (expected 64)",
                raw.len()
            ));
        }
        let mut sig_bytes = [0u8; 64];
        sig_bytes.copy_from_slice(&raw);
        Ok(Signature::new(&sig_bytes))
    }
}

impl KmsSigner<HttpKmsClient> {
    pub fn google_cloud(resource_name: impl Into<String>) -> Result<Self> {
        let client = HttpKmsClient::new()?;
        Ok(Self::new(resource_name, client))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone, Debug)]
    struct MockKmsClient {
        response: Result<Vec<u8>>,
    }

    #[async_trait]
    impl KmsClient for MockKmsClient {
        async fn asymmetric_sign(&self, _resource_name: &str, _message: &[u8]) -> Result<Vec<u8>> {
            match &self.response {
                Ok(bytes) => Ok(bytes.clone()),
                Err(err) => Err(anyhow!("{}", err)),
            }
        }
    }

    #[tokio::test]
    async fn signer_returns_signature() {
        let bytes = vec![42u8; 64];
        let signer = KmsSigner::new(
            "resource",
            MockKmsClient {
                response: Ok(bytes),
            },
        );
        let sig = signer.sign(b"hello world").await.unwrap();
        assert_eq!(sig.as_ref().len(), 64);
    }

    #[tokio::test]
    async fn signer_detects_invalid_length() {
        let signer = KmsSigner::new(
            "resource",
            MockKmsClient {
                response: Ok(vec![1, 2, 3]),
            },
        );
        let err = signer.sign(b"hello").await.unwrap_err();
        assert!(err.to_string().contains("length"));
    }

    #[tokio::test]
    async fn signer_propagates_error() {
        let signer = KmsSigner::new(
            "resource",
            MockKmsClient {
                response: Err(anyhow!("boom")),
            },
        );
        let err = signer.sign(b"hello").await.unwrap_err();
        assert!(err.to_string().contains("boom"));
    }
}
