import type { Proof } from "./db";
import { wordDiff } from "./diff";

export type AccountStats = {
  proofsThisMonth: number;
  wordsCorrected: number;
  medianTurnaroundMs: number | null;
  successRate: number | null;
  repeatMistakes: { label: string; count: number }[];
};

const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const norm = (s: string) => s.trim().toLowerCase();

export function computeStats(proofs: Proof[]): AccountStats {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let proofsThisMonth = 0;
  let wordsCorrected = 0;
  const turnarounds: number[] = [];
  let successes = 0;
  let completed = 0;
  const pairs = new Map<string, number>();

  for (const p of proofs) {
    if (p.ts.getTime() >= monthStart) proofsThisMonth += 1;

    if (p.status !== "pending" && p.completedTs) {
      turnarounds.push(p.completedTs.getTime() - p.ts.getTime());
      completed += 1;
      if (p.status === "success") successes += 1;
    }

    if (p.status === "success" && p.after) {
      const ops = wordDiff(p.before, p.after);
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (op.kind !== "delete") continue;
        const del = op.text.trim();
        if (!del) continue;
        wordsCorrected += countWords(op.text);
        const next = ops[i + 1];
        if (next && next.kind === "insert") {
          const ins = next.text.trim();
          if (ins) {
            const key = `${norm(del)} → ${norm(ins)}`;
            pairs.set(key, (pairs.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  const repeatMistakes = [...pairs.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return {
    proofsThisMonth,
    wordsCorrected,
    medianTurnaroundMs: median(turnarounds),
    successRate: completed > 0 ? successes / completed : null,
    repeatMistakes,
  };
}

export const formatTurnaround = (ms: number | null) => {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const formatRate = (r: number | null) =>
  r == null ? "—" : `${(r * 100).toFixed(1)}%`;

export const formatInt = (n: number) => n.toLocaleString();
