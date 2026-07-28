import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import {
  checkAccessibility,
  checkLaunchAtLogin,
  enableLaunchAtLogin,
  openAccessibilitySettings,
} from "../../lib/permissions";

export function StepAccessibility({ onNext }: { onNext: () => void }) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [enableLaunchLoading, setEnableLaunchLoading] = useState(false);

  async function handleOpenSettings() {
    setOpenFailed(false);
    const ok = await openAccessibilitySettings();
    if (!ok) setOpenFailed(true);
  }

  async function handleEnableLaunchAtLogin() {
    setEnableLaunchLoading(true);
    await enableLaunchAtLogin();
    const enabled = await checkLaunchAtLogin();
    setLaunchAtLogin(enabled);
    setEnableLaunchLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const [accessibilityOk, launchAtLoginOk] = await Promise.all([
        checkAccessibility(),
        checkLaunchAtLogin(),
      ]);
      if (cancelled) return;
      setGranted(accessibilityOk);
      setLaunchAtLogin(launchAtLoginOk);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onNext]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center gap-8"
    >
      <div>
        <h1 className="text-[26px] font-medium tracking-tight leading-tight">
          Enable recommended settings
        </h1>
        <p className="mt-3 text-[13.5px] text-[var(--text-soft)] leading-relaxed max-w-[440px] mx-auto">
          grammar.lol needs Accessibility access to watch for the Right Shift
          shortcut. Launch at login keeps background proofreading available after
          restart.
        </p>
      </div>

      <div className="w-full max-w-[360px] flex flex-col gap-3 text-[12px] text-left">
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
          <span className="text-[var(--text-soft)]">Accessibility</span>
          <span className="flex items-center gap-2 text-[var(--text-soft)]">
            {granted ? "Enabled" : granted === null ? "Checking…" : "Disabled"}
            {granted && (
              <Check size={14} strokeWidth={2} className="text-green-500" />
            )}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
          <span className="text-[var(--text-soft)]">Launch at login</span>
          <span className="flex items-center gap-2 text-[var(--text-soft)]">
            {launchAtLogin
              ? "Enabled"
              : launchAtLogin === null
                ? "Checking…"
                : "Disabled"}
            {launchAtLogin && (
              <Check size={14} strokeWidth={2} className="text-green-500" />
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[320px]">
        <button
          type="button"
          onClick={handleOpenSettings}
          className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Open Accessibility Settings
        </button>
        <button
          type="button"
          onClick={handleEnableLaunchAtLogin}
          disabled={enableLaunchLoading || launchAtLogin === true}
          className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] text-[13.5px] font-medium text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {launchAtLogin
            ? "Launch at login enabled"
            : enableLaunchLoading
              ? "Enabling…"
              : "Enable launch at login"}
        </button>
        {openFailed && (
          <p className="text-[11.5px] text-[var(--text-soft)] leading-snug">
            Could not open System Settings. Open Privacy & Security →
            Accessibility and enable grammar.lol manually.
          </p>
        )}
        <button
          onClick={onNext}
          className="w-full px-4 py-2 text-[12.5px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors cursor-pointer"
        >
          Continue for now
        </button>
      </div>
    </motion.div>
  );
}
