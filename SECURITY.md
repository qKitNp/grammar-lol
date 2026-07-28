# Security Policy

## Supported versions

Security fixes are applied to the latest code on `main`. If you are running a release build, upgrade to the newest release when one is available.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately using one of:

1. **[GitHub private vulnerability reporting](https://github.com/qKitNp/grammar-lol/security/advisories/new)** (preferred)
2. Email: **pranjal19@pm.me** (subject: `grammar-lol security`)

Include as much detail as you can:

- Description of the issue and impact
- Steps to reproduce, or a proof of concept
- Affected platform (macOS / Windows / Linux) and app version or commit
- Whether the issue involves secrets, OAuth tokens, local data, or remote code paths

## What to expect

- Acknowledgement within a few days when possible
- A fix or mitigation plan for confirmed issues
- Credit in the advisory or release notes if you want it (optional)

## Scope notes

Grammar.lol stores OAuth tokens and proof history locally and talks only to the AI provider you sign in with (OpenAI / xAI). Reports involving token storage, IPC/accessibility surface area, dependency supply chain, or accidental secret leakage are especially welcome.

Please do not intentionally access other users’ accounts or production systems that are not yours.
