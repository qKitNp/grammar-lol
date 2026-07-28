import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProofs } from "./useProofs";
import { useToasts } from "./store";

type Capture = { app_name: string; text: string };

let inflight = false;

async function onTrigger() {
  if (inflight) return;
  inflight = true;
  try {
    let capture: Capture;
    try {
      capture = await invoke<Capture>("capture_selection");
    } catch (e) {
      console.error("capture_selection failed", e);
      useToasts.getState().push({
        id: "capture-failed",
        tone: "error",
        title: "Couldn’t capture text",
        description: String(e),
        durationMs: 5000,
      });
      return;
    }
    let text = capture.text?.trim();
    if (!text) {
      try {
        capture = await invoke<Capture>("select_all_and_capture");
      } catch (e) {
        console.error("select_all_and_capture failed", e);
        return;
      }
      text = capture.text?.trim();
      if (!text) {
        useToasts.getState().push({
          id: "no-text",
          tone: "info",
          title: "No text selected",
          description: "Select some text, then double-tap Right Shift.",
          durationMs: 3500,
        });
        return;
      }
      if (capture.text.length >= 2000) {
        useToasts.getState().push({
          id: "proofread-too-long",
          tone: "error",
          title: "Text too long",
          description: "Select a shorter passage (under 2000 characters) to proofread.",
          durationMs: 4000,
        });
        return;
      }
    }

    const appName = capture.app_name || "unknown";
    const proof = await useProofs.getState().submit({ appName, text: capture.text });

    if (proof.status === "success" && proof.after) {
      try {
        await invoke("replace_selection", { text: proof.after });
      } catch (e) {
        console.error("replace_selection failed", e);
        useToasts.getState().push({
          id: "replace-failed",
          tone: "error",
          title: "Couldn’t replace text",
          description:
            "Check Accessibility permission for Grammar.lol, then try again.",
          durationMs: 6000,
        });
      }
    } else if (proof.status === "failure") {
      useToasts.getState().push({
        id: "proof-failed",
        tone: "error",
        title: "Proofread failed",
        description: proof.error ?? "Unknown error",
        durationMs: 6000,
      });
    }
  } finally {
    inflight = false;
  }
}

export async function registerHotkey(): Promise<() => void> {
  const offTrigger = await listen("doubletap-rshift", () => {
    console.log("[hotkey] doubletap-rshift");
    void onTrigger();
  });
  const offPerm = await listen("doubletap-permission-missing", () => {
    useToasts.getState().push({
      id: "doubletap-permission-missing",
      tone: "error",
      title: "Accessibility permission needed",
      description:
        "grammar.lol needs Accessibility access to detect the double-tap Right Shift shortcut. Open System Settings -> Privacy & Security -> Accessibility and enable grammar.lol, then restart the app.",
      durationMs: 0,
    });
  });
  console.log("[hotkey] listening for double-tap Right Shift");
  return () => {
    offTrigger();
    offPerm();
  };
}
