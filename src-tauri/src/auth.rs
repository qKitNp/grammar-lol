//! Session storage + ChatGPT / SuperGrok OAuth.
//!
//! Tokens live in the app config dir (mode 0600). Proofread calls live in
//! [`crate::inference`] and pull tokens from here.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use parking_lot::Mutex;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

// ─── Constants ───────────────────────────────────────────────────────────────

const CHATGPT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CHATGPT_AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const CHATGPT_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CHATGPT_REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const CHATGPT_SCOPE: &str =
    "openid profile email offline_access api.connectors.read api.connectors.invoke";
const CHATGPT_DEFAULT_MODEL: &str = "gpt-5.6-luna";

const XAI_CLIENT_ID: &str = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_DEVICE_CODE_URL: &str = "https://auth.x.ai/oauth2/device/code";
const XAI_TOKEN_URL: &str = "https://auth.x.ai/oauth2/token";
const XAI_SCOPE: &str = "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write";
const XAI_DEFAULT_MODEL: &str = "grok-4.20-0309-non-reasoning";

/// Curated models for ChatGPT subscription (Codex) surface.
/// Availability depends on plan; the API will reject unsupported slugs.
const CHATGPT_MODELS: &[(&str, &str)] = &[
    ("gpt-5.6-luna", "GPT-5.6 Luna (default)"),
    ("gpt-5.5", "GPT-5.5"),
    ("gpt-5.4", "GPT-5.4"),
    ("gpt-5.2", "GPT-5.2"),
    ("gpt-4.1", "GPT-4.1"),
    ("o4-mini", "o4-mini"),
    ("o3", "o3"),
];

/// Curated models for SuperGrok / Grok CLI proxy.
const XAI_MODELS: &[(&str, &str)] = &[
    ("grok-4.20-0309-non-reasoning", "Grok 4.2 fast (default)"),
    ("grok-4.5", "Grok 4.5"),
    ("grok-4.3", "Grok 4.3"),
    ("grok-4.20-0309-reasoning", "Grok 4.2 (reasoning)"),
    ("grok-build-0.1", "Grok Build 0.1"),
];

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    Chatgpt,
    Xai,
}

impl ProviderId {
    pub fn label(&self) -> &'static str {
        match self {
            ProviderId::Chatgpt => "ChatGPT",
            ProviderId::Xai => "SuperGrok",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub provider: ProviderId,
    pub access_token: String,
    pub refresh_token: String,
    #[serde(default)]
    pub id_token: Option<String>,
    /// Account id for ChatGPT (chatgpt-account-id header).
    #[serde(default)]
    pub account_id: Option<String>,
    /// Display label (email if known).
    #[serde(default)]
    pub label: Option<String>,
    /// Unix seconds; 0 means "decode from JWT".
    #[serde(default)]
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub signed_in: bool,
    pub provider: Option<ProviderId>,
    pub label: Option<String>,
    pub provider_label: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelOption {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelSettings {
    pub provider: Option<ProviderId>,
    pub selected: String,
    pub models: Vec<ModelOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Prefs {
    #[serde(default)]
    chatgpt_model: Option<String>,
    #[serde(default)]
    xai_model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct XaiDeviceStart {
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub interval: u64,
    pub expires_in: u64,
}

/// In-flight SuperGrok device-code state (held in memory only).
struct PendingXai {
    device_code: String,
    interval: u64,
    expires_at: Instant,
}

pub struct AuthState {
    pending_xai: Mutex<Option<PendingXai>>,
    /// Set true to abort an in-flight ChatGPT loopback login.
    cancel_chatgpt: Arc<AtomicBool>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            pending_xai: Mutex::new(None),
            cancel_chatgpt: Arc::new(AtomicBool::new(false)),
        }
    }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir)
}

fn auth_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("auth.json"))
}

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("prefs.json"))
}

