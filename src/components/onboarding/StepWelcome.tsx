import { motion } from "motion/react";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center gap-8"
    >
      <div className="text-[36px] font-semibold tracking-tight leading-none">
        grammar<span className="text-[var(--accent)]">.</span>lol
      </div>
      <div>
        <h1 className="text-[32px] font-medium tracking-tight leading-tight">
          Proofread anywhere,
          <br />
          instantly.
        </h1>
        <p className="mt-4 text-[14px] text-[var(--text-soft)] leading-relaxed max-w-[420px] mx-auto">
          Select text in any app. Double-tap Right Shift. Your writing gets
          cleaned up in place — no copy, no paste, no switching windows.
        </p>
      </div>
      <button
        onClick={onNext}
        className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity cursor-pointer"
      >
        Get started
      </button>
    </motion.div>
  );
}
