//! Proofread inference against ChatGPT / SuperGrok Responses APIs.
//!
//! Runs in the Tauri backend so the frontend never needs CORS exceptions.
//! Auth (tokens + model choice) comes from [`crate::auth`].

use crate::auth::{
    self, chatgpt_account_id_from_token, is_expired, load_session, refresh_session, selected_model,
    AuthSession, ProviderId,
};
use tauri::AppHandle;

const CHATGPT_RESPONSES_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const XAI_RESPONSES_URL: &str = "https://cli-chat-proxy.grok.com/v1/responses";

const SYSTEM_PROMPT: &str = "You are a precise grammar, spelling, and punctuation corrector. \
Return ONLY the corrected text. Preserve meaning, tone, line breaks, and formatting. \
Do not add explanations, quotes, markdown, or commentary. \
If the text is already correct, return it unchanged.";

fn extract_output_text(json: &serde_json::Value) -> Result<String, String> {
    // Responses API: output[].content[].text  or output_text
    if let Some(t) = json.get("output_text").and_then(|v| v.as_str()) {
        return Ok(t.to_string());
    }
    if let Some(arr) = json.get("output").and_then(|v| v.as_array()) {
        let mut out = String::new();
        for item in arr {
            if let Some(content) = item.get("content").and_then(|c| c.as_array()) {
                for part in content {
                    if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                        out.push_str(t);
                    } else if let Some(t) = part
                        .get("output_text")
                        .or_else(|| part.get("value"))
                        .and_then(|v| v.as_str())
                    {
                        out.push_str(t);
                    }
                }
            }
            // Some variants put text directly on message
            if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                out.push_str(t);
            }
        }
        if !out.is_empty() {
            return Ok(out);
        }
    }
    // Chat completions fallback
    if let Some(t) = json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
    {
        return Ok(t.to_string());
    }
    Err(format!(
        "Could not parse model response: {}",
        &json.to_string().chars().take(400).collect::<String>()
    ))
}

/// Parse OpenAI Responses API SSE stream into a single text string.
fn parse_responses_sse(raw: &str) -> Result<String, String> {
    let mut deltas = String::new();
    let mut final_text: Option<String> = None;
    let mut completed_response: Option<serde_json::Value> = None;
    let mut last_error: Option<String> = None;

    for block in raw.split("\n\n") {
        for line in block.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            // Error events
            if let Some(err) = json.get("error") {
                let msg = err
                    .get("message")
                    .and_then(|v| v.as_str())
                    .or_else(|| err.as_str())
                    .unwrap_or("stream error");
                last_error = Some(msg.to_string());
                continue;
            }

            let event_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("");

            match event_type {
                "response.output_text.delta" => {
                    if let Some(d) = json.get("delta").and_then(|v| v.as_str()) {
                        deltas.push_str(d);
                    }
                }
                "response.output_text.done" => {
                    if let Some(t) = json.get("text").and_then(|v| v.as_str()) {
                        final_text = Some(t.to_string());
                    }
                }
                "response.completed" | "response.done" => {
                    if let Some(resp) = json.get("response") {
                        completed_response = Some(resp.clone());
                    } else {
                        completed_response = Some(json.clone());
                    }
                }
                "error" => {
                    let msg = json
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown stream error");
                    last_error = Some(msg.to_string());
                }
                _ => {
                    // Some servers nest delta under content
                    if let Some(d) = json.pointer("/delta/text").and_then(|v| v.as_str()) {
                        deltas.push_str(d);
                    }
                }
            }
        }
    }

    if let Some(t) = final_text {
        if !t.trim().is_empty() {
            return Ok(t);
        }
    }
    if !deltas.trim().is_empty() {
        return Ok(deltas);
    }
    if let Some(resp) = completed_response {
        if let Ok(t) = extract_output_text(&resp) {
            if !t.trim().is_empty() {
                return Ok(t);
            }
        }
    }
    if let Some(e) = last_error {
        return Err(format!("ChatGPT: {e}"));
    }
    Err(format!(
        "Could not parse ChatGPT stream: {}",
        raw.chars().take(400).collect::<String>()
    ))
}

