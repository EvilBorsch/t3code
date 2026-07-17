# Diff vs `origin/main` (branch `fix-claude`)

> Default branch is **`main`** (there is no `master` remote). This file is the full handoff
> document for **everything** on `fix-claude` that differs from `origin/main`, so another
> human/LLM can continue without rediscovering intent from scattered commits.

**Sync status (at time of writing):** **3 commits behind** / **6 commits ahead** of
`origin/main`. Re-check with:

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Currently behind on unrelated `main` work (`#4079` dropped events, `#4017` Claude
`CLAUDE_CONFIG_DIR`, `#4014` screenshot harness) — merge/rebase before shipping if needed.

## Commits on this branch (oldest → newest)

| Commit      | Summary                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `2c7df9070` | `Fix claude` — first Claude probe hardening (TTL on failure, timeout, cwd) |
| `85d1338c2` | Merge `origin/main` into `fix-claude`                                      |
| `08728b5b4` | Full `t3 open` / desktop open-workspace pipeline + remaining Claude/pty/UI |
| `14c07d7f2` | Isolate local Electron userData from Nightly + local `t3` launcher scripts |
| `6dad6216b` | Document full `fix-claude` delta vs `origin/main` (this handoff doc)       |
| `6db2e51e9` | macOS Nightly open fix: pending-file + `open -a`, prefer installed Nightly |

## Product themes (all intentional deltas)

This branch is **not** a single-feature branch. It has three themes:

1. **Claude auth / provider reliability** — installed-but-logged-out Claude must not look healthy; probe must be robust; UI must block send and show server message.
2. **Terminal / node-pty under Electron** — spawn-helper resolution through `app.asar` → `app.asar.unpacked`; attach must not hide error events.
3. **`t3 .` / `t3 open` → desktop workspace + new draft** — CLI launches **installed Nightly** (not local Alpha) with open-workspace intent; desktop queues intent (argv / second-instance / pending-file); renderer creates project + draft (pencil semantics). Includes local-dev isolation so a rebuilt desktop can run beside installed Nightly when explicitly opted in.

---

## Theme A — Claude auth / capability probe

### Problem

- Claude CLI could be installed but unauthenticated; T3 still treated the provider as usable.
- Capability probe failures could be cached for the full TTL, delaying recovery.
- Probe could hang / run in a bad working directory (server cwd).
- UI banner used generic copy even when the server already sent a specific message.
- Send path did not hard-block unauthenticated providers.

### Behavior now

1. Capability probe timeout: **8s → 20s**.
2. Probe runs with **`cwd: os.tmpdir()`** (not the server process cwd).
3. Probe uses typed Claude SDK `AccountInfo`.
4. New `isClaudeAccountAuthenticated(account)`:
   - looks at email / organization / subscriptionType / tokenSource / apiKeySource;
   - empty / `"none"` (case-insensitive) do **not** count as authenticated;
   - also treats non-`firstParty` `apiProvider` as authenticated signal.
5. Probe result includes **`authenticated: boolean`**.
6. If installed but `authenticated === false` → provider status:
   - `status: "error"`
   - `auth.status: "unauthenticated"`
   - actionable `message`: run `claude auth login`
7. Capabilities cache (`ClaudeDriver`): **`Cache.makeWith`** — successful probes keep TTL; **failed / empty probes expire immediately** (`Duration.zero`).
8. Web:
   - `ChatView` aborts send when selected provider `auth.status === "unauthenticated"` and sets thread error (prefers server `message`).
   - `ProviderStatusBanner` prefers `status.message` over generic unauthenticated/error copy.

### Files

