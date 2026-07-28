# Contributing to Grammar.lol

Thanks for helping improve Grammar.lol. This guide covers setup, workflow, and what makes a good contribution.

## Code of conduct

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

### Requirements

- [Bun](https://bun.sh)
- [Rust toolchain](https://rustup.rs) (stable)
- Platform build tools:
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Visual Studio Build Tools (C++ workload)
  - **Linux:** WebKitGTK and other [Tauri Linux dependencies](https://v2.tauri.app/start/prerequisites/)

### Run locally

```bash
bun install
bun run tauri dev
```

### Build

```bash
bun run tauri build
```

### Frontend-only checks

```bash
bun run build   # tsc + vite build
```

## How we work

1. **Open an issue first** for non-trivial changes (features, behavior changes, larger refactors). Small docs/typo fixes can go straight to a PR.
2. **Fork and branch** from `main` (e.g. `fix/short-description` or `feat/short-description`).
3. **Keep PRs focused** — one concern per PR when practical.
4. **Do not commit secrets** — OAuth tokens, `.env`, `auth.json`, keys, or personal credentials. See `.gitignore`.
5. **Test on your platform** before requesting review. Note in the PR what you tested (macOS / Windows / Linux).

## Pull requests

- Fill out the PR template.
- Ensure CI is green (typecheck / lint checks on PRs; full Tauri builds may run on `main`).
- Prefer clear commit messages that explain *why*.
- Link related issues (`Fixes #123`).

## Project layout

| Path | Role |
|------|------|
| `src/` | React + TypeScript UI |
| `src-tauri/` | Rust / Tauri backend |
| `plugins/` | Vite plugins (e.g. OAuth bridge) |
| `.github/` | CI, templates, Dependabot |

## License

By contributing, you agree that your contributions are licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only), the same license as the project.
