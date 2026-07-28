import { create } from "zustand";
import {
  insertPending,
  listProofs,
  markFailure,
  markSuccess,
  type Proof,
} from "./db";
import { proofread } from "./api";

type SubmitArgs = {
  appName: string;
  text: string;
  screenshot?: string;
};

type ProofsState = {
  proofs: Proof[];
  loaded: boolean;
  load: () => Promise<void>;
  submit: (args: SubmitArgs) => Promise<Proof>;
  retry: (id: string) => Promise<void>;
};

const patch = (list: Proof[], id: string, next: Partial<Proof>): Proof[] =>
  list.map((p) => (p.id === id ? { ...p, ...next } : p));

async function runProofread(
  id: string,
  args: SubmitArgs,
  set: (fn: (s: ProofsState) => Partial<ProofsState>) => void,
  get: () => ProofsState,
): Promise<Proof> {
  try {
    const { corrected } = await proofread(args);
    const completedTs = await markSuccess(id, corrected);
    set((s) => ({
      proofs: patch(s.proofs, id, {
        after: corrected,
        status: "success",
        error: undefined,
        completedTs,
      }),
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const completedTs = await markFailure(id, msg);
    set((s) => ({
      proofs: patch(s.proofs, id, {
        status: "failure",
        error: msg,
        completedTs,
      }),
    }));
  }
  return get().proofs.find((p) => p.id === id)!;
}

export const useProofs = create<ProofsState>((set, get) => ({
  proofs: [],
  loaded: false,

  async load() {
    const proofs = await listProofs();
    set({ proofs, loaded: true });
  },

  async submit(args) {
    const id = crypto.randomUUID();
    const pending = await insertPending({
      id,
      sourceApp: args.appName,
      before: args.text,
    });
    set((s) => ({ proofs: [pending, ...s.proofs] }));
    return runProofread(id, args, set, get);
  },

  async retry(id) {
    const p = get().proofs.find((x) => x.id === id);
    if (!p) return;
    set((s) => ({
      proofs: patch(s.proofs, id, { status: "pending", error: undefined }),
    }));
    await runProofread(
      id,
      { appName: p.sourceApp, text: p.before },
      set,
      get,
    );
  },
}));
