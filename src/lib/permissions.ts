import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export async function checkAccessibility(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_accessibility_permission");
  } catch {
    return false;
  }
}

/** Prompt macOS to register *this* binary for Accessibility (needed after rebuilds). */
export async function requestAccessibility(): Promise<boolean> {
  try {
    return await invoke<boolean>("request_accessibility_permission");
  } catch {
    return false;
  }
}

export async function checkInputMonitoring(): Promise<boolean> {
  try {
    return await invoke<boolean>("check_input_monitoring_permission");
  } catch {
    return false;
  }
}

/** Registers this process under Input Monitoring (listen-only global keys). */
export async function requestInputMonitoring(): Promise<boolean> {
  try {
    return await invoke<boolean>("request_input_monitoring_permission");
  } catch {
    return false;
  }
}

export async function openAccessibilitySettings(): Promise<boolean> {
  try {
    await requestAccessibility();
    await openUrl(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    );
    return true;
  } catch (e) {
    console.error("openAccessibilitySettings:", e);
    return false;
  }
}

export async function openInputMonitoringSettings(): Promise<boolean> {
  try {
    await requestInputMonitoring();
    await openUrl(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
    );
    return true;
  } catch (e) {
    console.error("openInputMonitoringSettings:", e);
    return false;
  }
}

/** Request both TCC grants and open Accessibility settings (Input Monitoring next if still missing). */
export async function openPermissionSettings(): Promise<boolean> {
  try {
    await requestAccessibility();
    await requestInputMonitoring();
    const [ax, listen] = await Promise.all([
      checkAccessibility(),
      checkInputMonitoring(),
    ]);
    // Prefer opening the pane that still needs a toggle.
    if (!ax) {
      await openUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
      );
    } else if (!listen) {
      await openUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
      );
    } else {
      await openUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
      );
    }
    return true;
  } catch (e) {
    console.error("openPermissionSettings:", e);
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
