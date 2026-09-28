# Diff vs `origin/main` (branch `fix-claude-usage-master`)

> Handoff document for **everything** on this branch that differs from `origin/main`
> (upstream `pingdotgg/t3code`; the default branch is `main`, there is no `master`).
> Published as [`EvilBorsch/t3code`](https://github.com/EvilBorsch/t3code). Written so a
> human or an LLM can continue without reconstructing intent from commits.
>
> This file describes the **current** delta only. Features upstream has since absorbed are
> listed once under _Absorbed by upstream_ so nobody re-adds them.

**Sync status 2026-09-28:** merged `origin/main` at `d15210cd3d`, **0 behind / 39 ahead**
(fork commits + merges). Upstream now ships `DesktopBridge.getPathForFile` itself; the fork's
duplicate was dropped. Re-check with:

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git diff --stat origin/main...HEAD
```

**Upstream merge routine:** `git merge origin/main`, resolve, then rebuild and reinstall the
desktop app (see _Building and installing_). Treat every section below as fork-owned when
resolving conflicts: never take upstream's side of those files wholesale.

---

## 1. Always-visible usage limits (composer + provider list)

**Why.** Upstream ships the data (`ServerProvider.usageLimits`, `ProviderUsageLimitsIngestion`,
Usage → Limits, the `/usage-limits` composer command) but shows it only on demand. This fork
exists to keep spent and remaining quota visible while working.

**What.**

- `apps/web/src/components/chat/ProviderUsageMeter.tsx` — one ring per window beside the
  composer send button for the selected provider. Badges: session `5h`, weekly `7d`,
  model-scoped weekly = model initial (Claude's `seven_day_<model>`), monthly `30d`. Fill is
  the spent share; colour is success, warning from 75%, error above 90%. Hovering any ring
  opens the full breakdown: every window with `% used · % left`, a bar, reset countdown plus
  absolute time, pace, and banked Codex reset credits.
- `ProviderUsageMeter.logic.ts` (+ `.test.ts`) — ordering, badges, expiry. A window whose
  reset has passed renders 0% with "waiting for fresh data" instead of a stale number.
  An account that cannot report (`unavailable`) or a failed probe draws nothing.
- `settings/ProviderInstanceCard.tsx` — the same rings inline on every provider row
  (`Session · 42% used · resets in 2h 13m`) and a "Usage limits" section in the provider
  editor built on upstream's `LimitWindows` bars.
- `ChatComposer.tsx` passes `selectedProviderStatus` into `ComposerFooterPrimaryActions`
  as `usageProvider`.
- Clock is the shared minute tick (`hooks/useNowMinute`), never a per-component timer.
- Codex can report only a weekly window on some plans (`primary` = 7d, `secondary` null);
  a single `7d` ring is data, not a bug.
- Mobile keeps upstream's on-demand panel only.

## 2. Context window ring always on

Upstream #9190 made `ContextWindowMeter` opt-in behind `contextWindowMeterEnabled`
(default `false`, a "legacy" toggle), which hid the ring. The fork renders it whenever the
thread reports a context window:

- `ChatComposer.tsx` — no gate on the setting; `shouldReserveContextWindowMeter` lost its
  `meterEnabled` input (`ContextWindowMeter.logic.ts` + test).
- `settings/SettingsPanels.tsx`, `settings/settingsSearch.ts` — the toggle row, its search
  entry and its legacy-target id are removed. The contract field stays so stored client
  settings keep decoding.

## 3. Claude capability probe runs in a neutral directory

`apps/server/src/provider/Drivers/ClaudeDriver.ts` passes `os.tmpdir()` as the probe cwd
(and cache key) instead of the server cwd. Claude Code scans its working directory on
initialization; measured: `/tmp` ~0.6s, a project ~0.4s, `$HOME` **~58s**. The desktop
server's cwd is `$HOME`, so upstream's choice blows the 25s probe budget on every refresh and
the provider card sticks on _"Could not verify Claude authentication status…"_ while turns
keep working. `Layers/ClaudeProvider.test.ts` guards the cwd.

`ChatView.tsx` additionally refuses to send when the selected provider reports
`auth.status === "unauthenticated"` (with the server's message). Upstream's Claude probe no
longer emits that status, so today this only fires for other providers.

**Do not regress:** never point the probe at the server cwd. A project directory would be fine.

## 4. Terminal / node-pty under packaged Electron

- `apps/server/src/terminal/NodePtyAdapter.ts` — resolves `node-pty`'s package dir through
  `app.asar` → `app.asar.unpacked` (and `node_modules.asar` → `.unpacked`) so `spawn-helper`
  is found; the package.json resolver is injectable for tests.
- `apps/server/src/terminal/Manager.ts` — an `error` event is never treated as a duplicate
  attach snapshot and dropped.
- The "make the helper executable" once-guard is keyed by helper path, not a single
  process-wide flag, so adapters with different resolvers (tests, two package roots) each
  chmod their own helper.
- Tests in `NodePtyAdapter.test.ts`, `Manager.test.ts`.

## 5. `t3 .` / `t3 open` → desktop workspace with a new draft thread

**UX.** `t3 .`, `t3 open .`, `t3 open <path>` resolve the directory, find the installed desktop
app (Nightly → Alpha → `T3 Code`, or `T3CODE_DESKTOP_BINARY` / `T3CODE_DESKTOP_APP`), hand it
an open-workspace intent, and the renderer creates the project if missing, expands it and
opens a **new draft** (pencil semantics, no server `thread.create` until first send). With no
desktop found and no server flags, root `t3` still starts the web server; `t3 start` /
`t3 serve` stay explicit.

**Flow.**

```
t3 . / t3 open <path>
  → apps/server/src/cli/open.ts (+ desktopLaunch.ts)
  → write ~/.t3/userdata/pending-open-workspace.json   (T3CODE_HOME aware)
  → macOS: open -a "<app>.app" --args --open-workspace=<abs> --new-thread
     other: spawn the binary with the same args
  → desktop main: DesktopOpenIntent (argv | second-instance | pending-file)
  → flush over IPC until the renderer acks
  → DesktopOpenWorkspaceListener → openWorkspaceInDesktop() → project + draft → ack
```

**macOS specifics.** Launch Services does not reliably deliver argv to an already-running
Electron app, so the pending file is the real channel: the app reads it on cold start,
`second-instance`, `activate`, and a ~750ms poller for warm starts while it is frontmost.
Files older than 120s are ignored and deleted. Argv uses the `--open-workspace=<path>` form so
Chromium cannot insert switches between flag and value.

**Files.**

| Area          | Paths                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared        | `packages/shared/src/desktopOpenArgs.ts` (+ test; `./desktopOpenArgs` export in `packages/shared/package.json`) — arg serialize/parse, pending-file read/write/clear                                                                                                               |
| Contracts     | `packages/contracts/src/ipc.ts` — `DesktopOpenWorkspaceIntent` (`source: argv \| second-instance \| pending-file`), bridge `onOpenWorkspace` / `getPendingOpenWorkspace` / `ackOpenWorkspace`                                                                                      |
| CLI           | `apps/server/src/cli/open.ts`, `cli/desktopLaunch.ts` (+ test), `bin.ts` — root command prefers desktop unless a server flag (`--mode`, `--port`, `--host`, `--base-dir`, `--dev-url`, `--no-browser`, …) is passed                                                                |
| Desktop main  | `app/DesktopOpenIntent.ts`, `app/DesktopApp.ts`, `main.ts`, `window/DesktopWindow.ts` (`dispatchOpenWorkspace`), `ipc/channels.ts`, `ipc/methods/window.ts`, `ipc/DesktopIpcHandlers.ts`, `preload.ts`                                                                             |
| Renderer      | `apps/web/src/lib/openWorkspaceIntent.ts` (+ test), `components/DesktopOpenWorkspaceListener.tsx`, mounted from `AppSidebarLayout.tsx`                                                                                                                                             |
| Identity      | `app/DesktopEnvironment.ts` (+ test) — a custom `T3CODE_DESKTOP_APP_USER_MODEL_ID` gets its own userData dir (`com-t3tools-t3code-local-open`), so a local rebuild never fights the installed app's single-instance lock                                                           |
| Local scripts | `scripts/t3-local.sh` (the `/opt/homebrew/bin/t3` symlink target; execs `apps/server/dist/bin.mjs`, unsets `T3CODE_DESKTOP_BINARY` unless `T3CODE_USE_LOCAL_DESKTOP=1`), `scripts/t3-code-desktop-local.mjs` (launch the rebuilt Alpha with an isolated bundle id, debugging only) |

**Pitfalls.**

1. The installed app must be built from this branch: a stock Nightly ignores
   `--open-workspace` and never reads the pending file.
2. Never hand-edit an installed `.app` (`Info.plist`, `app.asar`) — that broke launches once.
   Reinstall from the built zip.
3. The pending-intent ack exists for the cold-start race where IPC fires before React mounts.
   Do not remove peek/ack without a replacement.
4. Do not reuse the server's `autoBootstrapProjectFromCwd` for this; different semantics.

## 6. Timeline ergonomics (turn folds)

- Each "Worked for …" fold row carries `userPromptPreview` (preceding prompt, whitespace
  collapsed, ≤140 chars) and `userMessageId`. The preview is a button that scrolls to the
  prompt; collapsing a fold also scrolls back to its prompt, since a long turn leaves the
  viewport on the final reply.
- Changed-file trees auto-expand only when small (`CHANGED_FILES_DEFAULT_EXPAND_MAX = 12`).
- `chat/MessagesTimeline.tsx`, `MessagesTimeline.logic.ts` (+ test).

## 7. Warm thread cache healing

`packages/client-runtime/src/state/threads.ts` — `isReusableThreadDetailCache`: a cached
snapshot with assistant output or a settled turn but **no user message** lost its prompt
(warm caches resume via `afterSequence`, so the `thread.message-sent` event can never come
back). Such a cache is deleted and the thread reloaded instead of rendering one-sided. A
still-running turn without messages is an early state, not corruption. Tests:
`threadCache.test.ts`, `threads-sync.test.ts`, `threads-pagination.test.ts`.

## 8. Sidebar follows the open thread

`Sidebar.logic.ts` — `useRevealActiveThreadRow(routeThreadKey)` scrolls the active thread's
row into view on route change (search and the command palette can land anywhere). Wired in
both `Sidebar.tsx` and `LegacySidebar.tsx` via `data-thread-key`; the legacy sidebar also
keeps the open thread visible as the only row of a collapsed project.

## 9. Composer OS file drop → path mentions

`chat/composerFileDrop.ts` (+ test) — `planComposerFileDrop`: a dropped file whose absolute
path the desktop bridge can resolve becomes an `@` path mention; images, browser drops and
path-less files go through upstream's `addComposerAttachments`. `DesktopBridge.getPathForFile?`
in `packages/contracts/src/ipc.ts` + `preload.ts` (Electron `webUtils.getPathForFile`,
`undefined` in browsers). Wired in `ChatComposer.tsx`.

## 10. Model reroute notice in the work log

`apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` maps the `model.rerouted`
runtime event (Claude safety fallback Fable → Opus, Codex `model/rerouted`) to an info
activity: _"Model switched: claude-fable-5 → claude-opus-5 (refusal:cyber)"_. Upstream
emits the event but dropped it in ingestion. Test:
`ProviderRuntimeIngestion.modelRerouted.test.ts`. Known gap: `retracted_message_uuids` are not
processed, so a refused partial answer can stay visible.

The same file namespaces assistant segment message ids by `turn:` so a `session/load` replay
cannot collide with a live turn; `acp/AcpSessionRuntime.ts` exports `assistantItemId` for its
test (`AcpSessionRuntime.assistantItemId.test.ts`).

## 11. Syntax highlighter engine claim

`apps/web/src/lib/syntaxHighlighting.ts` — `claimSyntaxHighlighterEngine()`, called in
`main.tsx` before the first render. `getSharedHighlighter` keeps one highlighter per document
and the first caller picks the regex engine; without the early claim the diff panel could
create it on the JS engine and stall the chat. Test: `syntaxHighlighting.engine.test.ts`.

## 12. Agent browser access off by default

`packages/contracts/src/settings.ts` — `enableAgentBrowserAccess` defaults to `false`.

## 13. Local macOS build signing

Unsigned builds left Electron's stock linker signature, which macOS cannot match to TCC
grants, so the app asked for folder access on every launch. `scripts/sign-macos-local.ts`
(+ test) is an electron-builder `afterSign` hook, wired by `scripts/build-desktop-artifact.ts`
for unsigned mac builds, that ad-hoc signs the bundle. The ad-hoc cdhash changes per build, so
macOS asks once per install; `T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY=<self-signed cert>` gives an
identity that survives rebuilds. Documented in `docs/operations/development.md`.

## Non-product files in the delta

- `README.md` — fork section.
- `docs/user/usage.md` — two sentences on the composer rings.
- `diff_with_master.md` — this file.

---

## Absorbed by upstream (do not re-add)

| Former fork feature                                                                                              | Upstream now                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Usage-limit **data** path (`providerUsage.ts`, `ProviderUsageMonitor`, registry overlay, `ServerProvider.usage`) | `ServerProvider.usageLimits`, `ProviderUsageLimitsIngestion`, Limits tab (#9507). Only the UI in §1 is fork code. |
| Thread message search (FTS5 migration, `searchThreads` RPC, palette)                                             | Upstream `searchThreads` in `ws.ts`. No fork code remains.                                                        |
| Claude `model_refusal_fallback` handling in `ClaudeAdapter`                                                      | Upstream handles the SDK message; the fork keeps only the ingestion mapping (§10).                                |
| Hard-coded Claude catalog (Opus 5 / xhigh)                                                                       | Remote model manifest (#9084).                                                                                    |
| Claude logged-out detection (`unauthenticated` status)                                                           | Upstream's `apiProvider` model; a logged-out Claude reports `ready`. See follow-ups.                              |
| `ProviderStatusBanner` preferring the server message                                                             | Upstream does the same.                                                                                           |
| Assistant item id namespacing in `AcpSessionRuntime`                                                             | Upstream landed the same fix; only the export + test remain.                                                      |

---

## Building and installing

```bash
node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 \
  --build-version <apps/desktop version>-nightly.<YYYYMMDD>.<n>
ditto -x -k release/T3-Code-<version>-arm64.zip /tmp/t3-install
codesign --verify --deep --strict "/tmp/t3-install/T3 Code (Nightly).app"
rm -rf "/Applications/T3 Code (Nightly).app" && mv "/tmp/t3-install/T3 Code (Nightly).app" /Applications/
```

Rebuilds web + server + desktop, so `t3` (symlink → `scripts/t3-local.sh` →
`apps/server/dist/bin.mjs`) updates with it. Never keep a second `.app` copy around: same bundle
id, and macOS TCC ping-pongs folder prompts between them. The previous zip in `release/` is
the rollback.

## How to validate

```bash
# web
cd apps/web && vp test run \
  src/components/chat/ProviderUsageMeter.logic.test.ts \
  src/components/chat/ContextWindowMeter.logic.test.ts \
  src/components/chat/MessagesTimeline.logic.test.ts \
  src/components/chat/composerFileDrop.test.ts \
  src/lib/openWorkspaceIntent.test.ts \
  src/lib/syntaxHighlighting.engine.test.ts --project unit
cd apps/web && vp run typecheck

# server
cd apps/server && vp test run \
  src/provider/Layers/ClaudeProvider.test.ts \
  src/terminal/NodePtyAdapter.test.ts src/terminal/Manager.test.ts \
  src/cli/desktopLaunch.test.ts \
  src/orchestration/Layers/ProviderRuntimeIngestion.modelRerouted.test.ts

# shared / client-runtime / desktop / scripts
cd packages/shared && vp test run src/desktopOpenArgs.test.ts
cd packages/client-runtime && vp test run src/state/threadCache.test.ts
cd apps/desktop && vp test run src/app/DesktopEnvironment.test.ts
vp test run scripts/sign-macos-local.test.ts

# manual
cd /some/project && t3 .      # installed app focuses, project appears, new draft opens
t3 .                          # again while the app is open: same, via the pending file
t3 start --no-browser         # explicit server still works
```

## Follow-ups (not done)

- **Fail-fast capability caching.** `ClaudeDriver.ts` uses upstream's `Cache.make` with a flat
  5-minute TTL, so a failed probe is cached for the full window and any probe regression
  presents as a sticky error. The pre-merge `Cache.makeWith` expired failures immediately.
- **Logged-out Claude.** Upstream reports a logged-out Claude as `ready`; re-adding an
  `unauthenticated` status needs a rule that does not mislabel Bedrock.
- Model reroute: process `retracted_message_uuids` (§10).
- Usage rings on mobile.
- Ship the open-workspace desktop code in a real release, or a `t3` shim from the installer,
  so `t3 .` works without building from this checkout.
