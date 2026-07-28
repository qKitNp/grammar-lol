import { useState } from "react";
import type { Proof } from "../lib/db";
import { useProofs } from "../lib/useProofs";
import { DiffRenderer } from "./DiffRenderer";

const fmtTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

export function ProofEntry({ proof }: { proof: Proof }) {
  const [open, setOpen] = useState(false);
  const retry = useProofs((s) => s.retry);

  const isPending = proof.status === "pending";
  const isFailure = proof.status === "failure";

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4 transition-colors hover:border-[var(--text-faint)]/40 cursor-pointer"
    >
      <div className="grid grid-cols-[90px_1fr_auto] items-start gap-5">
        <div className="font-mono text-[12px] text-[var(--text-faint)] pt-[1px]">
          {fmtTime(proof.ts)}
        </div>
        <div>
          {isPending && (
            <div className="flex items-start gap-2">
              <span className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full bg-[var(--text-faint)] animate-pulse" />
              <span className="text-[var(--text-soft)]">{proof.before}</span>
            </div>
          )}

          {isFailure && (
            <div>
              <div className="text-[var(--text-soft)]">{proof.before}</div>
              <div className="mt-2 text-[12px] text-red-500">
                {proof.error ?? "Request failed"}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    retry(proof.id);
                  }}
                  className="ml-2 underline cursor-pointer"
                >
                  retry
                </span>
              </div>
            </div>
          )}

          {proof.status === "success" && (
            <DiffRenderer before={proof.before} after={proof.after} />
          )}

          {open && proof.status === "success" && (
            <div className="mt-3 grid grid-cols-[64px_1fr] gap-x-4 gap-y-1.5 text-[12.5px] pt-3 border-t border-[var(--border)]">
              <span className="text-[var(--text-faint)] uppercase tracking-wider text-[10.5px] pt-[3px]">
                before
              </span>
              <span className="text-[var(--text-soft)]">{proof.before}</span>
              <span className="text-[var(--text-faint)] uppercase tracking-wider text-[10.5px] pt-[3px]">
                after
              </span>
              <span className="text-[var(--text)]">{proof.after}</span>
            </div>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-faint)] pt-[2px]">{proof.sourceApp}</span>
      </div>
    </button>
  );
}
