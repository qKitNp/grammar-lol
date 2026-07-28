import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToasts, type ToastTone } from "../lib/store";

const toneStyles: Record<
  ToastTone,
  { ring: string; icon: typeof Info; iconColor: string }
> = {
  info: {
    ring: "ring-[var(--border)]",
    icon: Info,
    iconColor: "text-[var(--text-soft)]",
  },
  success: {
    ring: "ring-emerald-500/30",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  error: {
    ring: "ring-red-500/40",
    icon: AlertCircle,
    iconColor: "text-red-400",
  },
};

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { ring, icon: Icon, iconColor } = toneStyles[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto rounded-lg bg-[var(--surface)] p-3 pr-2 text-[13px] text-[var(--text)] shadow-lg ring-1 ${ring}`}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={`mt-[2px] shrink-0 ${iconColor}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{t.title}</div>
                  {t.description && (
                    <div className="mt-1 text-[12px] leading-snug text-[var(--text-soft)]">
                      {t.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 rounded-md p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--bg)] hover:text-[var(--text)] cursor-pointer"
                  aria-label="Dismiss"
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