| Path                                                       | Change                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/server/src/provider/Layers/ClaudeProvider.ts`        | timeout, cwd, auth detection, unauthenticated status mapping |
| `apps/server/src/provider/Layers/ClaudeProvider.test.ts`   | **new** — probe cwd + auth mapping coverage                  |
| `apps/server/src/provider/Drivers/ClaudeDriver.ts`         | fail-fast capability cache TTL                               |
| `apps/server/src/provider/Layers/ProviderRegistry.test.ts` | related registry/Claude coverage                             |
| `apps/web/src/components/ChatView.tsx`                     | block send when unauthenticated                              |
| `apps/web/src/components/chat/ProviderStatusBanner.tsx`    | prefer server message                                        |

---

## Theme B — Terminal / node-pty (Electron asar)

### Problem

Inside packaged Electron, `node-pty` lives under `app.asar` but native `spawn-helper` is in `app.asar.unpacked`. Resolving `node-pty/package.json` without rewriting the path broke helper lookup. Separately, terminal attach treated some `error` events as duplicate snapshots and dropped them.

### Behavior now

1. `NodePtyAdapter` rewrites package dir:
   - `app.asar` → `app.asar.unpacked`
   - `node_modules.asar` → `node_modules.asar.unpacked`
2. `resolvePackageJson` is injectable for tests.
3. `isDuplicateAttachSnapshotEvent` **never** returns true for `event.type === "error"`.

### Files

| Path                                              | Change                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| `apps/server/src/terminal/NodePtyAdapter.ts`      | asar rewrite + injectable package.json resolver          |
| `apps/server/src/terminal/NodePtyAdapter.test.ts` | asar / helper resolution tests                           |
| `apps/server/src/terminal/Manager.ts`             | error events never treated as duplicate attach snapshots |
| `apps/server/src/terminal/Manager.test.ts`        | coverage for error-event filter                          |

---

## Theme C — `t3 .` / `t3 open` desktop open-workspace

### Desired UX

```bash
t3 .
# or
t3 open .
# or
t3 open /absolute/or/relative/path
```

Should:

1. Resolve an absolute directory path.
2. Find a desktop binary (**Nightly → Alpha → `T3 Code`**, or env override).
3. Hand off an open-workspace intent to that app and start a **new draft thread**.
4. Renderer: ensure project exists (create if missing), expand it, start a **new draft thread** (same as sidebar pencil — **not** server `thread.create` until first send).
5. Ack pending intent so cold-start races are safe.

If desktop is **not** found and no server-forcing flags are set, root `t3` still falls back to starting the web server. Explicit server remains `t3 start` / `t3 serve`.

### macOS Launch Services / Nightly handoff (`6db2e51e9`)

**Bugs this commit fixed:**

1. Local `scripts/t3-local.sh` forced `T3CODE_DESKTOP_BINARY` → rebuilt **Alpha** / `.electron-runtime`, so `t3 .` opened Alpha instead of installed Nightly.
2. Spawning `…/Contents/MacOS/T3 Code (Nightly)` directly is fragile on macOS (helper resolution / Launch Services). Warm start via Launch Services does **not** reliably deliver CLI argv through Electron `second-instance`.
3. A bad in-place patch of the installed `.app` (corrupt `Info.plist` / replaced `app.asar`) made Nightly unable to launch at all — always reinstall from a proper DMG, do not hand-edit the bundle.

**Behavior now (macOS):**

1. CLI writes `~/.t3/userdata/pending-open-workspace.json` (`T3CODE_HOME` aware).
2. CLI activates the **`.app` bundle** with `open -a <bundle> --args --open-workspace=<abs> --new-thread` (not a bare MacOS binary spawn).
3. Desktop consumes the pending file on:
   - cold start (`argv` + pending-file),
   - `second-instance`,
   - `activate`,
   - a long-lived poller (~750ms) so warm start works even when Nightly is already frontmost and `activate` does not fire.
4. Stale pending files older than **120s** are ignored and deleted.
5. Argv serialization prefers `--open-workspace=<path>` (equals form) so Chromium cannot insert switches between flag and value.

Non-macOS still spawns the resolved binary with the same args; pending-file is still written as a belt-and-suspenders channel.

### End-to-end data flow

```
t3 . / t3 open <path>
  → apps/server/src/cli/open.ts (+ desktopLaunch.ts)
  → write ~/.t3/userdata/pending-open-workspace.json
  → macOS: open -a "<Nightly>.app" --args --open-workspace=… --new-thread
     other: spawn binary with same args
  → desktop main: DesktopOpenIntent
       sources: argv | second-instance | pending-file (activate + poller)
  → queue pending intent; flush via webContents IPC
  → renderer DesktopOpenWorkspaceListener
  → openWorkspaceInDesktop() → project.create? + handleNewThread(draft)
  → ackOpenWorkspace() clears in-memory pending