fn load_prefs(app: &AppHandle) -> Prefs {
    let Ok(path) = prefs_path(app) else {
        return Prefs::default();
    };
    if !path.exists() {
        return Prefs::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_prefs(app: &AppHandle, prefs: &Prefs) -> Result<(), String> {
    let path = prefs_path(app)?;
    let raw = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw.as_bytes()).map_err(|e| format!("write prefs: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename prefs: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn models_for(provider: &ProviderId) -> &'static [(&'static str, &'static str)] {
    match provider {
        ProviderId::Chatgpt => CHATGPT_MODELS,
        ProviderId::Xai => XAI_MODELS,
    }
}

fn default_model(provider: &ProviderId) -> &'static str {
    match provider {
        ProviderId::Chatgpt => CHATGPT_DEFAULT_MODEL,
        ProviderId::Xai => XAI_DEFAULT_MODEL,
    }
}

fn is_known_model(provider: &ProviderId, model: &str) -> bool {
    models_for(provider).iter().any(|(id, _)| *id == model)
}

pub(crate) fn selected_model(app: &AppHandle, provider: &ProviderId) -> String {
    let prefs = load_prefs(app);
    let stored = match provider {
        ProviderId::Chatgpt => prefs.chatgpt_model.as_deref(),
        ProviderId::Xai => prefs.xai_model.as_deref(),
    };
    match stored {
        Some(m) if is_known_model(provider, m) => m.to_string(),
        _ => default_model(provider).to_string(),
    }
}

pub(crate) fn load_session(app: &AppHandle) -> Result<Option<AuthSession>, String> {
    let path = auth_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read auth: {e}"))?;
    let session: AuthSession =
        serde_json::from_str(&raw).map_err(|e| format!("parse auth: {e}"))?;
    Ok(Some(session))
}

fn save_session(app: &AppHandle, session: &AuthSession) -> Result<(), String> {
    let path = auth_path(app)?;
    let raw = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    // Atomic write
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw.as_bytes()).map_err(|e| format!("write auth: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename auth: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn clear_session(app: &AppHandle) -> Result<(), String> {
    let path = auth_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("clear auth: {e}"))?;
    }
    Ok(())
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

fn jwt_payload(token: &str) -> Option<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let decoded = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    serde_json::from_slice(&decoded).ok()
}

fn jwt_exp(token: &str) -> Option<i64> {
    jwt_payload(token)?
        .get("exp")
        .and_then(|v| v.as_i64())
}

pub(crate) fn chatgpt_account_id_from_token(access: &str) -> Option<String> {
    let payload = jwt_payload(access)?;
    // Prefer nested OpenAI auth claim
    if let Some(id) = payload
        .get("https://api.openai.com/auth")
        .and_then(|a| a.get("chatgpt_account_id"))
        .and_then(|v| v.as_str())
    {
        return Some(id.to_string());
    }
    payload
        .get("chatgpt_account_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn email_from_id_token(id_token: Option<&str>) -> Option<String> {
    let token = id_token?;
    let payload = jwt_payload(token)?;
    payload
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub(crate) fn is_expired(session: &AuthSession) -> bool {
    let exp = if session.expires_at > 0 {
        session.expires_at
    } else {
        jwt_exp(&session.access_token).unwrap_or(0)
    };
    if exp == 0 {
        return false; // unknown — try and refresh on 401
    }
    // 5-minute buffer
    now_unix() >= exp - 300
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

pub(crate) fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())
}

fn form_post(url: &str, form: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let client = http_client()?;
    let res = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(form)
        .send()
        .map_err(|e| format!("network: {e}"))?;
    let status = res.status();
    let body = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("token endpoint {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| format!("token json: {e}"))
}

// ─── Session ensure / refresh ────────────────────────────────────────────────

fn apply_token_response(
    provider: ProviderId,
    json: &serde_json::Value,
    prev: Option<&AuthSession>,
) -> Result<AuthSession, String> {
    let access = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("missing access_token")?
        .to_string();
    let refresh = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| prev.map(|p| p.refresh_token.clone()))
        .ok_or("missing refresh_token")?;
    let id_token = json
        .get("id_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| prev.and_then(|p| p.id_token.clone()));
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let expires_at = if expires_in > 0 {
        now_unix() + expires_in
    } else {
        jwt_exp(&access).unwrap_or(0)
    };

    let account_id = match provider {
        ProviderId::Chatgpt => json
            .get("account_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| chatgpt_account_id_from_token(&access))
            .or_else(|| prev.and_then(|p| p.account_id.clone())),
        ProviderId::Xai => prev.and_then(|p| p.account_id.clone()),
    };

    let label = email_from_id_token(id_token.as_deref())
        .or_else(|| prev.and_then(|p| p.label.clone()));

    Ok(AuthSession {
        provider,
        access_token: access,
        refresh_token: refresh,
        id_token,
        account_id,
        label,
        expires_at,
    })
}

pub(crate) fn refresh_session(app: &AppHandle, session: &AuthSession) -> Result<AuthSession, String> {
    let json = match session.provider {
        ProviderId::Chatgpt => form_post(
            CHATGPT_TOKEN_URL,
            &[
                ("grant_type", "refresh_token"),
                ("refresh_token", &session.refresh_token),
                ("client_id", CHATGPT_CLIENT_ID),
            ],
        )?,
        ProviderId::Xai => form_post(
            XAI_TOKEN_URL,
            &[
                ("grant_type", "refresh_token"),
                ("refresh_token", &session.refresh_token),
                ("client_id", XAI_CLIENT_ID),
            ],
        )?,
    };
    let next = apply_token_response(session.provider.clone(), &json, Some(session))?;
    save_session(app, &next)?;
    Ok(next)
}

// ─── ChatGPT PKCE login ──────────────────────────────────────────────────────

fn pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn random_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn build_chatgpt_authorize_url(challenge: &str, state: &str) -> String {
    format!(
        "{CHATGPT_AUTHORIZE_URL}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&id_token_add_organizations=true&codex_cli_simplified_flow=true&originator=codex_cli_rs",
        urlencoding::encode(CHATGPT_CLIENT_ID),
        urlencoding::encode(CHATGPT_REDIRECT_URI),
        urlencoding::encode(CHATGPT_SCOPE),
        urlencoding::encode(challenge),
        urlencoding::encode(state),
    )
}

/// Run loopback server on :1455, wait for OAuth callback with matching state.
fn wait_chatgpt_callback(
    expected_state: &str,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let server = tiny_http::Server::http("127.0.0.1:1455").map_err(|e| {
        format!(
            "Could not bind localhost:1455 for ChatGPT login (is another app using it?): {e}"
        )
    })?;
    let deadline = Instant::now() + timeout;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Login cancelled".into());
        }
        if Instant::now() > deadline {
            return Err("ChatGPT login timed out. Try again.".into());
        }
        let req = match server.recv_timeout(Duration::from_millis(400)) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(e) => return Err(format!("callback server: {e}")),
        };
        let url = req.url().to_string();
        // Expect /auth/callback?code=...&state=...
        if !url.starts_with("/auth/callback") {
            let _ = req.respond(tiny_http::Response::from_string("Not found").with_status_code(404));
            continue;
        }
        let query = url.split('?').nth(1).unwrap_or("");
        let params: HashMap<String, String> = query
            .split('&')
            .filter_map(|pair| {
                let mut it = pair.splitn(2, '=');
                let k = it.next()?;
                let v = it.next().unwrap_or("");
                Some((
                    urlencoding::decode(k).ok()?.into_owned(),
                    urlencoding::decode(v).ok()?.into_owned(),
                ))
            })
            .collect();
        if let Some(err) = params.get("error") {
            let desc = params
                .get("error_description")
                .cloned()
                .unwrap_or_default();
            let body = format!(
                "<html><body style='font-family:system-ui;padding:2rem'><h2>Login failed</h2><p>{err}: {desc}</p><p>You can close this window.</p></body></html>"
            );
            let _ = req.respond(
                tiny_http::Response::from_string(body)
                    .with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..])
                            .unwrap(),
                    )
                    .with_status_code(400),
            );
            return Err(format!("ChatGPT login denied: {err} {desc}"));
        }
        let code = params.get("code").cloned().ok_or("missing code")?;
        let state = params.get("state").cloned().unwrap_or_default();
        if state != expected_state {
            let _ = req.respond(
                tiny_http::Response::from_string("State mismatch").with_status_code(400),
            );
            return Err("OAuth state mismatch — try again.".into());
        }
        let body = r#"<!doctype html>
