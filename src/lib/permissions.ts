import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export async function checkAccessibility(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_accessibility_permission");
  } catch {
    return false;
  }
}

export async function openAccessibilitySettings(): Promise<boolean> {
  try {
    await openUrl(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    );
    return true;
  } catch (e) {
    console.error("openAccessibilitySettings:", e);
    return false;
  }
}

export async function checkLaunchAtLogin(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_launch_at_login");
  } catch {
    return false;
  }
}

export async function enableLaunchAtLogin(): Promise<boolean> {
  try {
    return await invoke<boolean>("enable_launch_at_login");
  } catch {
    return false;
  }
}