```

### Shared parsing

- `packages/shared/src/desktopOpenArgs.ts`
  - `serializeDesktopOpenArgs` / `parseDesktopOpenWorkspaceArgs`
  - Pending-file helpers: `writePendingDesktopOpenWorkspace`, `readPendingDesktopOpenWorkspace`, `clearPendingDesktopOpenWorkspace`
  - Flags: `--open-workspace[=]<path>`, `--new-thread`
  - Source: `"argv" | "second-instance" | "pending-file"`
- `packages/shared/src/desktopOpenArgs.test.ts` — equals-form, spaced-form, pending round-trip, stale expiry
- `packages/shared/package.json` — export `./desktopOpenArgs`

### Contracts / IPC

- `packages/contracts/src/ipc.ts`
  - `DesktopOpenWorkspaceIntent` (+ schema) including `source: "pending-file"`
  - Bridge: `onOpenWorkspace`, `getPendingOpenWorkspace`, `ackOpenWorkspace`

### CLI (`apps/server`)

- `apps/server/src/cli/desktopLaunch.ts`
  - Discovery order:
    - `T3CODE_DESKTOP_BINARY` / `T3CODE_DESKTOP_APP`
    - macOS: `/Applications` + `~/Applications` for Nightly → Alpha → T3 Code (candidates carry `appBundlePath`)
    - Windows/Linux heuristics
  - Writes pending intent under `T3CODE_HOME/userdata` (default `~/.t3/userdata`)
  - macOS: `open -a <appBundlePath> --args …`; else detached binary spawn
- `apps/server/src/cli/desktopLaunch.test.ts` — Nightly preference + bundle path coverage
- `apps/server/src/cli/open.ts` — `t3 open [path]` (default `.`)
- `apps/server/src/bin.ts`
  - Registers `open`
  - Root `t3 [cwd]`: if **no** server flags **and** desktop binary found → `openDesktopWorkspace`; else server
  - Server-forcing flags include: `--mode`, `--port`, `--host`, `--base-dir`, `--dev-url`, `--no-browser`, `--bootstrap-fd`, `--auto-bootstrap-project-from-cwd`, `--log-websocket-events`, `--tailscale-serve*`

### Desktop main

- `apps/desktop/src/app/DesktopOpenIntent.ts` — parse/validate directory, queue, consume pending-file, flush until ack/timeout, peek/ack for late React mount; `activate` + poller for macOS warm starts
- `apps/desktop/src/app/DesktopApp.ts` — `openIntent.register` after clerk single-instance lock
- `apps/desktop/src/main.ts` — provide layer
- `apps/desktop/src/window/DesktopWindow.ts` — `dispatchOpenWorkspace(intent) => boolean`
- IPC: `channels.ts`, `methods/window.ts`, `DesktopIpcHandlers.ts`, `preload.ts` (accepts `pending-file` source)
- Tests touched: `DesktopApplicationMenu.test.ts`, `DesktopBackendPool.test.ts`

### Desktop identity isolation (local rebuilt app vs installed Nightly)

**Bug:** local Electron passed `--user-data-dir=…`, but startup always `setPath("userData", ~/Library/Application Support/t3code)` — same path as Nightly → `requestSingleInstanceLock` failed → immediate `before-quit` / exit 130.

**Fix:** if `T3CODE_DESKTOP_APP_USER_MODEL_ID` differs from the default (`com.t3tools.t3code` / `.dev`), Electron userData dir name becomes the id with `.` → `-` (e.g. `com-t3tools-t3code-local-open`). Legacy display-name path is not used for custom identities.

Also: log a warning when single-instance lock is unavailable (`DesktopClerk`).

| Path                                              | Change                                               |
| ------------------------------------------------- | ---------------------------------------------------- |
| `apps/desktop/src/app/DesktopEnvironment.ts`      | custom app id → isolated userData / legacy dir names |
| `apps/desktop/src/app/DesktopEnvironment.test.ts` | asserts isolated dir names for override              |
| `apps/desktop/src/app/DesktopClerk.ts`            | warn before quitting duplicate process               |

### Web renderer

- `apps/web/src/lib/openWorkspaceIntent.ts` (**new**) — ensure project + new draft
- `apps/web/src/lib/openWorkspaceIntent.test.ts` (**new**)
- `apps/web/src/components/DesktopOpenWorkspaceListener.tsx` (**new**) — subscribe + drain pending on mount + ack
- `apps/web/src/components/AppSidebarLayout.tsx` — mounts listener

### Local PATH wrappers

Default local CLI wiring should open **installed Nightly**, not the Alpha electron-runtime rebuild.

| Path                                | Role                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/t3-local.sh`               | Resolves `REPO_ROOT` from script location; execs rebuilt `apps/server/dist/bin.mjs`; **unsets** `T3CODE_DESKTOP_BINARY` unless `T3CODE_USE_LOCAL_DESKTOP=1` |
| `scripts/t3-code-desktop-local.mjs` | Optional local desktop launcher (`.electron-runtime` Alpha), custom bundle id + `T3CODE_HOME=~/.t3-local-open` — only when debugging desktop itself         |

Typical wiring (machine-local):

```bash
# after: vp run --filter t3 build
# (and a Nightly DMG from this branch installed into /Applications)
ln -sf "$PWD/scripts/t3-local.sh" /opt/homebrew/bin/t3
```

Opt into local Alpha desktop only when needed:

```bash
T3CODE_USE_LOCAL_DESKTOP=1 t3 .
```