<html><body style="font-family:system-ui;padding:2rem;text-align:center">
  <h2>Signed in to Grammar.lol</h2>
  <p>You can close this window and return to the app.</p>
  <script>setTimeout(()=>window.close(),800)</script>
</body></html>"#;
        let _ = req.respond(
            tiny_http::Response::from_string(body).with_header(
                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap(),
            ),
        );
        return Ok(code);
    }
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn auth_status(app: AppHandle) -> Result<AuthStatus, String> {
    match load_session(&app)? {
        Some(s) => {
            let model = selected_model(&app, &s.provider);
            Ok(AuthStatus {
                signed_in: true,
                provider: Some(s.provider.clone()),
                label: s.label.clone(),
                provider_label: Some(s.provider.label().to_string()),
                model: Some(model),
            })
        }
        None => Ok(AuthStatus {
            signed_in: false,
            provider: None,
            label: None,
            provider_label: None,
            model: None,
        }),
    }
}

#[tauri::command]
pub fn get_model_settings(app: AppHandle) -> Result<ModelSettings, String> {
    let session = load_session(&app)?;
    let provider = session
        .as_ref()
        .map(|s| s.provider.clone())
        .unwrap_or(ProviderId::Xai);
    let selected = selected_model(&app, &provider);
    let models = models_for(&provider)
        .iter()
        .map(|(id, label)| ModelOption {
            id: (*id).to_string(),
            label: (*label).to_string(),
        })
        .collect();
    Ok(ModelSettings {
        provider: session.map(|s| s.provider),
        selected,
        models,
    })
}

