import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useProofs } from "./useProofs";

const hasPending = (proofs: ReturnType<typeof useProofs.getState>["proofs"]) =>
  proofs.some((p) => p.status === "pending");

export function registerOverlayBridge(): () => void {
  let wasPending = hasPending(useProofs.getState().proofs);

  const apply = async (next: boolean) => {
    const overlay = await WebviewWindow.getByLabel("overlay");
    if (next) {
      await overlay?.show();
      await emitTo("overlay", "overlay-show");
    } else {
      await emitTo("overlay", "overlay-hide");
      setTimeout(() => {
        void overlay?.hide();
      }, 220);
    }
  };

  if (wasPending) void apply(true);

  return useProofs.subscribe((state) => {
    const now = hasPending(state.proofs);
    if (now !== wasPending) {
      wasPending = now;
      void apply(now);
    }
  });
}
