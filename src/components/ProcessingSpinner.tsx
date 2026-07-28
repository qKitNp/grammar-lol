import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useProofs } from "../lib/useProofs";

export function ProcessingSpinner() {
  const pendingCount = useProofs((s) =>
    s.proofs.reduce((n, p) => n + (p.status === "pending" ? 1 : 0), 0),
  );
  const visible = pendingCount > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-[var(--surface)] px-4 py-2 text-[12.5px] text-[var(--text)] shadow-lg ring-1 ring-[var(--border)]"
          >
            <Loader2
              size={14}
              strokeWidth={2}
              className="animate-spin text-[var(--accent)]"
            />
            <span>
              Proofreading
              {pendingCount > 1 ? ` ${pendingCount} entries` : "…"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
