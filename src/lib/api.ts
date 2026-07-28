import { invoke } from "@tauri-apps/api/core";

export type ProofreadRequest = {
  appName: string;
  text: string;
  screenshot?: string;
};

export async function proofread(req: ProofreadRequest): Promise<{ corrected: string }> {
  const corrected = await invoke<string>("proofread_text", { text: req.text });
  if (!corrected?.trim()) {
    throw new Error("Model returned empty correction");
  }
  return { corrected };
}
