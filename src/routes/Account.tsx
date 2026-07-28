import { useEffect, useMemo, useState } from "react";
import { useProofs } from "../lib/useProofs";
import {
  computeStats,
  formatInt,
  formatRate,
  formatTurnaround,
} from "../lib/stats";
import { getAuthStatus } from "../lib/auth";

export function Account() {
  const proofs = useProofs((s) => s.proofs);
  const stats = useMemo(() => computeStats(proofs), [proofs]);
  const [poweredBy, setPoweredBy] = useState<string | null>(null);

  useEffect(() => {
    getAuthStatus()
      .then((s) => {
        if (s.signed_in && s.provider_label) {
          setPoweredBy(s.provider_label);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-medium tracking-tight">Account</h1>
      {poweredBy && (
        <p className="mt-2 text-[13px] text-[var(--text-soft)]">
          Powered by your {poweredBy} account
        </p>
      )}

      <section className="mt-8 grid grid-cols-2 gap-3">
        <Figure n={formatInt(stats.proofsThisMonth)} l="proofs this month" />
        <Figure n={formatInt(stats.wordsCorrected)} l="words corrected" />
        <Figure n={formatTurnaround(stats.medianTurnaroundMs)} l="median turnaround" />
        <Figure n={formatRate(stats.successRate)} l="success rate" />
      </section>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-[0.08em] mb-4">
          Repeat mistakes
        </h2>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {stats.repeatMistakes.length === 0 ? (
            <div className="px-5 py-3 text-[13px] text-[var(--text-faint)]">
              No repeat mistakes yet.
            </div>
          ) : (
            stats.repeatMistakes.map(({ label, count }) => (
              <div
                key={label}
                className="flex items-center justify-between px-5 py-3 text-[13.5px]"
              >
                <span className="text-[var(--text)]">{label}</span>
                <span className="font-mono text-[12px] text-[var(--text-faint)]">
                  ×{count}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Figure({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="text-[24px] font-medium tracking-tight tabular-nums">{n}</div>
      <div className="text-[12px] text-[var(--text-soft)] mt-1">{l}</div>
    </div>
  );
}
