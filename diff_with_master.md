# Diff vs `origin/main` (branch `fix-claude`)

> Repo default branch is **`main`** (not `master`). This document describes the full delta of `fix-claude` relative to `origin/main`, including both already-committed and newly committed work on this branch.
>
> Purpose: give another LLM enough context to continue safely without rediscovering intent from scattered diffs.

## High-level goals

This branch has **two independent product themes**:

1. **Claude auth / provider reliability** — stop treating an installed-but-logged-out Claude CLI as healthy; surface auth errors in UI; harden capability probe caching/timeouts; fix node-pty spawn-helper resolution inside Electron asar.
2. **`t3 .` → open desktop app workspace** — CLI command that launches the installed T3 Code desktop app for a folder and starts a **new draft thread** (pencil-button semantics), including second-instance handoff when the app is already running.

There is also a merge commit of latest `origin/main` into this branch.

## Branch / commit map

| Commit / state                  | What                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `2c7df9070` `Fix claude`        | First Claude probe fixes (cache TTL on failure, longer timeout, probe `cwd`)                              |
| `85d1338c2` merge `origin/main` | Sync with latest main                                                                                     |
| _(this commit)_                 | Rest of Claude auth UX + terminal/pty fixes + full `t3 open` / desktop open-workspace pipeline + this doc |

## Theme A — Claude / provider / terminal

### Problem

Claude could appear available even when not authenticated. Capability probe failures could be cached. Capability probe could hang / run in a bad cwd. Terminal attach could drop useful error events. `node-pty` spawn-helper lookup broke under Electron `app.asar` packaging.

### Files (server)

- `apps/server/src/provider/Drivers/ClaudeDriver.ts`
  - Capability probe cache uses `Cache.makeWith` so **failed probes expire immediately** (`timeToLive: Duration.zero` on failure), successful probes keep TTL.
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
  - Probe timeout raised `8s → 20s`.
  - Probe runs with `cwd: os.tmpdir()`.
  - Uses typed Claude SDK `AccountInfo`.
  - New `isClaudeAccountAuthenticated(...)` — treats empty/`none` account fields as unauthenticated.
  - Probe result includes `authenticated: boolean`.
  - If installed but unauthenticated → provider status `error` + `auth.status: "unauthenticated"` + actionable message (`claude auth login`).
- `apps/server/src/provider/Layers/ClaudeProvider.test.ts` (**new**)
  - Covers auth detection / unauthenticated status mapping.
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts`
  - Extra coverage around Claude/provider registry behavior related to these changes.

### Files (terminal)

- `apps/server/src/terminal/NodePtyAdapter.ts`
  - Resolves `node-pty` package dir through **asar → asar.unpacked** path rewrite.
  - `resolvePackageJson` injected for testability.
- `apps/server/src/terminal/NodePtyAdapter.test.ts`
  - Tests asar unpack path + helper resolution.
- `apps/server/src/terminal/Manager.ts`
  - `isDuplicateAttachSnapshotEvent` **never** treats `error` events as duplicates (so attach errors still surface).
- `apps/server/src/terminal/Manager.test.ts`
  - Coverage for the error-event duplicate filter.

### Files (web UI)

- `apps/web/src/components/ChatView.tsx`
  - Before send: if selected provider `auth.status === "unauthenticated"`, set thread error and abort send.
- `apps/web/src/components/chat/ProviderStatusBanner.tsx`
  - Prefer server-provided `status.message` over generic copy for unauthenticated/error banners.

## Theme B — `t3 .` / `t3 open` desktop open-workspace

### Desired UX

From a terminal in a project folder:

```bash
t3 .
# or
t3 open .
```

Should:

1. Find installed desktop app (`T3 Code (Nightly)` preferred, then Alpha, then `T3 Code`).
2. Spawn the app binary with `--open-workspace <absPath> --new-thread`.
3. If app already running: second-instance delivers argv; window is revealed.
4. Renderer creates project if missing, then starts a **new draft thread** (same as sidebar pencil), expands project in sidebar.

If desktop is **not** installed and no server-forcing flags are set, root `t3` still falls back to starting the web server (previous behavior). Explicit server path remains `t3 start` / `t3 serve`.

### End-to-end data flow

```
t3 . / t3 open <path>
  → apps/server/src/cli/open.ts (+ desktopLaunch.ts)
  → spawn Electron binary with --open-workspace --new-thread
  → desktop main parses argv / second-instance (DesktopOpenIntent)
  → queue pending intent; flush via webContents IPC
  → renderer DesktopOpenWorkspaceListener
  → openWorkspaceInDesktop() → project.create? + handleNewThread(draft)
  → ackOpenWorkspace() clears pending
