import { useEffect, useState } from "react";
import { ONBOARDING_FLAG } from "./Onboarding";
import {
  getAuthStatus,
  getModelSettings,
  loginWithChatgpt,
  setModel,
  signOut,
  startXaiLogin,
  waitForXaiLogin,
  type AuthStatus,
  type ModelSettings,
  type ProviderId,
} from "../lib/auth";

export function Settings() {
  const [autostart, setAutostart] = useState(true);
  const [preview, setPreview] = useState(false);

  return (
    <div className="max-w-[720px]">
      <h1 className="text-[24px] font-medium tracking-tight">Settings</h1>

      <AccountSection />

      <Section title="Shortcut">
        <Row label="Proofread selection">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <Kbd>⇧</Kbd>
              <span className="text-[11px] text-[var(--text-faint)]">then</span>
              <Kbd>⇧</Kbd>
            </div>
            <div className="text-[11px] text-[var(--text-faint)]">
              Double-tap Right Shift within 450ms
            </div>
          </div>
        </Row>
        <Row label="Undo last proof">
          <div className="flex items-center gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>Z</Kbd>
          </div>
        </Row>
      </Section>

      <Section title="Behaviour">
        <Toggle
          label="Launch at login"
          hint="Grammar.lol lives in the menu bar"
          value={autostart}
          onChange={setAutostart}
        />
        <Toggle
          label="Preview before replacing"
          hint="show a HUD; Enter accepts, Esc cancels"
          value={preview}
          onChange={setPreview}
        />
      </Section>

      <Section title="Custom dictionary">
        <CustomDictionary />
      </Section>

      <Section title="Help">
        <Row label="Replay onboarding">
          <button
            onClick={() => {
              localStorage.removeItem(ONBOARDING_FLAG);
              window.location.reload();
            }}
            className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer"
          >
            Show again
          </button>
        </Row>
      </Section>
    </div>
  );
}

function AccountSection() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [models, setModels] = useState<ModelSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xaiCode, setXaiCode] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [s, m] = await Promise.all([getAuthStatus(), getModelSettings()]);
      setStatus(s);
      setModels(m);
    } catch {
      setStatus({
        signed_in: false,
        provider: null,
        label: null,
        provider_label: null,
        model: null,
      });
      setModels(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function connect(provider: ProviderId) {
    setBusy(true);
    setError(null);
    setXaiCode(null);
    try {
      await signOut().catch(() => {});
      if (provider === "chatgpt") {
        await loginWithChatgpt();
      } else {
        const start = await startXaiLogin();
        setXaiCode(start.user_code);
        await waitForXaiLogin(start.interval, start.expires_in);
      }
      setXaiCode(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setXaiCode(null);
    }
  }

  async function handleModelChange(model: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await setModel(model);
      setModels(next);
      setStatus((s) => (s ? { ...s, model: next.selected } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.signed_in;
  const identity =
    status?.label ||
    (connected ? "Connected" : "Not connected");

  return (
    <Section title="Account">
      <Row label="Provider">
        <span className="text-[13px] text-[var(--text-soft)]">
          {status?.provider_label ?? "—"}
        </span>
      </Row>
      <Row label="Signed in as">
        <span className="text-[13px] text-[var(--text-soft)]">{identity}</span>
      </Row>
      {connected && models && (
        <Row label="Model">
          <select
            value={models.selected}
            disabled={busy}
            onChange={(e) => void handleModelChange(e.target.value)}
            className="max-w-[240px] text-[12.5px] px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] outline-none focus:border-[var(--accent)] cursor-pointer disabled:opacity-50"
          >
            {models.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Row>
      )}
      {xaiCode && (
        <div className="px-5 py-3 text-[13px] text-[var(--text-soft)]">
          Enter code <span className="font-mono tracking-wider text-[var(--text)]">{xaiCode}</span> in
          your browser…
        </div>
      )}
      {error && (
        <div className="px-5 py-3 text-[12.5px] text-red-500">{error}</div>
      )}
      <Row label="Actions">
        <div className="flex flex-wrap gap-2 justify-end">
          {!connected && (
            <>
              <button
                disabled={busy}
                onClick={() => connect("chatgpt")}
                className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer disabled:opacity-50"
              >
                {busy ? "…" : "ChatGPT"}
              </button>
              <button
                disabled={busy}
                onClick={() => connect("xai")}
                className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer disabled:opacity-50"
              >
                SuperGrok
              </button>
            </>
          )}
          {connected && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  connect(status?.provider === "chatgpt" ? "xai" : "chatgpt")
                }
                className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer disabled:opacity-50"
              >
                Switch provider
              </button>
              <button
                disabled={busy}
                onClick={handleSignOut}
                className="text-[12.5px] px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--sidebar)] cursor-pointer disabled:opacity-50"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </Row>
    </Section>
  );
}

function CustomDictionary() {
  const [words, setWords] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const word = raw.trim().replace(/,+$/, "").trim();
    if (word && !words.includes(word)) setWords((w) => [...w, word]);
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(input);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.endsWith(",")) {
      add(val);
    } else {
      setInput(val);
    }
  };

  return (
    <>
      <div className="px-5 py-4 min-h-[80px] flex flex-wrap gap-2 items-start">
        {words.length === 0 && (
          <span className="text-[12px] text-[var(--text-faint)] select-none">
            No words yet — add one below
          </span>
        )}
        {words.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-full px-2.5 py-0.5 text-[12px] font-mono text-[var(--text)]"
          >
            {w}
            <button
              onClick={() => setWords((ws) => ws.filter((x) => x !== w))}
              className="text-[var(--text-faint)] hover:text-[var(--text)] leading-none cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="px-5 py-3">
        <input
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="Add a word or phrase…"
          className="w-full bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none"
        />
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[13px] font-medium text-[var(--text-soft)] uppercase tracking-[0.08em] mb-4">
        {title}
      </h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-5 py-3.5">
      <div className="text-[13.5px] text-[var(--text)]">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-[24px] px-1.5 font-mono text-[11px] text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded">
      {children}
    </kbd>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 px-5 py-3.5">
      <div>
        <div className="text-[13.5px] text-[var(--text)]">{label}</div>
        <div className="text-[12px] text-[var(--text-soft)] mt-0.5">{hint}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-[22px] w-[38px] rounded-full transition-colors cursor-pointer ${
          value ? "bg-[var(--accent)]" : "bg-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-all ${
            value ? "left-[18px]" : "left-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
