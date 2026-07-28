import { useMemo } from "react";
import type { Proof } from "../lib/db";
import { useProofs } from "../lib/useProofs";
import { ProofEntry } from "../components/ProofEntry";
import { StatsCard } from "../components/StatsCard";

function groupByDay(proofs: Proof[]) {
  const groups = new Map<string, Proof[]>();
  for (const p of proofs) {
    const d = new Date(p.ts);
    d.setHours(0, 0, 0, 0);
    const label = d
      .toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })
      .toUpperCase();
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(p);
  }
  return [...groups.entries()];
}

export function Home() {
  const proofs = useProofs((s) => s.proofs);
  const groups = useMemo(() => groupByDay(proofs), [proofs]);
  return (
    <div className="flex gap-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-[24px] font-medium tracking-tight">Welcome back</h1>

        {groups.map(([label, items]) => (
          <section key={label} className="mt-10">
            <div className="text-[11px] tracking-[0.12em] text-[var(--text-faint)] mb-3">
              {label}
            </div>
            <div className="flex flex-col gap-2">
              {items.map((p) => (
                <ProofEntry key={p.id} proof={p} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="pt-[52px] hidden lg:block">
        <StatsCard />
      </div>
    </div>
  );
}