```

### Shared parsing

- `packages/shared/src/desktopOpenArgs.ts` (**new**)
  - `serializeDesktopOpenArgs` / `parseDesktopOpenWorkspaceArgs`
  - Flags: `--open-workspace <path>`, `--new-thread` (boolean)
- `packages/shared/src/desktopOpenArgs.test.ts` (**new**)
- `packages/shared/package.json` — export `./desktopOpenArgs`

### Contracts / IPC

- `packages/contracts/src/ipc.ts`
  - `DesktopOpenWorkspaceIntent` (+ schema)
  - `DesktopBridge` methods:
    - `onOpenWorkspace`
    - `getPendingOpenWorkspace`
    - `ackOpenWorkspace`
  - Keeps main’s fullscreen bridge APIs as well (merged from main).

### CLI (`apps/server`)

- `apps/server/src/cli/desktopLaunch.ts` (**new**)
  - Discover desktop binary:
    - `T3CODE_DESKTOP_BINARY` / `T3CODE_DESKTOP_APP` overrides
    - macOS: `/Applications` + `~/Applications` for Nightly → Alpha → T3 Code
    - Windows/Linux heuristics
  - Detached spawn with open-workspace args
- `apps/server/src/cli/desktopLaunch.test.ts` (**new**)
- `apps/server/src/cli/open.ts` (**new**)
  - `t3 open [path]` (default `.`)
  - Validates path is a directory, then launches desktop
- `apps/server/src/bin.ts`
  - Registers `open` subcommand
  - Root `t3 [cwd]`:
    - If **no** explicit server flags **and** desktop binary found → `openDesktopWorkspace`
    - Else → `runServerCommand` (server)
  - Server-forcing flags include: `--mode`, `--port`, `--host`, `--base-dir`, `--dev-url`, `--no-browser`, `--bootstrap-fd`, `--auto-bootstrap-project-from-cwd`, `--log-websocket-events`, `--tailscale-serve*`

### Desktop main process

- `apps/desktop/src/app/DesktopOpenIntent.ts` (**new**)
  - Parse argv / second-instance commandLine
  - Normalize path (must be directory)
  - Pending intent queue
  - Retry flush until renderer acks (or timeout)
  - `peek` / `ack` for late React mount race
- `apps/desktop/src/app/DesktopApp.ts` — `openIntent.register` after clerk single-instance lock
- `apps/desktop/src/main.ts` — provide `DesktopOpenIntent.layer`
- `apps/desktop/src/window/DesktopWindow.ts`
  - `dispatchOpenWorkspace(intent) => boolean` (false if backend/window not ready)
  - Sends `desktop:open-workspace`
- `apps/desktop/src/ipc/channels.ts`
  - `OPEN_WORKSPACE_CHANNEL`
  - `GET_PENDING_OPEN_WORKSPACE_CHANNEL`
  - `ACK_OPEN_WORKSPACE_CHANNEL`
  - (also retains fullscreen channels from main)
- `apps/desktop/src/ipc/methods/window.ts` — IPC handlers for pending/ack
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts` — register those handlers
- `apps/desktop/src/preload.ts` — expose bridge methods
- Tests updated: `DesktopApplicationMenu.test.ts`, `DesktopBackendPool.test.ts`

### Web renderer

- `apps/web/src/lib/openWorkspaceIntent.ts` (**new**)
  - Shared “ensure project + new draft thread” helper
  - Always new thread when `intent.newThread` (CLI default true) or project newly created
- `apps/web/src/lib/openWorkspaceIntent.test.ts` (**new**)
- `apps/web/src/components/DesktopOpenWorkspaceListener.tsx` (**new**)
  - Subscribes to `onOpenWorkspace`
  - Also drains `getPendingOpenWorkspace` on mount (cold-start race)
  - Waits briefly for primary environment
  - Expands project in sidebar; toasts on failure; acks on success
- `apps/web/src/components/AppSidebarLayout.tsx` — mounts listener

## Important behavioral notes / pitfalls

1. **Installed Nightly/Alpha must include this desktop code.** Shipping only the CLI is not enough: old apps ignore `--open-workspace` and will just focus/open without creating a draft.
2. **`t3` must be on PATH.** The npm package bin is `t3` (`apps/server` → `dist/bin.mjs`). Desktop cask does **not** install this CLI. Local symlink example used during development: `/opt/homebrew/bin/t3` → repo `apps/server/dist/bin.mjs`.
3. **Root `t3` preference:** desktop-open wins only when desktop is found and no server flags are passed. CI/scripts should keep using `t3 start` / `t3 serve`.
4. **New thread = draft**, not server `thread.create`. Matches pencil UX; thread persists after first send.
5. **Pending intent ACK** exists because IPC push can arrive before React mounts; do not remove ack/peek without replacing that race handling.
6. **Do not reuse** server `autoBootstrapProjectFromCwd` / welcome bootstrap for this feature — different semantics (server thread vs draft; web-mode defaults).