**Rebuild Nightly for Theme C desktop code** (pending-file consumer lives in the app):

```bash
node scripts/build-desktop-artifact.ts \
  --platform mac --target dmg --arch arm64 \
  --build-version 0.0.29-nightly.YYYYMMDD.N
# then ditto the .app from the DMG into /Applications — do not patch Info.plist/asar in place
```

Verified smoke (post-`6db2e51e9` Nightly install):

- Cold `t3 .` → Nightly process with `--open-workspace=…`, intent queued (`argv` + `pending-file`), dispatched, ack.
- Warm `t3 .` while Nightly running → pending file consumed via poller/`activate`, dispatched with `source: pending-file`.
- No Alpha process; `/Applications/T3 Code (Nightly).app` Info.plist remains a full dict (`CFBundleExecutable`, etc.).

---

## Important pitfalls

1. **Stock Nightly/Alpha must include Theme C desktop code** (including pending-file). CLI alone is not enough; old apps ignore `--open-workspace` / never read the pending file.
2. **`t3` must be on PATH.** Desktop cask does not install the CLI. Use npm/server bin or `scripts/t3-local.sh`.
3. **Root `t3` prefers desktop** only when a desktop binary is found and no server flags are passed. CI should keep using `t3 start` / `t3 serve`.
4. **New thread = draft** (pencil), not server `thread.create`.
5. **Pending intent ACK** is required for cold-start IPC-before-React races — do not remove peek/ack without a replacement.
6. **Do not reuse** server `autoBootstrapProjectFromCwd` for this feature (different semantics).
7. **Running Nightly + local rebuild** without custom `T3CODE_DESKTOP_APP_USER_MODEL_ID` collides on Electron userData / single-instance lock — use `T3CODE_USE_LOCAL_DESKTOP=1` only when intentional.
8. **Never hand-edit** an installed `.app` (`Info.plist` / `app.asar`) to “hot-patch” open-workspace — that broke Nightly launches (`Unable to find helper app`). Always reinstall from a DMG/`ditto`.
9. **macOS warm start needs pending-file** — `open -a` does not reliably deliver argv to an already-running Electron app via `second-instance`.

---

## How to validate

```bash
# Claude / terminal unit coverage (representative)
vp run --filter t3 test -- \
  src/provider/Layers/ClaudeProvider.test.ts \
  src/terminal/NodePtyAdapter.test.ts \
  src/terminal/Manager.test.ts

# From apps/server (avoid full suite if it hangs in this env):
cd apps/server && vp test run src/cli/desktopLaunch.test.ts

vp run --filter @t3tools/shared test -- src/desktopOpenArgs.test.ts
# or from packages/shared:
cd packages/shared && vp test run src/desktopOpenArgs.test.ts

vp run --filter @t3tools/web test -- src/lib/openWorkspaceIntent.test.ts
vp run --filter @t3tools/desktop test -- src/app/DesktopEnvironment.test.ts

# Manual: Claude unauthenticated → banner + send blocked
# Manual: t3 open against Nightly built from this branch
command -v t3
t3 open --help
cd /some/project && t3 .
# expect: Nightly focuses (not Alpha), project appears/expands, new draft composer opens
# warm: run t3 . again while Nightly is already open — same behavior via pending-file

t3 start --no-browser   # explicit server still works
```

Full branch gate (before considering done):

```bash
vp check
vp run typecheck
```

---

## Complete file checklist vs `origin/main`

### Added

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
- `scripts/t3-code-desktop-local.mjs`
- `scripts/t3-local.sh`
- `diff_with_master.md` (this file)

### Modified

- `apps/desktop/src/app/DesktopApp.ts`
- `apps/desktop/src/app/DesktopClerk.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/app/DesktopEnvironment.test.ts`
- `apps/desktop/src/backend/DesktopBackendPool.test.ts`
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/window/DesktopApplicationMenu.test.ts`
- `apps/desktop/src/window/DesktopWindow.ts`
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

---

## Suggested follow-ups (not done on this branch)

- Merge/rebase onto current `origin/main` (branch is 3 commits behind).
- Ship a Nightly/Alpha release that includes Theme C (pending-file + `open -a` path) so stock installs work without rebuilding from this checkout.
- Install a `t3` CLI shim from the desktop installer / brew cask.
- Deep-link (`t3code://open?path=...`) reusing `DesktopOpenIntent` + pending-file.
- Decide whether root `t3` should always prefer desktop when installed, or only `t3 open`.
- Harden flush-until-ack so the renderer does not receive duplicate `dispatchOpenWorkspace` IPC while waiting for ack (poller can re-flush).
