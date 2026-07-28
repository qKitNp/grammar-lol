import { useProofs } from "../lib/useProofs";

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export function StatsCard() {
  const proofs = useProofs((s) => s.proofs);

  const successful = proofs.filter((p) => p.status === "success");
  const failed = proofs.filter((p) => p.status === "failure");
  const totalComplete = successful.length + failed.length;

  const wordsCorrected = successful.reduce(
    (acc, p) => acc + p.after.split(/\s+/).filter(Boolean).length,
    0,
  );
  const acceptanceRate =
    totalComplete > 0 ? Math.round((successful.length / totalComplete) * 100) : null;

  const rows = [
    { n: fmt(successful.length), l: "total proofs" },
    { n: fmt(wordsCorrected), l: "words corrected" },
    { n: acceptanceRate !== null ? `${acceptanceRate}%` : "—", l: "acceptance rate" },
  ];

  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 w-[240px] shrink-0">
      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.l} className="flex items-baseline gap-3">
            <div className="text-[22px] font-medium tracking-tight text-[var(--text)] tabular-nums">
              {r.n}
            </div>
            <div className="text-[12px] text-[var(--text-soft)]">{r.l}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