## How to validate

```bash
# CLI present
command -v t3
t3 open --help

# From a project directory, with desktop app that includes this branch’s desktop build:
t3 .
# expect: app focuses, project appears/expands, new draft composer opens

# Explicit server still works
t3 start --no-browser
```

Targeted tests worth running:

```bash
vp run --filter @t3tools/shared test src/desktopOpenArgs.test.ts
vp run --filter t3 test src/cli/desktopLaunch.test.ts
vp run --filter @t3tools/web test src/lib/openWorkspaceIntent.test.ts
# plus ClaudeProvider / NodePtyAdapter / Manager tests touched above
```

## File checklist (all branch deltas vs `origin/main`)

### New

- `apps/desktop/src/app/DesktopOpenIntent.ts`
- `apps/server/src/cli/desktopLaunch.ts`
- `apps/server/src/cli/desktopLaunch.test.ts`
- `apps/server/src/cli/open.ts`
- `apps/server/src/provider/Layers/ClaudeProvider.test.ts`
- `apps/web/src/components/DesktopOpenWorkspaceListener.tsx`
- `apps/web/src/lib/openWorkspaceIntent.ts`
- `apps/web/src/lib/openWorkspaceIntent.test.ts`
- `packages/shared/src/desktopOpenArgs.ts`
- `packages/shared/src/desktopOpenArgs.test.ts`
- `diff_with_master.md` (this file)

### Modified

- `apps/desktop/src/app/DesktopApp.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts` (custom app id → isolated Electron userData)
- `apps/desktop/src/app/DesktopEnvironment.test.ts`
- `apps/desktop/src/app/DesktopClerk.ts` (log when single-instance lock fails)
- `apps/desktop/src/main.ts`
- `scripts/t3-local.sh` / `scripts/t3-code-desktop-local.mjs` (local PATH wrappers for rebuilt desktop)
- `apps/desktop/src/window/DesktopWindow.ts`
- `apps/desktop/src/window/DesktopApplicationMenu.test.ts`
- `apps/desktop/src/backend/DesktopBackendPool.test.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/desktop/src/preload.ts`
- `apps/server/src/bin.ts`
- `apps/server/src/provider/Drivers/ClaudeDriver.ts`
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts`
- `apps/server/src/terminal/Manager.ts`
- `apps/server/src/terminal/Manager.test.ts`
- `apps/server/src/terminal/NodePtyAdapter.ts`
- `apps/server/src/terminal/NodePtyAdapter.test.ts`
- `apps/web/src/components/AppSidebarLayout.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ProviderStatusBanner.tsx`
- `packages/contracts/src/ipc.ts`
- `packages/shared/package.json`

## Local validation without a Nightly that includes open-workspace

Installed Nightly may still lack `--open-workspace`. For local smoke tests:

1. Rebuild: `vp run --filter t3 --filter @t3tools/desktop build`
2. Point `t3` at the local launcher:
   - `/opt/homebrew/bin/t3` → `scripts/t3-local.sh`
   - which sets `T3CODE_DESKTOP_BINARY` → `scripts/t3-code-desktop-local.mjs`
3. That launcher patches the local `.electron-runtime` Alpha.app bundle id to
   `com.t3tools.t3code.local-open` and sets `T3CODE_DESKTOP_APP_USER_MODEL_ID` /
   `T3CODE_HOME=~/.t3-local-open`.

**Pitfall fixed here:** desktop `setPath("userData")` previously always pointed at
`~/Library/Application Support/t3code`, so a running Nightly held
`requestSingleInstanceLock` and the local rebuild quit immediately (`before-quit`,
exit 130). Now a **custom** `T3CODE_DESKTOP_APP_USER_MODEL_ID` (≠ default) isolates
Electron userData to a matching dir name (e.g. `com-t3tools-t3code-local-open`).

Verified: `t3 .` from `/tmp/t3-open-smoke2` while Nightly is running → local app
stays up, queues/dispatches intent, renderer `ack-open-workspace`, project row
created under `~/.t3-local-open/userdata/state.sqlite`.

## Suggested follow-ups (not done here)

- Package a desktop release / Nightly that includes open-workspace handling so stock Applications builds work with `t3 .`.
- Optionally install a `t3` CLI shim from the desktop installer / brew cask.
- Deep-link variant (`t3code://open?path=...`) sharing the same `DesktopOpenIntent` queue.
- Decide whether root `t3` should always prefer desktop when installed, or only `t3 open` (current hybrid is documented above).
