# T3 Code

T3 Code is a minimal web GUI for coding agents (currently Codex, Claude, Cursor, and OpenCode, more coming soon).

## About this fork

This is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that adds **account usage limits** to the UI.

Two rings sit next to the composer send button for the selected provider — one for the short rolling window, one for the week. Hovering either shows how much is used and when it resets. The same numbers appear on every card in **Settings → Providers**.

Limits are read directly from each provider CLI rather than inferred from turns you run inside T3 Code, so they stay accurate when you use the same account elsewhere:

- **Codex** — `account/rateLimits/read` on the app-server, folded into the provider probe that already runs (no extra process).
- **Claude** — the `/usage` control request on the lightweight SDK probe session that already reads account info. Its prompt never yields, so no API request is made and no tokens are spent.

Live `account.rate-limits.updated` events still apply instantly during a turn; probe and event snapshots are reconciled by timestamp so neither overwrites fresher data.

Windows are classified by their duration, not by the field they arrive in — Codex reports a 7-day window under `primary`, which would otherwise be labelled as a 5-hour limit.

**Cursor shows nothing.** Its CLI (`cursor-agent status/about`) and ACP surface expose no account usage — `usage_update` carries per-turn context and cost, not plan limits. Rather than fabricate numbers, the meter stays empty. Grok and OpenCode are likewise not covered.

This fork also carries desktop `t3 .` / `t3 open` support, Claude probe and terminal hardening, and a few provider fixes. [**`diff_with_master.md`**](./diff_with_master.md) is the full handoff document for everything that differs from upstream — themes, rationale, pitfalls, and the open follow-ups left by the last upstream merge.

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx t3@latest
```

Tip: Use `npx t3@latest --help` for the full CLI reference.

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

There's no public docs site yet, checkout the miscellaneous markdown files in [docs](./docs).

## Documentation

- [Getting started](./docs/getting-started/quick-start.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider guides](./docs/providers/codex.md)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
