import type { ReactNode } from "react";
import { motion } from "motion/react";

export function OnboardingShell({
  step,
  total,
  children,
}: {
  step: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)]">
      <div className="flex-1 w-full flex items-center justify-center px-10">
        <div className="w-full max-w-[520px]">{children}</div>
      </div>
      <div className="pb-10 flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <motion.span
            key={i}
            animate={{
              width: i === step ? 24 : 6,
              backgroundColor:
                i <= step ? "var(--accent)" : "var(--border)",
            }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="h-[6px] rounded-full"
          />
        ))}
      </div>
    </div>
  );
}
