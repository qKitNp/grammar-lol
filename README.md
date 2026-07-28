# Grammar.lol

Proofread anywhere, instantly — powered by **your** ChatGPT or SuperGrok subscription.

Select text in any app, double-tap **Right Shift**, and Grammar.lol corrects grammar, spelling, and punctuation in place. History stays on your machine. There is no Grammar.lol backend and no license key.

## How it works

1. **Onboarding** — grant Accessibility, then sign in with ChatGPT or SuperGrok.
2. **Shortcut** — double-tap Right Shift to capture the current selection (or select-all if nothing is selected).
3. **Correction** — text is sent only to OpenAI (ChatGPT) or xAI (SuperGrok) using your subscription OAuth token.
4. **Replace** — the corrected text is pasted back into the original app.

## Providers

| Provider | Auth | Usage |
|----------|------|--------|
| **ChatGPT** | Browser OAuth (Codex / ChatGPT account) | Free, Go, Plus, and Pro plans |
| **SuperGrok** | Device-code OAuth at accounts.x.ai | SuperGrok or eligible X Premium+ |

Pick one provider during onboarding. Switch later in **Settings → Account**. Choose a model there as well.

## Privacy

- Proof history is stored locally in SQLite on your machine.
- Writing is sent only to the provider you signed in with, for that correction.
- OAuth tokens are saved under the app config directory with restricted permissions (`0600` on Unix) — never committed to this repo.

## Develop

```bash
bun install
bun run tauri dev
```

Requirements: Rust toolchain, platform build tools (Xcode CLT on macOS), [Bun](https://bun.sh).

## Build

```bash
bun run tauri build
```

macOS app output:

```text
src-tauri/target/release/bundle/macos/Grammar.lol.app
```

## Stack

- [Tauri 2](https://tauri.app) + React + TypeScript + Vite
- SQLite (local ledger)
- ChatGPT Codex OAuth / xAI SuperGrok device-code OAuth
