import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import {
  checkAccessibility,
  checkInputMonitoring,
  checkLaunchAtLogin,
  enableLaunchAtLogin,
  openPermissionSettings,
} from "../../lib/permissions";

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
      <span className="text-[var(--text-soft)]">{label}</span>
      <span className="flex items-center gap-2 text-[var(--text-soft)]">
        {value ? "Enabled" : value === null ? "Checking…" : "Disabled"}
        {value && (
          <Check size={14} strokeWidth={2} className="text-green-500" />
        )}
      </span>
    </div>
  );
}

export function StepAccessibility({ onNext }: { onNext: () => void }) {
  const [accessibility, setAccessibility] = useState<boolean | null>(null);
  const [inputMonitoring, setInputMonitoring] = useState<boolean | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [enableLaunchLoading, setEnableLaunchLoading] = useState(false);

  async function handleOpenPermissions() {
    setOpenFailed(false);
    const ok = await openPermissionSettings();
    if (!ok) setOpenFailed(true);
  }

  async function handleEnableLaunchAtLogin() {
    setEnableLaunchLoading(true);
    await enableLaunchAtLogin();
    setLaunchAtLogin(await checkLaunchAtLogin());
    setEnableLaunchLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const [ax, listen, login] = await Promise.all([
        checkAccessibility(),
        checkInputMonitoring(),
        checkLaunchAtLogin(),
      ]);
      if (cancelled) return;
      setAccessibility(ax);
      setInputMonitoring(listen);
      setLaunchAtLogin(login);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onNext]);

  const permsOk = accessibility === true && inputMonitoring === true;

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
          Enable permissions
        </h1>
        <p className="mt-3 text-[13.5px] text-[var(--text-soft)] leading-relaxed max-w-[400px] mx-auto">
          Needed for the Right Shift shortcut and in-place proofreading.
        </p>
      </div>

      <div className="w-full max-w-[360px] flex flex-col gap-2 text-[12px] text-left">
        <StatusRow label="Accessibility" value={accessibility} />
        <StatusRow label="Input Monitoring" value={inputMonitoring} />
        <StatusRow label="Launch at login" value={launchAtLogin} />
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[320px]">
        <button
          type="button"
          onClick={handleOpenPermissions}
          disabled={permsOk}
          className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {permsOk ? "Permissions enabled" : "Open System Settings"}
        </button>
        {launchAtLogin !== true && (
          <button
            type="button"
            onClick={handleEnableLaunchAtLogin}
            disabled={enableLaunchLoading}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] text-[13.5px] font-medium text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enableLaunchLoading ? "Enabling…" : "Enable launch at login"}
          </button>
        )}
        {openFailed && (
          <p className="text-[11.5px] text-[var(--text-soft)] leading-snug">
            Open Privacy &amp; Security → Accessibility and Input Monitoring,
            then enable Grammar.lol.
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
