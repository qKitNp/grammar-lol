import { invoke } from "@tauri-apps/api/core";

export type ProviderId = "chatgpt" | "xai" | "apple_intelligence";

export type AuthStatus = {
  signed_in: boolean;
  provider: ProviderId | null;
  label: string | null;
  provider_label: string | null;
  model: string | null;
};

export type ModelOption = {
  id: string;
  label: string;
};

export type ModelSettings = {
  provider: ProviderId | null;
  selected: string;
  models: ModelOption[];
};

export type XaiDeviceStart = {
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  interval: number;
  expires_in: number;
};

export type AppleIntelligenceStatus = {
  supported: boolean;
  available: boolean;
  reason: string | null;
};

export async function getAuthStatus(): Promise<AuthStatus> {
  return invoke<AuthStatus>("auth_status");
}

export async function getModelSettings(): Promise<ModelSettings> {
  return invoke<ModelSettings>("get_model_settings");
}

export async function setModel(model: string): Promise<ModelSettings> {
  return invoke<ModelSettings>("set_model", { model });
}

export async function signOut(): Promise<void> {
  await invoke("auth_sign_out");
}

/** Opens browser + waits for ChatGPT PKCE callback (up to ~3 min). */
export async function loginWithChatgpt(): Promise<AuthStatus> {
  return invoke<AuthStatus>("chatgpt_login");
}

export async function cancelChatgptLogin(): Promise<void> {
  await invoke("chatgpt_cancel_login");
}

/** Starts SuperGrok device-code flow; opens browser. */
export async function startXaiLogin(): Promise<XaiDeviceStart> {
  return invoke<XaiDeviceStart>("xai_start_login");
}

/** Poll once. Returns status when complete, null if still pending. */
export async function pollXaiLogin(): Promise<AuthStatus | null> {
  return invoke<AuthStatus | null>("xai_poll_login");
}

/** Whether the on-device Apple Intelligence model can run. */
export async function getAppleIntelligenceStatus(): Promise<AppleIntelligenceStatus> {
  return invoke<AppleIntelligenceStatus>("apple_intelligence_status");
}

/** Activate local Apple Intelligence (no OAuth). */
export async function enableAppleIntelligence(): Promise<AuthStatus> {
  return invoke<AuthStatus>("apple_intelligence_enable");
}

export async function waitForXaiLogin(
  intervalSec: number,
  expiresInSec: number,
  onTick?: (remainingSec: number) => void,
  signal?: AbortSignal,
): Promise<AuthStatus> {
  const started = Date.now();
  const deadline = started + expiresInSec * 1000;
  let delay = Math.max(intervalSec, 1) * 1000;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Login cancelled");
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    onTick?.(remaining);

    const result = await pollXaiLogin();
    if (result) return result;

    await new Promise((r) => setTimeout(r, delay));
    // gentle backoff if server asks slow_down — we don't get that detail; keep interval
  }
  throw new Error("SuperGrok login timed out. Try again.");
}
