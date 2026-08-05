import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  cancelChatgptLogin,
  enableAppleIntelligence,
  getAppleIntelligenceStatus,
  loginWithChatgpt,
  startXaiLogin,
  waitForXaiLogin,
  type AppleIntelligenceStatus,
  type ProviderId,
} from "../../lib/auth";

type Phase =
  | { kind: "pick" }
  | { kind: "chatgpt-wait" }
  | { kind: "xai-wait"; userCode: string; verificationUri: string; remaining?: number }
  | { kind: "error"; message: string; provider?: ProviderId };

export function StepAccountLogin({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [apple, setApple] = useState<AppleIntelligenceStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getAppleIntelligenceStatus()
      .then(setApple)
      .catch(() =>
        setApple({
          supported: false,
          available: false,
          reason: "Could not check Apple Intelligence status.",
        }),
      );
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleChatgpt() {
    abortRef.current?.abort();
    setPhase({ kind: "chatgpt-wait" });
    try {
      await loginWithChatgpt();
      onNext();
    } catch (e) {
      setPhase({
        kind: "error",
        provider: "chatgpt",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleXai() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const start = await startXaiLogin();
      setPhase({
        kind: "xai-wait",
        userCode: start.user_code,
        verificationUri: start.verification_uri_complete ?? start.verification_uri,
        remaining: start.expires_in,
      });
      await waitForXaiLogin(
        start.interval,
        start.expires_in,
        (remaining) => {
          setPhase((p) =>
            p.kind === "xai-wait" ? { ...p, remaining } : p,
          );
        },
        ac.signal,
      );
      onNext();
    } catch (e) {
      if (ac.signal.aborted) return;
      setPhase({
        kind: "error",
        provider: "xai",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleApple() {
    abortRef.current?.abort();
    try {
      await enableAppleIntelligence();
      onNext();
    } catch (e) {
      setPhase({
        kind: "error",
        provider: "apple_intelligence",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function openVerification(uri: string) {
    try {
      await openUrl(uri);
    } catch {
      window.open(uri, "_blank");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center gap-8 w-full max-w-[420px]"
    >
      <div>
        <h1 className="text-[26px] font-medium tracking-tight leading-tight">
          Choose a proofreading engine
        </h1>
        <p className="mt-3 text-[13.5px] text-[var(--text-soft)] leading-relaxed">
          Use on-device Apple Intelligence, or your ChatGPT / SuperGrok subscription.
          Your writing is never sent to a Grammar.lol server.
        </p>
      </div>

      {phase.kind === "pick" && (
        <div className="flex flex-col gap-3 w-full">
          {apple?.supported && (
            <ProviderButton
              title="Continue with Apple Intelligence"
              subtitle={
                apple.available
                  ? "On-device · free · private"
                  : (apple.reason ?? "Not available right now")
              }
              onClick={handleApple}
              disabled={!apple.available}
            />
          )}
          <ProviderButton
            title="Continue with ChatGPT"
            subtitle="Works with Free, Go, Plus, and Pro plans"
            onClick={handleChatgpt}
          />
          <ProviderButton
            title="Continue with SuperGrok"
            subtitle="Uses your SuperGrok or X Premium+ plan"
            onClick={handleXai}
          />
        </div>
      )}

      {phase.kind === "chatgpt-wait" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <Spinner />
          <p className="text-[13.5px] text-[var(--text-soft)]">
            Complete sign-in in your browser…
          </p>
          <p className="text-[12px] text-[var(--text-faint)]">
            A browser window should open. Approve access, then return here.
          </p>
          <button
            onClick={() => {
              void cancelChatgptLogin();
              setPhase({ kind: "pick" });
            }}
            className="text-[12.5px] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {phase.kind === "xai-wait" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-[13px] text-[var(--text-soft)]">Enter this code if asked:</p>
          <div className="font-mono text-[28px] tracking-[0.2em] font-medium px-6 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {phase.userCode}
          </div>
          <Spinner />
          <p className="text-[13px] text-[var(--text-soft)]">
            Waiting for approval
            {phase.remaining != null ? ` · ${phase.remaining}s` : ""}…
          </p>
          <button
            onClick={() => openVerification(phase.verificationUri)}
            className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer"
          >
            Open xAI again
          </button>
          <button
            onClick={() => {
              abortRef.current?.abort();
              setPhase({ kind: "pick" });
            }}
            className="text-[12.5px] text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-[13px] text-red-500 max-w-[360px]">{phase.message}</p>
          <button
            onClick={() => setPhase({ kind: "pick" })}
            className="px-6 py-2.5 rounded-lg bg-[var(--accent)] text-white text-[13.5px] font-medium hover:opacity-90 cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}
    </motion.div>
  );
}

function ProviderButton({
  title,
  subtitle,
  onClick,
  disabled,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-5 py-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50 disabled:hover:border-[var(--border)] disabled:cursor-not-allowed"
    >
      <div className="text-[14px] font-medium text-[var(--text)]">{title}</div>
      <div className="text-[12px] text-[var(--text-soft)] mt-0.5">{subtitle}</div>
    </button>
  );
}

function Spinner() {
  return (
    <div
      className="h-6 w-6 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin"
      aria-hidden
    />
  );
}