#[tauri::command]
pub fn set_model(app: AppHandle, model: String) -> Result<ModelSettings, String> {
    let session = load_session(&app)?.ok_or_else(|| {
        "Not signed in. Connect ChatGPT or SuperGrok before choosing a model.".to_string()
    })?;
    if !is_known_model(&session.provider, &model) {
        return Err(format!(
            "Unknown model for {}: {model}",
            session.provider.label()
        ));
    }
    let mut prefs = load_prefs(&app);
    match session.provider {
        ProviderId::Chatgpt => prefs.chatgpt_model = Some(model),
        ProviderId::Xai => prefs.xai_model = Some(model),
    }
    save_prefs(&app, &prefs)?;
    get_model_settings(app)
}

#[tauri::command]
pub fn auth_sign_out(app: AppHandle, state: State<'_, AuthState>) -> Result<(), String> {
    *state.pending_xai.lock() = None;
    clear_session(&app)
}

/// Open browser + local callback server; returns when signed in (blocking, ~3 min max).
#[tauri::command]
pub async fn chatgpt_login(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<AuthStatus, String> {
    state.cancel_chatgpt.store(false, Ordering::Relaxed);
    let cancel = Arc::clone(&state.cancel_chatgpt);
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (verifier, challenge) = pkce_pair();
        let oauth_state = random_state();
        let url = build_chatgpt_authorize_url(&challenge, &oauth_state);

        let _ = open::that(&url);

        let code = wait_chatgpt_callback(&oauth_state, Duration::from_secs(180), &cancel)?;

        let json = form_post(
            CHATGPT_TOKEN_URL,
            &[
                ("grant_type", "authorization_code"),
                ("client_id", CHATGPT_CLIENT_ID),
                ("code", &code),
                ("code_verifier", &verifier),
                ("redirect_uri", CHATGPT_REDIRECT_URI),
            ],
        )?;

        let session = apply_token_response(ProviderId::Chatgpt, &json, None)?;
        save_session(&app2, &session)?;
        let model = selected_model(&app2, &ProviderId::Chatgpt);
        Ok(AuthStatus {
            signed_in: true,
            provider: Some(ProviderId::Chatgpt),
            label: session.label,
            provider_label: Some(ProviderId::Chatgpt.label().to_string()),
            model: Some(model),
        })
    })
    .await
    .map_err(|e| format!("login task: {e}"))?
}