fn call_chatgpt_responses(
    session: &AuthSession,
    text: &str,
    model: &str,
) -> Result<String, String> {
    let account_id = session
        .account_id
        .clone()
        .or_else(|| chatgpt_account_id_from_token(&session.access_token))
        .ok_or("Missing ChatGPT account id — re-login")?;

    // Codex / ChatGPT account surface requires stream=true.
    let body = serde_json::json!({
        "model": model,
        "stream": true,
        "store": false,
        "instructions": SYSTEM_PROMPT,
        "input": [
            {
                "role": "user",
                "content": [
                    { "type": "input_text", "text": text }
                ]
            }
        ]
    });

    let client = auth::http_client()?;
    let res = client
        .post(CHATGPT_RESPONSES_URL)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("chatgpt-account-id", account_id)
        .header("OpenAI-Beta", "responses=experimental")
        .header("originator", "codex_cli_rs")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .map_err(|e| format!("ChatGPT network error: {e}"))?;

    let status = res.status();
    let raw = res.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err("AUTH_EXPIRED".into());
    }
    if status.as_u16() == 429 {
        return Err("Usage limit reached on your ChatGPT plan. Try again later.".into());
    }
    if !status.is_success() {
        // Surface model detail if present (JSON error body)
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(d) = j.get("detail").and_then(|v| v.as_str()) {
                return Err(format!("ChatGPT: {d}"));
            }
            if let Some(m) = j.pointer("/error/message").and_then(|v| v.as_str()) {
                return Err(format!("ChatGPT: {m}"));
            }
        }
        return Err(format!("ChatGPT error {status}: {raw}"));
    }

    // Prefer SSE parse; fall back to single JSON body if the server didn't stream.
    if raw.contains("data:") {
        parse_responses_sse(&raw)
    } else if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
        extract_output_text(&json)
    } else {
        parse_responses_sse(&raw)
    }
}

fn call_xai_responses(session: &AuthSession, text: &str, model: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "store": false,
        "instructions": SYSTEM_PROMPT,
        "input": [
            {
                "role": "user",
                "content": [
                    { "type": "input_text", "text": text }
                ]
            }
        ]
    });

    let client = auth::http_client()?;
    let res = client
        .post(XAI_RESPONSES_URL)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Content-Type", "application/json")
        .header("x-xai-token-auth", "xai-grok-cli")
        .header("x-grok-client-identifier", "grok-shell")
        .header("x-grok-client-version", "0.2.93")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .map_err(|e| format!("SuperGrok network error: {e}"))?;

    let status = res.status();
    let raw = res.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err("AUTH_EXPIRED".into());
    }
    if status.as_u16() == 429 {
        return Err("Usage limit reached on your SuperGrok plan. Try again later.".into());
    }
    if status.as_u16() == 402 || status.as_u16() == 403 {
        return Err(
            "Your SuperGrok account is not entitled for this API surface. Check your subscription tier."
                .into(),
        );
    }
    if !status.is_success() {
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(m) = j.pointer("/error/message").and_then(|v| v.as_str()) {
                return Err(format!("SuperGrok: {m}"));
            }
        }
        return Err(format!("SuperGrok error {status}: {raw}"));
    }
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("SuperGrok json: {e}"))?;
    extract_output_text(&json)
}

fn proofread_with_session(
    app: &AppHandle,
    session: AuthSession,
    text: &str,
) -> Result<String, String> {
    let model = selected_model(app, &session.provider);
    let result = match session.provider {
        ProviderId::Chatgpt => call_chatgpt_responses(&session, text, &model),
        ProviderId::Xai => call_xai_responses(&session, text, &model),
    };

    match result {
        Err(e) if e == "AUTH_EXPIRED" => {
            let refreshed = refresh_session(app, &session)?;
            let model = selected_model(app, &refreshed.provider);
            match refreshed.provider {
                ProviderId::Chatgpt => call_chatgpt_responses(&refreshed, text, &model),
                ProviderId::Xai => call_xai_responses(&refreshed, text, &model),
            }
        }
        other => other,
    }
    .map(|s| s.trim().to_string())
}

#[tauri::command]
pub async fn proofread_text(app: AppHandle, text: String) -> Result<String, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = load_session(&app2)?.ok_or_else(|| {
            "Not signed in. Open Settings and connect ChatGPT or SuperGrok.".to_string()
        })?;
        if is_expired(&session) {
            session = refresh_session(&app2, &session)?;
        }
        proofread_with_session(&app2, session, &text)
    })
    .await
    .map_err(|e| format!("proofread task: {e}"))?
}
