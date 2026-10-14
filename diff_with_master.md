# Diff vs `origin/main` (branch `fix-claude-usage-master`)

> Handoff document for **everything** on this branch that differs from `origin/main`
> (upstream `pingdotgg/t3code`; the default branch is `main`, there is no `master`).
> Published as [`EvilBorsch/t3code`](https://github.com/EvilBorsch/t3code). Written so a
> human or an LLM can continue without reconstructing intent from commits.
>
> This file describes the **current** delta only. Features upstream has since absorbed, or that
> its rewrites made obsolete, are listed once under _Absorbed or obsolete_ so nobody re-adds them.

**Sync status 2026-10-13:** merged `origin/main` at `6524a8d437` (desktop `0.0.45`). This merge
brought upstream's orchestration V2 rewrite (#2829): the server's V1 `orchestration/` layer is
gone, providers live in `orchestration-v2/Adapters/*` and `packages/provider-*`, the client read
model is V2, and the server keeps its state in `statev2.sqlite` (copied once from `state.sqlite`
on first start; the V1 file is left alone). Re-check with:

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git diff --stat origin/main...HEAD
```

**Upstream merge routine:** fetch `fork` and `origin`, move onto `fork/fix-claude-usage-master`
if it is ahead, `git merge origin/main`, resolve, then rebuild and reinstall the desktop app (see
_Building and installing_). Treat every section below as fork-owned when resolving conflicts:
never take upstream's side of those files wholesale. Upstream's lint now rejects off-scale
Tailwind values and restyled `components/ui` exports (`shadcn/no-arbitrary-values`,
`shadcn/no-restyle`, `shadcn/no-raw-colors`); run `vp lint` on the fork files after every merge.

---

## 1. Always-visible usage limits (composer + provider list)

**Why.** Upstream ships the data (`ServerProvider.usageLimits`, Usage → Limits, the
`/usage-limits` composer banner) but shows it only on demand. This fork exists to keep spent
and remaining quota visible while working.

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
- `settings/ProviderInstanceCard.tsx` — the same rings inline on every enabled provider row
  (`Session · 42% used · resets in 2h 13m`) and a "Usage limits" section in the provider
  editor built on upstream's `LimitWindows` bars, placed after upstream's setup section.
- `ChatComposer.tsx` passes `selectedProviderStatus` into `ComposerFooterPrimaryActions`
  as `usageProvider`; the meter renders first in that footer. Upstream measures the resting
  actions' width, so the rings need no reserved padding.
- Clock is the shared minute tick (`hooks/useNowMinute`), never a per-component timer.
- Codex can report only a weekly window on some plans (`primary` = 7d, `secondary` null);
  a single `7d` ring is data, not a bug.
- Mobile keeps upstream's on-demand panel only.

## 2. Context window ring always on

Upstream makes `ContextWindowMeter` opt-in behind `contextWindowMeterEnabled` (default `false`,
"Context window indicator (legacy)"). The fork renders it whenever the thread reports a
context window:

- `ChatComposer.tsx` — no gate on the setting; `shouldReserveContextWindowMeter` has no
  `meterEnabled` input (`ContextWindowMeter.logic.ts` + test).
- `settings/SettingsPanels.tsx`, `settings/settingsSearch.ts` — the toggle row, its search
  entry and its legacy-target id are removed. The contract field stays so stored client
  settings keep decoding.

## 3. Claude capability probe runs in a neutral directory

`apps/server/src/provider/Drivers/ClaudeDriver.ts` passes `os.tmpdir()` as the probe cwd, cache
key and `checkClaudeProviderStatus` cwd instead of the server cwd. Claude Code scans its working
directory on initialization; measured: `/tmp` ~0.6s, a project ~0.4s, `$HOME` **~58s**. The
desktop server's cwd is `$HOME`, so upstream's choice blows the probe budget on every refresh and
the provider card sticks on _"Could not verify Claude authentication status…"_ while turns keep
working. Guarded by "probes Claude capabilities from the temp directory" in
`provider/ProviderInstanceRegistry.test.ts`: the fixture Claude binary
(`provider/testing/ProviderInstanceRegistryLive.fixture.mjs`) records its cwd when
`T3_CLAUDE_PROBE_CWD_FILE` is set.

`ChatView.tsx` additionally refuses to send when the selected provider reports
`auth.status === "unauthenticated"` (with the server's message). Upstream only excludes such
providers from load balancing.

**Do not regress:** never point the probe at the server cwd. A project directory would be fine.

## 4. Terminal / node-pty under packaged Electron

- `apps/server/src/terminal/NodePtyAdapter.ts` — resolves `node-pty`'s package dir through
  `app.asar` → `app.asar.unpacked` (and `node_modules.asar` → `.unpacked`) so `spawn-helper`
  is found. The package.json resolver is injectable through `NodePtyPackageJsonResolverRef`,
  next to upstream's `NodePtyModuleLoaderRef`. Upstream's desktop now ships a staged runtime,
  so the rewrite may never fire; it is a no-op unless the path contains `app.asar`.
- The "make the helper executable" once-guard is keyed by helper path, not one process-wide
  flag, so adapters with different resolvers each chmod their own helper.
- `apps/server/src/terminal/Manager.ts` — an `error` event is never treated as a duplicate
  attach snapshot and dropped.
- Tests in `NodePtyAdapter.test.ts` (runs the fake node-pty), `Manager.test.ts`.

## 5. `t3 .` / `t3 open` → desktop workspace with a new draft thread

**UX.** `t3 .`, `t3 open .`, `t3 open <path>` resolve the directory, find the installed desktop
app (Nightly → Alpha → `T3 Code`, or `T3CODE_DESKTOP_BINARY` / `T3CODE_DESKTOP_APP`), hand it
an open-workspace intent, and the renderer creates the project if missing, waits until it is
in the read model, expands it and opens a **new draft** (pencil semantics, no server thread
until first send). `t3 <path>` with no server flag (any flag except `--cwd`) goes to the desktop
when one is installed; otherwise it falls back to upstream's default server command. Bare `t3`
always starts the server: dev runners launch it bare and configure it through env, so handing it
to an installed desktop app broke `vp run dev` (test in `cli/desktopLaunch.test.ts`).
`t3 start` / `t3 serve` stay explicit.

Upstream's closest feature is `t3 app [path]` (`cli/app.ts`, `DesktopAppActivation`), which only
works when the desktop app is already running; its "Install `t3` command" settings button only
puts the bundled server CLI on PATH, and its `t3 ./dir` starts a web server. Rebuilding
`t3 open` on top of `t3 app` would be a reasonable later simplification.

**Flow.**

```
t3 . / t3 open <path>
  → apps/server/src/binCli.ts → cli/open.ts (+ cli/desktopLaunch.ts)
  → write $T3CODE_HOME/userdata/pending-open-workspace.json
  → macOS: open -a "<app>.app" --args --open-workspace=<abs> --new-thread
     other: spawn the binary with the same args
  → desktop main: DesktopOpenIntent (argv | second-instance | pending-file)
  → DesktopWindow.dispatchOpenWorkspace (upstream's shared renderer dispatch, reveals the window)
  → DesktopOpenWorkspaceListener → openWorkspaceInDesktop() → project + draft → ack
```

**macOS specifics.** Launch Services does not reliably deliver argv to an already-running
Electron app, so the pending file is the real channel: the app reads it on cold start,
`second-instance`, `activate`, and a ~750ms poller for warm starts while it is frontmost.
Files older than 120s are ignored and deleted. Argv uses the `--open-workspace=<path>` form so
Chromium cannot insert switches between flag and value.

**Files.**

| Area          | Paths                                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared        | `packages/shared/src/desktopOpenArgs.ts` (+ test; `./desktopOpenArgs` export in `packages/shared/package.json`) — arg serialize/parse, pending-file read/write/clear                                                                                                                                         |
| Contracts     | `packages/contracts/src/ipc.ts` — `DesktopOpenWorkspaceIntent` (`source: argv \| second-instance \| pending-file`), bridge `onOpenWorkspace` / `getPendingOpenWorkspace` / `ackOpenWorkspace`                                                                                                                |
| CLI           | `apps/server/src/binCli.ts` (root command), `cli/open.ts`, `cli/desktopLaunch.ts` (+ test; `DesktopAppResolver` reference so tests never launch the real app — upstream's `cli/app.test.ts` pins "no desktop installed")                                                                                     |
| Desktop main  | `app/DesktopOpenIntent.ts`, `app/DesktopApp.ts`, `main.ts`, `window/DesktopWindow.ts`, `ipc/channels.ts`, `ipc/methods/window.ts`, `ipc/DesktopIpcHandlers.ts`, `preload.ts`                                                                                                                                 |
| Renderer      | `apps/web/src/lib/openWorkspaceIntent.ts` (+ test), `components/DesktopOpenWorkspaceListener.tsx` (subscribes once the primary environment is connected), mounted from `AppSidebarLayout.tsx`                                                                                                                |
| Identity      | `app/DesktopEnvironment.ts` exposes `customUserDataDirName` for a custom `T3CODE_DESKTOP_APP_USER_MODEL_ID`; `app/DesktopUserData.ts` puts that build in `<appData>/<name>` (e.g. `com-t3tools-t3code-local-open`), so a local rebuild never fights the installed app's single-instance lock. Tests in both. |
| Local scripts | `scripts/t3-local.sh` (the `/opt/homebrew/bin/t3` symlink target; execs `apps/server/dist/bin.mjs`, unsets `T3CODE_DESKTOP_BINARY` unless `T3CODE_USE_LOCAL_DESKTOP=1`), `scripts/t3-code-desktop-local.mjs` (launch the rebuilt app with an isolated bundle id, debugging only)                             |

**Pitfalls.**

1. The installed app must be built from this branch: a stock build ignores
   `--open-workspace` and never reads the pending file.
2. Never hand-edit an installed `.app` (`Info.plist`, `app.asar`) — that broke launches once.
   Reinstall from the built zip.
3. The pending-intent ack exists for the cold-start race where IPC fires before React mounts:
   the renderer pulls the intent with `getPendingOpenWorkspace` once its listener subscribes, and
   `ack` clears it. Desktop main does not resend on a timer; a resend loop revealed the window
   every 500ms while the backend booted. Do not remove peek/ack without a replacement.
4. Do not reuse the server's `autoBootstrapProjectFromCwd` for this; different semantics.
5. With a desktop app installed, `t3 ./missing-dir` fails with "not a directory" instead of
   creating it, unlike upstream's documented `t3 <path>`.

## 6. Turn-fold prompt preview

Upstream's V2 timeline folds each response by `runId`. When a user message starts the
response, the fold row carries `userPromptPreview` (whitespace collapsed, ≤140 chars) and
`userMessageId`; both are null when a notification starts it. The preview is a button that
scrolls to the prompt, and collapsing a fold scrolls back to its prompt (decided in
`TurnFoldTimelineRow` from `row.expanded`), since a long turn leaves the viewport on the final
reply. `chat/MessagesTimeline.tsx`, `MessagesTimeline.logic.ts` (+ test).

## 8. Sidebar follows the open thread

`Sidebar.logic.ts` — `useRevealActiveThreadRow(routeThreadKey)` scrolls the active thread's row
into view on route change, and `requestSidebarThreadReveal` does the same after a command-palette
selection (`CommandPalette.tsx` also clears the project scope and expands the target project).
Rows are found by upstream's `data-thread-item={threadKey}` attribute, which `LegacySidebar.tsx`
now sets too; upstream's motion clones drop it, so a row animating out is never the target. The
legacy sidebar also keeps the open thread visible as the only row of a collapsed project, and
beyond the preview count of an expanded one. Test: `Sidebar.reveal.test.tsx`.

Orchestration V2 models subagents as real child threads (`lineage.relationshipToParent ===
"subagent"`). Upstream's new sidebar hides them with `filterSidebarV2VisibleThreads`, but its
legacy sidebar still listed them as ordinary rows. `LegacySidebar.tsx` now uses the same filter for
project rows, project sorting and jump-key order; subagents stay in the parent's timeline.

## 9. Composer OS file drop → path mentions

`chat/composerFileDrop.ts` (+ test) — `planComposerFileDrop`: in a **local** environment
(upstream's `folderDropTarget(...) === "local"`), a dropped file whose absolute path the desktop
bridge resolves (`DesktopBridge.getPathForFile`, upstream's) becomes an `@` path mention. Images,
browser drops, path-less files and every drop into a remote environment go through upstream's
attachments. Upstream's own `addDroppedFolders` handles folders. Wired in `ChatComposer.tsx`.

## 10. Codex model reroute notice in the work log

`apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` — the `model/rerouted` handler
still updates the subagent model selection (upstream), then attaches a completed
`system_notice` turn item to the active turn: _"Model switched: gpt-x → gpt-y
(highRiskCyberActivity)"_. No active turn (child or finished turn) → nothing is shown. Test:
"shows a model reroute in the turn's work log" in `CodexAdapterV2.test.ts`. Claude's
`model_refusal_fallback` notice is upstream's. Known gap: Claude `retracted_message_uuids` are
not processed, so a refused partial answer can stay visible.

## 11. Syntax highlighter engine claim

`apps/web/src/lib/syntaxHighlighting.ts` — `claimSyntaxHighlighterEngine()`, called in
`main.tsx` before the first render. `getSharedHighlighter` keeps one highlighter per document
and the first caller picks the regex engine; without the early claim the diff panel could
create it on the JS engine and stall the chat. Test: `syntaxHighlighting.engine.test.ts`.

## 12. Agent browser access off by default

`packages/contracts/src/settings.ts` — `enableAgentBrowserAccess` defaults to `false`. With §15's
`/mcp` filter, agents without browser access no longer see `preview_*` tools at all.

## 13. Local macOS build signing

Unsigned builds left Electron's stock linker signature, which macOS cannot match to TCC
grants, so the app asked for folder access on every launch. `scripts/sign-macos-local.ts`
(+ test) is an electron-builder `afterSign` hook, wired by `scripts/build-desktop-artifact.ts`
for unsigned mac builds, that ad-hoc signs the bundle. The ad-hoc cdhash changes per build, so
macOS asks once per install; `T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY=<self-signed cert>` gives an
identity that survives rebuilds. Documented in `docs/operations/development.md`.

## 14. Providers refresh when a chat opens

`apps/web/src/hooks/useChatProviderRefresh.ts` (wired in `ChatView.tsx`) and
`apps/mobile/src/features/threads/use-chat-provider-refresh.ts` (wired in `ThreadRouteScreen.tsx`
and `NewTaskDraftScreen.tsx`), + tests — once per opened chat, after the environment connects,
refresh every provider with `refreshModels: true`, so a provider that recovered (logged in,
updated CLI) becomes selectable without a trip to Settings. Upstream refreshes only the selected
instance's stale workspace snapshot (web) or on pull-to-refresh in the model picker (mobile).

## 15. Agent tool groups (what T3 adds to agents)

**Why.** Upstream always attaches its `t3-code` MCP server (~80 tools) to every provider session
and appends long orchestration and PR-linking instructions; tools a session may not use
(`preview_*`, `device_*`) were still listed and refused at call time. The user wants a request from
T3 to reach Claude Code / Codex like their own CLI, opting into T3 extras one group at a time.

**What.** Five server settings, project-scoped, under **Settings → Integrations**:

| Setting                               | MCP capability              | Prompt text                                                | Default   |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------- | --------- |
| `enableAgentVisualReplies` (fork)     | `html` (fork)               | visuals section                                            | on        |
| `enableAgentThreadTools` (fork)       | `orchestration`, `worktree` | orchestration instructions, handoff `t3_thread_read` hints | off       |
| `enableAgentPullRequestTools` (fork)  | `pull-requests`             | `<pull_request_linking>`                                   | off       |
| `enableAgentBrowserAccess` (upstream) | `preview`                   | browser block                                              | off (§12) |
| `enableAgentDeviceAccess` (upstream)  | `device`                    | device block                                               | off       |

`runtime_info` is always sent (Codex now gets it even without MCP). With every group off no
credential is issued and the `t3-code` server is not attached. With every group on, behavior is
upstream's.

**How.**

- `ProviderSessionManager.prepareMcpSession` grants exactly the enabled groups' capabilities
  (resolved per project, fail-closed for a missing project); an empty set clears and revokes the
  credential; a changed set rotates it. `McpSessionRegistry.issue` grants exactly what it is asked
  for. OAuth clients (`auth/McpOAuth.ts`) also get `html`.
- `mcp/McpHttpServer.ts` — `toolkitCapabilities` maps each toolkit to its capability; the auth
  middleware filters `tools/list` responses and answers `tools/call` for a hidden tool with a
  JSON-RPC "not found" error without running it. A coverage test fails when a registered tool is
  missing from the table: add every new upstream toolkit there.
- `packages/provider-core/src/server/mcpSession.ts` — `T3AgentTools` / `t3AgentTools(session)`;
  `orchestrationInstructions.ts` (visuals split into `T3_CODE_VISUAL_REPLY_INSTRUCTIONS`,
  builders take `T3AgentTools`), `runtimeInstructions.ts` (PR block only with PR tools),
  `handoffBudget.ts`. Every adapter passes `T3AgentTools` instead of a `hasT3Mcp` boolean:
  `ClaudeAdapterV2`, `CodexAdapterV2` + `provider/CodexDeveloperInstructions.ts`, `provider-acp`,
  `provider-cursor`, `provider-opencode` (v1, v2), `provider-muse`, `provider-pi`
  (`T3_PI_SYSTEM_PROMPT`). Expect small, mechanical merge conflicts at those call sites.
- `ContextHandoffDelivery.ts` / `ProviderTurnStartService.ts` drop `t3_thread_read` hints at
  delivery when the receiving session lacks thread tools.
- `packages/effect-codex-app-server/src/replay.ts` ignores `t3_code_*` `additionalContext` keys when
  matching `turn/start`, like `developer_instructions`.
- UI: `settings/ProjectDefaultsSettings.tsx`, `settingsSearch.ts`, `SettingsPanels.tsx`; mobile
  `SettingsServerControlsRouteScreen.tsx`. User doc: `docs/user/project-settings.md` → Agent tools.

**Tests.** `ProviderSessionManager.test.ts` (capability sets per settings, overrides, rotation,
all-off), `McpHttpServer.test.ts` (filtered list, refused call, coverage), adapter tests for each
provider (prompt per tool set), `ContextHandoffBudget.test.ts`, provider-core instruction tests.

## 16. Claude prompt cache TTL survives 5-minute tail writes

Upstream's Compact chip (#16631, #17127, #17945) appears when a large Claude thread's prompt cache
looks expired, using the TTL of the latest response's cache write. Claude Code writes the
conversation prefix with 1h entries but sometimes only a short tail with 5m, so a turn ending on such
a write reported 5 minutes and the chip appeared after 5 minutes idle while the prefix stayed cached.
`ClaudeAdapterV2.ts` remembers per native thread that a 1h write happened (until the next
`compact_boundary`) and keeps reporting 1h; sessions that only write 5m (API key, Bedrock, Vertex)
keep 5 minutes. The memory is not persisted across server restarts. Tests in
`ClaudeAdapterV2.test.ts` ("prompt cache TTL" scenarios).

## Non-product files in the delta

- `README.md` — fork section.
- `docs/user/usage.md` — two sentences on the composer rings.
- `diff_with_master.md` — this file.

---

## Absorbed or obsolete (do not re-add)

| Former fork feature                                                                                              | Upstream now                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usage-limit **data** path (`providerUsage.ts`, `ProviderUsageMonitor`, registry overlay, `ServerProvider.usage`) | `ServerProvider.usageLimits`, `ProviderUsageLimitsIngestion`, Limits tab (#9507). Only the UI in §1 is fork code.                                                                                                                    |
| Thread message search (FTS5 migration, `searchThreads` RPC, palette)                                             | Upstream `searchThreads`, in-thread find (`mod+f`). No fork code remains; the live DB's migration ledger matches upstream.                                                                                                           |
| Claude `model_refusal_fallback` handling and its work-log notice                                                 | `ClaudeAdapterV2` emits a `system_notice` itself. The V1 `ProviderRuntimeIngestion` mapping was deleted with V1.                                                                                                                     |
| Hard-coded Claude catalog (Opus 5 / xhigh)                                                                       | Remote model manifest (#9084).                                                                                                                                                                                                       |
| Claude logged-out detection (`unauthenticated` status)                                                           | Upstream's `apiProvider` model; a logged-out Claude reports `ready`. See follow-ups.                                                                                                                                                 |
| `ProviderStatusBanner` preferring the server message                                                             | Upstream does the same.                                                                                                                                                                                                              |
| Assistant item id namespacing (`AcpSessionRuntime` export + test, "empty Cursor replies after `session/load`")   | `packages/provider-acp` namespaces ids per runtime and blocks `session/load` replay; the V2 ACP adapter scopes ids by turn; Cursor now runs on the Cursor SDK.                                                                       |
| Warm thread cache healing (`isReusableThreadDetailCache`)                                                        | V2 client cache is schema-versioned (`ORCHESTRATION_THREAD_CACHE_SCHEMA_VERSION`) and drops undecodable entries; bounded windows persist with their cursor, so "no user message" is a valid state. Fix corruption by a version bump. |
| Changed-files tree auto-expand (≤12 files)                                                                       | Upstream's `ChangedFilesCard` remembers its own expanded state and starts collapsed.                                                                                                                                                 |
| Context-ring padding (`pr-28/pr-20/pr-12`)                                                                       | Upstream measures the composer's resting actions width.                                                                                                                                                                              |
| MCP tool catalogs per session capability (fa65fe8b78)                                                            | Per-request caller isolation is upstream's. Hiding tools by capability is back as §15's `/mcp` filter (one server, filtered per caller), not one server per capability set.                                                          |

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
the rollback; a V2 build's data lives in `statev2.sqlite`, so rolling back to a V1 build reads the
untouched `state.sqlite` and misses everything done since.

## How to validate

```bash
# web (LANG=en_US.UTF-8: some upstream sidebar tests assert English weekday names)
cd apps/web && vp test run \
  src/components/chat/ProviderUsageMeter.logic.test.ts \
  src/components/chat/ContextWindowMeter.logic.test.ts \
  src/components/chat/MessagesTimeline.logic.test.ts \
  src/components/chat/composerFileDrop.test.ts \
  src/components/Sidebar.reveal.test.tsx \
  src/hooks/useChatProviderRefresh.test.tsx \
  src/lib/openWorkspaceIntent.test.ts \
  src/lib/syntaxHighlighting.engine.test.ts --project unit
cd apps/web && vp run typecheck

# server
cd apps/server && vp test run \
  src/provider/ProviderInstanceRegistry.test.ts \
  src/terminal/NodePtyAdapter.test.ts src/terminal/Manager.test.ts \
  src/cli/desktopLaunch.test.ts src/cli/app.test.ts \
  src/orchestration-v2/Adapters/CodexAdapterV2.test.ts \
  src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts \
  src/orchestration-v2/ProviderSessionManager.test.ts src/mcp/McpHttpServer.test.ts
cd packages/provider-core && vp test run src/server

# shared / desktop / mobile / scripts
cd packages/shared && vp test run src/desktopOpenArgs.test.ts
cd apps/desktop && vp test run src/app/DesktopEnvironment.test.ts src/app/DesktopUserData.test.ts
cd apps/mobile && vp test run --config ../../vite.config.ts --dir . src/features/threads/use-chat-provider-refresh.test.tsx
vp test run scripts/sign-macos-local.test.ts

# manual
cd /some/project && t3 .      # installed app focuses, project appears, new draft opens
t3 .                          # again while the app is open: same, via the pending file
t3 start --no-browser         # explicit server still works
```

## Follow-ups (not done)

- **Fail-fast capability caching.** `ClaudeDriver.ts` uses upstream's `Cache.make` with a flat
  TTL, so a failed probe is cached for the full window and any probe regression presents as a
  sticky error.
- **Logged-out Claude.** Upstream reports a logged-out Claude as `ready`; re-adding an
  `unauthenticated` status needs a rule that does not mislabel Bedrock.
- Claude reroute: process `retracted_message_uuids` (§10).
- Usage rings on mobile.
- **Provider refresh cost (§14).** `refreshModels: true` on every chat open forces a manifest
  refresh and probes every provider, also when a draft turns into a thread on first send. An
  untargeted refresh without `refreshModels` still refreshes auth and usage; consider that plus a
  per-environment throttle.
- **Sidebar reveal observer (§8)** lives for the whole route when the row never appears (thread
  filtered out by project scope, empty draft, collapsed sidebar); cap it at ~2s.
- **Pending-file poll (§5)** reads the state dir every 750ms for the app's lifetime; an
  `fs.watch` or a poll bounded to `activate`/`second-instance` would do.
- `t3 open` writes the pending file under the shell's `$T3CODE_HOME`; an app started by Launch
  Services does not see that variable, so the hand-off silently does nothing when it is set.
- Turn-fold preview (§6) shows mentions as raw `[name](/abs/path)` markdown.
- The unauthenticated send gate (§3) checks only the primary model selection.
- Rebuild `t3 open` on upstream's `t3 app` activation, and ship it in a real release, so `t3 .`
  works without building from this checkout.