#[tauri::command]
pub fn chatgpt_cancel_login(state: State<'_, AuthState>) {
    state.cancel_chatgpt.store(true, Ordering::Relaxed);
}

/// Start SuperGrok device-code flow. Returns user code for UI; poll with xai_poll_login.
#[tauri::command]
pub fn xai_start_login(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<XaiDeviceStart, String> {
    let _ = app; // reserved
    let json = form_post(
        XAI_DEVICE_CODE_URL,
        &[("client_id", XAI_CLIENT_ID), ("scope", XAI_SCOPE)],
    )?;

    let device_code = json
        .get("device_code")
        .and_then(|v| v.as_str())
        .ok_or("missing device_code")?
        .to_string();
    let user_code = json
        .get("user_code")
        .and_then(|v| v.as_str())
        .ok_or("missing user_code")?
        .to_string();
    let verification_uri = json
        .get("verification_uri")
        .and_then(|v| v.as_str())
        .unwrap_or("https://accounts.x.ai/device")
        .to_string();
    let verification_uri_complete = json
        .get("verification_uri_complete")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let interval = json
        .get("interval")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .max(1);
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(900);

    *state.pending_xai.lock() = Some(PendingXai {
        device_code,
        interval,
        expires_at: Instant::now() + Duration::from_secs(expires_in),
    });

    // Prefer complete URI for browser open
    if let Some(ref complete) = verification_uri_complete {
        let _ = open::that(complete);
    } else {
        let _ = open::that(&verification_uri);
    }

    Ok(XaiDeviceStart {
        user_code,
        verification_uri,
        verification_uri_complete,
        interval,
        expires_in,
    })
}

/// One poll attempt for SuperGrok device login. Returns Ok(Some(status)) when done,
/// Ok(None) when still pending, Err on terminal failure.
#[tauri::command]
pub fn xai_poll_login(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<Option<AuthStatus>, String> {
    let pending = {
        let g = state.pending_xai.lock();
        g.as_ref()
            .map(|p| (p.device_code.clone(), p.expires_at, p.interval))
    };
    let Some((device_code, expires_at, _interval)) = pending else {
        return Err("No SuperGrok login in progress".into());
    };
    if Instant::now() > expires_at {
        *state.pending_xai.lock() = None;
        return Err("SuperGrok login timed out. Try again.".into());
    }

    let client = http_client()?;
    let res = client
        .post(XAI_TOKEN_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("client_id", XAI_CLIENT_ID),
            ("device_code", device_code.as_str()),
        ])
        .send()
        .map_err(|e| format!("network: {e}"))?;

    let status = res.status();
    let body = res.text().map_err(|e| e.to_string())?;

    if status.is_success() {
        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("token json: {e}"))?;
        let session = apply_token_response(ProviderId::Xai, &json, None)?;
        save_session(&app, &session)?;
        *state.pending_xai.lock() = None;
        let model = selected_model(&app, &ProviderId::Xai);
        return Ok(Some(AuthStatus {
            signed_in: true,
            provider: Some(ProviderId::Xai),
            label: session.label,
            provider_label: Some(ProviderId::Xai.label().to_string()),
            model: Some(model),
        }));
    }

    // Pending / slow_down / errors
    if let Ok(j) = serde_json::from_str::<serde_json::Value>(&body) {
        let err = j
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        match err {
            "authorization_pending" | "slow_down" => return Ok(None),
            "expired_token" | "access_denied" | "authorization_denied" => {
                *state.pending_xai.lock() = None;
                return Err(format!("SuperGrok login failed: {err}"));
            }
            _ => {
                // Some servers return 400 with authorization_pending
                if body.contains("authorization_pending") || body.contains("slow_down") {
                    return Ok(None);
                }
                *state.pending_xai.lock() = None;
                return Err(format!("SuperGrok login error: {err} ({body})"));
            }
        }
    }

    if status.as_u16() == 400 && body.contains("authorization_pending") {
        return Ok(None);
    }

    *state.pending_xai.lock() = None;
    Err(format!("SuperGrok login failed ({status}): {body}"))
}
