import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";

export function Overlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    listen("overlay-show", () => setVisible(true)).then((fn) =>
      unlisteners.push(fn),
    );
    listen("overlay-hide", () => setVisible(false)).then((fn) =>
      unlisteners.push(fn),
    );
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2.5 rounded-full bg-[var(--surface)] px-4 py-2 text-[12.5px] text-[var(--text)] shadow-lg ring-1 ring-[var(--border)]"
          >
            <Loader2
              size={14}
              strokeWidth={2}
              className="animate-spin text-[var(--accent)]"
            />
            <span>Proofreading…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
