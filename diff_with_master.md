# Diff vs `origin/main` (fork branch `main`)

> Handoff document for **everything** on this branch that differs from `origin/main`
> (upstream `pingdotgg/t3code`; the default branch is `main`, there is no `master`).
> Published as [`EvilBorsch/t3code`](https://github.com/EvilBorsch/t3code). Written so a
> human or an LLM can continue without reconstructing intent from commits.
>
> This file describes the **current** delta only. Features upstream has since absorbed, or that
> its rewrites made obsolete, are listed once under _Absorbed or obsolete_ so nobody re-adds them.

**Sync status 2026-11-25:** merged `origin/main` at `21a96989b0` (upstream reworked telemetry
defaults: CI detection, `DO_NOT_TRACK`; the fork's opt-in is re-applied, see §19). Previous sync
2026-11-23 at `d1a6c35f73` (desktop `0.1.11`, migrations 103–110, Node `26.13.1` per `engines`). Upstream now ships UI i18n (General Translation): fork UI strings go
through `gt()` / `<T>` / `m(msg())` with keys in every locale catalog (`apps/web/src/i18n/translations`,
mobile likewise), enforced by `t3code(no-untranslated-copy)` and `vp run i18n:check`. Since 2026-10-29 the
fork lives on `main` of `EvilBorsch/t3code` (local `main` tracks `fork/main`); the older branches
`fix-claude-usage-master` and `fix-claude-usage-master-merge-1028` are frozen. Never use GitHub's
"Sync fork" button: it would discard the fork's commits. The 2026-10-28 merge brought upstream's deletion of `LegacySidebar.tsx` (the `legacySidebarEnabled`
setting now opens the "boring sidebar" mode of `Sidebar.tsx`), a rewritten composer and design,
pnpm 12 / vite-plus 1.4 (update the global `vp` with `vp upgrade`), and state migrations 062–072 —
063 drops the V1 projections, so a pre-merge build cannot reopen the migrated `statev2.sqlite`.
Re-check with:

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git diff --stat origin/main...HEAD
```

**Upstream merge routine:** on `main`, fetch `fork` and `origin`, fast-forward to `fork/main` if it
is ahead, `git merge origin/main`, resolve, push `main` to `fork`, then rebuild and reinstall the desktop app (see
_Building and installing_). On the Windows checkout the remotes are named `origin` (fork) and `upstream`
(pingdotgg), so there it is `git merge upstream/main` and `git push origin main`. Treat every section below as fork-owned when resolving conflicts:
never take upstream's side of those files wholesale, and check §19 (telemetry) after every merge. Upstream's lint now rejects off-scale
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
  (`chat/ComposerFooterControls.tsx`) as `usageProvider`; the meter renders first in that
  footer, then the context ring, then the Compact chip and send button. Upstream measures the
  resting actions' width, so the rings need no reserved padding.
- Clock is the shared minute tick (`hooks/useNowMinute`), never a per-component timer.
- Codex can report only a weekly window on some plans (`primary` = 7d, `secondary` null);
  a single `7d` ring is data, not a bug.
- Mobile keeps upstream's on-demand panel only.
- Upstream's closest feature is the **Usage** item of the thread details card (#26859, #26904; off
  by default, right-click the card or **Settings → Appearance → Thread details**). It is not a
  replacement: the card is inline only in a wide chat with the card pinned, and otherwise a popover
  that closes when the composer takes focus. The user chose to keep the rings (2026-10-29); the
  Usage item stays available as an extra.

## 2. Context window ring always on

Upstream deleted the composer's context ring, its `contextWindowMeterEnabled` setting and
`ContextWindowMeter.logic.ts` (#33131, 521ac7c218); context usage lives only in the thread details
card's "Context window" item, off by default. The fork keeps the ring: `chat/ContextWindowMeter.tsx`
(restored from upstream's last version, trimmed to the ring plus its hover popover; no "Compact
context" button, no loading placeholder) renders in the composer footer whenever the thread reports a
context window. `ChatComposer.tsx` derives the snapshot and passes it to `ComposerFooterControls.tsx`
(`activeContextWindow`); the compaction helpers it uses are upstream's `compaction.logic.ts`. There
is no setting left to bypass.

## 3. Send refuses a logged-out provider

`chat/useComposerSend.ts` (`onSend`) refuses to send when the selected provider reports
`auth.status === "unauthenticated"` (with the server's message), before any side effect.
Upstream only blocks sends for Antigravity and excludes such providers from load balancing.
(The former Claude probe-cwd patch is absorbed, see below.)

## 4. Terminal / node-pty under packaged Electron

- `apps/server/src/terminal/NodePtyAdapter.ts` — resolves `node-pty`'s package dir through
  `app.asar` → `app.asar.unpacked` (and `node_modules.asar` → `.unpacked`) so `spawn-helper`
  is found. The package.json resolver is injectable through `NodePtyPackageJsonResolverRef`,
  next to upstream's `NodePtyModuleLoaderRef`. Upstream's desktop now ships a staged runtime,
  so the rewrite may never fire; it is a no-op unless the path contains `app.asar`.
- The "make the helper executable" once-guard is keyed by helper path, not one process-wide
  flag, so adapters with different resolvers each chmod their own helper.
- Tests in `NodePtyAdapter.test.ts` (runs the fake node-pty).

## 5. `t3 .` / `t3 open` → desktop workspace with a new draft thread

**UX.** `t3 .`, `t3 open .`, `t3 open <path>` resolve the directory, find the installed desktop
app (Nightly → Beta → Alpha → `T3 Code`, or `T3CODE_DESKTOP_BINARY` / `T3CODE_DESKTOP_APP`), hand it
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

## 8. Boring sidebar on by default; its search opens Cmd+K; a project result starts a new draft

`boringSidebarEnabled` defaults to `true` in `packages/contracts/src/settings.ts` (upstream: `false`),
so the project-folder sidebar is what a fresh client shows; **Settings → Labs → Boring sidebar**
turns it off (user doc: `docs/user/thread-sidebar.md`). The user also runs `legacySidebarEnabled:
true`, which upstream maps to the same mode. Upstream covers what the fork used to patch into the legacy
sidebar: subagent threads are hidden by `filterSidebarV2VisibleThreads` (`partitionSidebarThreads`,
folders, counts, jump keys, sorting), and the active row is revealed by `sidebar/routeReveal.ts`,
including inside a collapsed folder. The fork keeps only:

- In boring mode the sidebar's **Search** row is a button that opens Cmd+K (threads, projects,
  settings), like the legacy sidebar, instead of upstream's inline thread-only filter
  (`SidebarThreadHeader` `commandPaletteSearch`). The default mode keeps the inline filter.
- `CommandPalette.tsx` `openProjectFromSearch` opens a **new draft** in the project (upstream
  opens its latest thread) and expands the project's folder with `sidebarFolderExpansionKeys(group)`.
- `DesktopOpenWorkspaceListener.tsx` (§5) expands with the same keys, built from
  `buildSidebarProjectSnapshots({ groupScratchProjects: true })`, so a stored `false` on a
  repository or scratch folder cannot win.
- Tests: "keeps subagent threads out of boring folders and drops a folder holding only subagents"
  in `Sidebar.logic.test.ts`; "starts a new draft in a searched project and expands its folder, not
  its latest thread" in `CommandPalette.browser.test.tsx` (replaces upstream's latest-thread test).

Known gap: picking the thread that is already open does not re-scroll (the route does not change).

## 9. Composer OS file drop → path mentions

`chat/composerFileDrop.ts` (+ test) — `planComposerFileDrop`: in a **local** environment
(upstream's `folderDropTarget(...) === "local"`), a dropped file whose absolute path the desktop
bridge resolves (`DesktopBridge.getPathForFile`, upstream's) becomes an `@` path mention. Images,
browser drops, path-less files and every drop into a remote environment go through upstream's
attachments. Upstream's own `addDroppedFolders` handles folders. Wired in `ChatComposer.tsx`
`addDroppedFiles`.

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
create it on the JS engine and stall the chat. Upstream's call sites now pass
`PREFERRED_HIGHLIGHTER`, so the claim is mostly a guard; `@pierre/diffs` still defaults to
`shiki-js` for a caller that omits it. Test: `syntaxHighlighting.engine.test.ts` (asserts the
highlighter name).

## 12. Agent tool group defaults

`packages/contracts/src/settings.ts` — since 2026-10-30 visual replies, thread tools and browser
access default to on, pull request tools and devices to off (user's choice). With §15's `/mcp`
filter, an agent without a group never sees its tools. Claude Code and Codex defer MCP tool
schemas behind tool search, so an enabled group costs only its prompt text up front.

## 13. Local macOS build signing

Unsigned builds left Electron's stock linker signature, which macOS cannot match to TCC
grants, so the app asked for folder access on every launch. `scripts/sign-macos-local.ts`
(+ test) is an electron-builder `afterSign` hook, wired by `scripts/build-desktop-artifact.ts`
for unsigned mac builds, that ad-hoc signs the bundle. The ad-hoc cdhash changes per build, so
macOS asks once per install; `T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY=<self-signed cert>` gives an
identity that survives rebuilds.

## 14. Providers refresh when a chat opens

`apps/web/src/hooks/useChatProviderRefresh.ts` (wired in `ChatView.tsx`; test
`useChatProviderRefresh.browser.test.tsx`) and
`apps/mobile/src/features/threads/use-chat-provider-refresh.ts` (wired in `ThreadRouteScreen.tsx`
and `NewTaskDraftScreen.tsx`, + test) — once per opened chat, after the environment connects,
refresh every provider with `refreshModels: true`, so a provider that recovered (logged in,
updated CLI) becomes selectable without a trip to Settings. Upstream refreshes only the selected
instance's stale workspace snapshot (web) or on pull-to-refresh in the model picker (mobile).

## 15. Agent tool groups (what T3 adds to agents)

**Why.** Upstream always attaches its `t3-code` MCP server (~80 tools) to every provider session
and appends long orchestration and PR-linking instructions; tools a session may not use
(`preview_*`, `device_*`) were still listed and refused at call time. The user wants a request from
T3 to reach Claude Code / Codex like their own CLI, opting into T3 extras one group at a time.

**What.** Five server settings, project-scoped, under **Settings → Browser → Agent access**
(upstream removed the Integrations page; `/settings/integrations` redirects there):

| Setting                               | MCP capability                                         | Prompt text                                                                      | Default  |
| ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | -------- |
| `enableAgentVisualReplies` (fork)     | `html` (fork; incl. `send_to_user`)                    | visuals section, Claude's `send_to_user` text                                    | on       |
| `enableAgentThreadTools` (fork)       | `orchestration`, `worktree`, `background-wait`¹        | orchestration instructions, handoff `t3_thread_read` hints, `t3_background_wait` | on       |
| `enableAgentPullRequestTools` (fork)  | `pull-requests`, `issues`                              | `<pull_request_linking>` (incl. upstream's `link_issue` sentence)                | off      |
| `enableAgentBrowserAccess` (upstream) | `preview`                                              | browser block                                                                    | on (§12) |
| `enableAgentDeviceAccess` (upstream)  | `device` (also needs upstream's `enableDeviceSupport`) | device block                                                                     | off      |

¹ only when the provider supports background waits (upstream's rule). The theme tools
(`t3_theme_read` / `t3_theme_set`) ride on `orchestration`. `tool_search` is always listed but its
results are filtered to what the caller may see.

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
  missing from the table: add every new upstream toolkit there. Upstream's `McpSchema.EnabledWhen`
  (used for `hiddenFromSubagents` / `hiddenWhileLinksOff`) and the newer `McpServer.visibility`
  (its deferred listing) would be the native mechanism; switching breaks upstream tests that expect
  the handler-level "capability missing" error. The filter runs after upstream's auth middleware.
- Device text (upstream #25661) follows the `device` group: `t3OrchestrationSystemPrompt(tools)`
  appends `T3_CODE_DEVICE_TOOL_INSTRUCTIONS` (OpenCode, Pi, ACP), `t3OrchestrationPrompt` re-sends it
  to Cursor conversations that lack it, Codex puts it in `t3_code_tools`, and Claude gets the
  ToolSearch variant plus upstream's `SubagentStart` hook. `AgentContextBudget.test.ts` measures
  Claude without device access, like upstream, so `agentContextBudget.json` stays upstream's.
- `packages/provider-core/src/server/mcpSession.ts` — `T3AgentTools` / `t3AgentTools(session)`;
  `orchestrationInstructions.ts` builds on upstream's short sections: the orchestration sections
  (incl. request_secret, environment and thread links) need thread tools, and in upstream's
  "Visuals and preview" section the inline-chart bullet needs visual replies and the `preview_*`
  bullet needs browser. With every group on the text equals upstream's.
  `t3OrchestrationSections(tools)` feeds Codex's numbered entries. `runtimeInstructions.ts` (PR
  block only with PR tools), `handoffBudget.ts`. Every adapter passes `T3AgentTools` instead of
  a `hasT3Mcp` boolean: `ClaudeAdapterV2` (upstream's `t3_background_wait` text only with thread
  tools), `CodexAdapterV2` via `buildCodexAdditionalContext` (upstream dropped
  `developer_instructions`), `provider-acp`, `provider-cursor`, `provider-opencode` (v1, v2),
  `provider-muse`, `provider-pi` (`T3_PI_SYSTEM_PROMPT`, built in `mcpInjection.ts` with the PR block
  only with PR tools; upstream #31727 hard-codes it in the extension). Antigravity carries the PR block in its
  session system prompt (upstream), so `AcpAdapterV2RuntimeInput.t3Tools` gates that append too.
  `evals/mcp-tool-use/run.ts` and
  `AgentContextBudget.test.ts` measure with every group on. Expect small, mechanical merge
  conflicts at those call sites.
- `ContextHandoffDelivery.ts` / `ProviderTurnStartService.ts` drop `t3_thread_read` hints at
  delivery when the receiving session lacks thread tools.
- `packages/effect-codex-app-server/src/replay.ts` ignores `t3_code_*` `additionalContext` keys when
  matching `turn/start`, like `developer_instructions`.
- UI: `settings/IntegrationsSettings.tsx` (`AgentToolGroupSettings`, rendered on the Browser page),
  `ProjectDefaultsSettings.tsx`, `settingsSearch.ts`, `SettingsPanels.tsx`; mobile: the "Agent
  tools" section of the threads settings screen. User doc: `docs/user/project-settings.md` →
  Agent tools.

**Tests.** `ProviderSessionManager.test.ts` (capability sets per settings, overrides, rotation,
all-off), `McpHttpServer.test.ts` (filtered list, refused call, coverage), adapter tests for each
provider (prompt per tool set), `ContextHandoffBudget.test.ts`, provider-core instruction tests.

## 16. Claude prompt cache TTL survives 5-minute tail writes

Upstream's Compact chip (#16631, #17127, #17945) appears when a large Claude thread's prompt cache
looks expired, using the TTL of the latest response's cache write. Claude Code writes the
conversation prefix with 1h entries but sometimes only a short tail with 5m, so a turn ending on such
a write reported 5 minutes and the chip appeared after 5 minutes idle while the prefix stayed cached.
`ClaudeAdapterV2.ts` remembers per native thread which model wrote 1h (until the next
`compact_boundary`; a model switch forgets it, since each model has its own cache) and keeps
reporting 1h; sessions that only write 5m (API key, Bedrock, Vertex) keep 5 minutes. The memory is
not persisted across server restarts. The TTL also dates `promptCacheExpiresAt`, which upstream's
idle compaction (`IdleCompaction.ts`, "Before the cache expires" beta) schedules from; without
the fix that mode would compact ~3 minutes after a 5m tail write. Tests in
`ClaudeAdapterV2.test.ts` ("prompt cache TTL" scenarios, "dates the idle compaction deadline an
hour after a five-minute tail write").

## 17. OpenCode V2 full access reaches outside the workspace

V2's full-access rules (`sessionRules` in `packages/provider-opencode/src/server/v2/adapter.ts`)
sent only `*`, but the default `build`/`plan` agents carry OpenCode's `external_directory → ask`
rule and `*` did not override it, so full-access sessions prompted for every path outside the
project. The fork sends `*` and then an explicit `external_directory → allow`. (V1 is upstream's
now, see _Absorbed_.) Tests: `Adapters/OpenCode2AdapterV2.test.ts`,
`OpenCode2OrchestratorV2.integration.test.ts`, and the recorded fixtures `opencode2_fork` and
`opencode2_switch`.

## 18. Compact chip compacts only on click

Upstream's Compact chip (#16631, #17127, #25818 "Compact/Keep + tokens"; TTL in §16) is a
toggle that defaults to Compact, so Enter on a stale Claude thread starts a `/compact` run and
queues the message behind it. In the fork the chip is a one-shot action: Enter and the send
button always send with full history, and clicking the chip compacts first and then sends the
draft (with an empty composer it only runs `/compact`). The collapsed mobile composer's send
button sends directly. `ComposerPrimaryActions.tsx` renders the chip (upstream's look, no
pressed state), `ChatComposer.tsx` (`compactAndSend`) routes the click, `useComposerSend.ts`
passes `options.compactFirst`, and `ChatView.logic.ts` `planComposerTurn` compacts only with
`compactFirst` (test "sends with full history unless the Compact chip asked to compact first").
There is no keep-full-history state. Upstream's idle-compaction setting still applies: "When you
return" is this chip, "Never" hides it. The chip reads "Summarize {tokens} tokens of history";
`compactFirst` survives upstream's delayed sends (dictation finishing, images preparing), and a
fresh session never compacts first. Browser test: `ChatView.handoffCompaction.browser.test.tsx`
(Enter after a provider switch sends without `/compact`; a chip click sends `/compact` then the
draft). User doc: `docs/user/providers-claude.md`. Upstream's **mobile app** (#34263) compacts stale
Claude threads before sending with no chip; that is upstream's and not covered by this section.

## 19. Telemetry forbidden

**Hard rule of the fork: nothing leaves the machine for T3's telemetry unless the user explicitly
sets `T3CODE_TELEMETRY_ENABLED=true`.** Upstream sends product events (`ingest.t3.codes` → PostHog)
and relay traces (Axiom) by default and only skips CI runners and `DO_NOT_TRACK=1`. The fork keeps
upstream's code and its `DO_NOT_TRACK` / managed-policy / OTel kill switches, but every default is
`false`. Upstream's agent feedback reports go out through `AnalyticsService.record`, so they are
covered by the same gate.

Every guarded line carries a `ФОРК-ТЕЛЕМЕТРИЯ` comment. **When resolving a merge, never take
upstream's side of these lines**; upstream rewrites them regularly (2026-11-25: CI detection and
`DO_NOT_TRACK`), and a silent auto-merge can flip the default back on.

| Layer                                                                                                                         | Fork line                                                                                                                                                           | Upstream default it replaces               |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Product analytics                                                                                                             | `apps/server/src/telemetry/AnalyticsService.ts`: `const enabledByDefault = false`                                                                                   | `!isCiEnvironment(hostEnvironment)`        |
| Relay tracing (server, `t3 connect`, desktop `getRelayTelemetryEnabled`, the `relayTracingAllowed` the server sends browsers) | `packages/shared/src/otelEnvironment.ts` `isRelayTracingEnabled`: `telemetry.value === true`                                                                        | `telemetry.value ?? !isCiEnvironment(env)` |
| Relay tracing in the web renderer                                                                                             | `apps/web/src/cloud/publicConfig.ts` `relayTelemetryEnabled()`: `false` outside a window and for the hosted app; otherwise the desktop bridge or the server answers | `true` in both cases                       |

Tests that pin the defaults: `AnalyticsService.test.ts` ("does not send batch requests when
telemetry is left unset"), `otelEnvironment.test.ts` ("stays off until opted in…"), server
`cloud/relayTracing.test.ts` ("reports the server's relay tracing policy to clients"), web
`lib/runtime.test.ts` (hosted app and browser without a server answer export nothing), desktop
`ipc/methods/window.test.ts`. User doc: `docs/user/telemetry.md` (opt-in wording, keep it on
merges). After every upstream merge:

```bash
git grep -n "ФОРК-ТЕЛЕМЕТРИЯ"     # 3 code sites + test notes must still be there
git grep -n "isCiEnvironment(" -- apps packages ':!*.test.ts'   # must not gate a default again
```

Not covered: the mobile app (store builds are upstream's; crash reports default on with their own
**Send crash reports** toggle, mobile relay tracing has no toggle) and **Publish agent activity**
(a relay feature for mobile notifications, not telemetry; Settings → Sharing & access).

## 20. Thread titles come from the thread's own model

Upstream titles every thread with the **Text generation model** setting. The fork titles it with
the thread's own model at its lowest reasoning effort (first `effort` / `reasoningEffort` choice
the provider lists), with no fallback model; a model with upstream's `supportsTextGeneration: false`
counts as unable. If the thread's provider cannot generate text, or
generation fails after its retries, a first-message title becomes `UNTITLED_THREAD_TITLE`
("Untitled", `provider-core/server/threadTitleContext.ts`), and `Orchestrator.ts` arms title
generation again on the next user message while the thread still has that title (unless the user
renamed it to that title themselves, upstream's `titleRenamed`). A failed manual
**Regenerate title** keeps the old title. The Text generation model row and its search entry are
gone from Settings → Threads; the stored `textGenerationModelSelection` still drives commit
messages, branch names and PR text unless Writing & review sets its own model.
`ThreadTitleRegenerationService.ts` (+ test "titles a thread with its own model at the lowest
reasoning effort", "leaves the thread untitled when its model cannot title it"). User doc:
`docs/user/thread-sidebar.md`.

## Non-product files in the delta

- `README.md` — fork section.
- `docs/user/usage.md` — two sentences on the composer rings.
- `diff_with_master.md` — this file.

---

## Absorbed or obsolete (do not re-add)

| Former fork feature                                                                                                | Upstream now                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usage-limit **data** path (`providerUsage.ts`, `ProviderUsageMonitor`, registry overlay, `ServerProvider.usage`)   | `ServerProvider.usageLimits`, `ProviderUsageLimitsIngestion`, Limits tab (#9507). Only the UI in §1 is fork code.                                                                                                                    |
| Thread message search (FTS5 migration, `searchThreads` RPC, palette)                                               | Upstream `searchThreads`, in-thread find (`mod+f`). No fork code remains; the live DB's migration ledger matches upstream.                                                                                                           |
| Claude `model_refusal_fallback` handling and its work-log notice                                                   | `ClaudeAdapterV2` emits a `system_notice` itself. The V1 `ProviderRuntimeIngestion` mapping was deleted with V1.                                                                                                                     |
| Hard-coded Claude catalog (Opus 5 / xhigh)                                                                         | Remote model manifest (#9084).                                                                                                                                                                                                       |
| Claude logged-out detection (`unauthenticated` status)                                                             | Upstream's `apiProvider` model; a logged-out Claude reports `ready`. See follow-ups.                                                                                                                                                 |
| `ProviderStatusBanner` preferring the server message                                                               | Upstream does the same.                                                                                                                                                                                                              |
| Assistant item id namespacing (`AcpSessionRuntime` export + test, "empty Cursor replies after `session/load`")     | `packages/provider-acp` namespaces ids per runtime and blocks `session/load` replay; the V2 ACP adapter scopes ids by turn; Cursor now runs on the Cursor SDK.                                                                       |
| Warm thread cache healing (`isReusableThreadDetailCache`)                                                          | V2 client cache is schema-versioned (`ORCHESTRATION_THREAD_CACHE_SCHEMA_VERSION`) and drops undecodable entries; bounded windows persist with their cursor, so "no user message" is a valid state. Fix corruption by a version bump. |
| Changed-files tree auto-expand (≤12 files)                                                                         | Upstream's `ChangedFilesCard` remembers its own expanded state and starts collapsed.                                                                                                                                                 |
| Context-ring padding (`pr-28/pr-20/pr-12`)                                                                         | Upstream measures the composer's resting actions width.                                                                                                                                                                              |
| Claude probe in a neutral directory (`os.tmpdir()`)                                                                | Upstream probes from the server `stateDir` (233e70b3b2), also neutral and fast.                                                                                                                                                      |
| Legacy sidebar patches (subagent filter, active-row reveal, `useRevealActiveThreadRow`, `Sidebar.reveal.test.tsx`) | `LegacySidebar.tsx` deleted (#21039); boring sidebar filters subagents (`filterSidebarV2VisibleThreads`) and reveals via `sidebar/routeReveal.ts` (#23519, #25234).                                                                  |
| Fork FTS5 palette hooks (clear scope, reveal row)                                                                  | Upstream indexed Cmd+K search (#24343) and route reveal widens a hiding project scope. Only "expand the folder" remains (§8).                                                                                                        |
| MCP tool catalogs per session capability (fa65fe8b78)                                                              | Per-request caller isolation is upstream's. Hiding tools by capability is back as §15's `/mcp` filter (one server, filtered per caller), not one server per capability set.                                                          |
| Terminal attach never dropping an `error` event as a duplicate (`Manager.ts`)                                      | The startup failure is in the snapshot itself (`TerminalSessionSnapshot.error`, #37088), so every attachment gets it once.                                                                                                           |
| Context-window toggle row, search entry and legacy-target id removed from settings (§2)                            | Upstream deleted the setting and the ring itself (#33131). Only the restored ring remains (§2).                                                                                                                                      |
| OpenCode V1 full access `external_directory → allow` (`openCodePermissionRules`, subagents)                        | Upstream sends it itself (#35401, 166cb00897); its "maps runtime modes…" test covers it. Only V2 remains (§17).                                                                                                                      |

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
  src/components/chat/MessagesTimeline.logic.test.ts \
  src/components/chat/composerFileDrop.test.ts \
  src/components/ChatView.logic.test.ts \
  src/components/Sidebar.logic.test.ts \
  src/lib/openWorkspaceIntent.test.ts src/lib/runtime.test.ts \
  src/lib/syntaxHighlighting.engine.test.ts --project unit
cd apps/web && vp test run src/hooks/useChatProviderRefresh.browser.test.tsx \
  src/components/CommandPalette.browser.test.tsx \
  src/components/ChatView.handoffCompaction.browser.test.tsx  # needs Playwright chromium
cd apps/web && vp run typecheck
vp run i18n:check && vp lint <fork files>  # i18n:check spawns node_modules/.bin/gt: POSIX only

# server
cd apps/server && vp test run \
  src/terminal/NodePtyAdapter.test.ts src/terminal/Manager.test.ts \
  src/cli/desktopLaunch.test.ts src/cli/app.test.ts \
  src/telemetry/AnalyticsService.test.ts src/provider/AgentContextBudget.test.ts \
  src/orchestration-v2/Adapters/CodexAdapterV2.test.ts \
  src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts \
  src/orchestration-v2/Adapters/OpenCode2AdapterV2.test.ts \
  src/orchestration-v2/OpenCode2OrchestratorV2.integration.test.ts \
  src/orchestration-v2/ProviderSessionManager.test.ts src/mcp/McpHttpServer.test.ts
cd apps/server && vp test run src/orchestration-v2/testkit  # *ReplayFixtures.integration (one per provider)
cd packages/provider-core && vp test run src/server

# shared / desktop / mobile / scripts
cd packages/shared && vp test run src/desktopOpenArgs.test.ts src/otelEnvironment.test.ts
cd apps/desktop && vp test run src/app/DesktopEnvironment.test.ts src/app/DesktopUserData.test.ts \
  src/ipc/methods/window.test.ts
cd apps/mobile && vp test run --config ../../vite.config.ts --dir . src/features/threads/use-chat-provider-refresh.test.tsx
vp test run scripts/sign-macos-local.test.ts

# manual
cd /some/project && t3 .      # installed app focuses, project appears, new draft opens
t3 .                          # again while the app is open: same, via the pending file
t3 start --no-browser         # explicit server still works
```

## Follow-ups (not done)

- **Logged-out Claude.** Upstream reports a logged-out Claude as `ready`; re-adding an
  `unauthenticated` status needs a rule that does not mislabel Bedrock.
- Claude reroute: process `retracted_message_uuids` (§10).
- Usage rings on mobile.
- **Provider refresh cost (§14).** `refreshModels: true` on every chat open forces a manifest
  refresh and probes every provider, also when a draft turns into a thread on first send. An
  untargeted refresh without `refreshModels` still refreshes auth and usage; consider that plus a
  per-environment throttle.
- **MCP group filter (§15)** parses `/mcp` POST bodies and does not filter SSE-framed
  `tools/list`; porting it to `McpSchema.EnabledWhen` needs upstream's handler-error tests adjusted.
- **PR-watch wake text** (`pullRequestWatch.ts`, `PullRequestWatchReactor.ts`) names
  `watch_pull_request` even when PR tools were switched off after a watch started.
- **Mobile tracing** (`apps/mobile/src/features/observability/tracing.ts`) is not gated by §19.
- **Pending-file poll (§5)** reads the state dir every 750ms for the app's lifetime; an
  `fs.watch` or a poll bounded to `activate`/`second-instance` would do.
- `t3 open` writes the pending file under the shell's `$T3CODE_HOME`; an app started by Launch
  Services does not see that variable, so the hand-off silently does nothing when it is set.
- Turn-fold preview (§6) shows mentions as raw `[name](/abs/path)` markdown.
- The unauthenticated send gate (§3) checks only the primary model selection.
- Upstream tests that fail only on a macOS dev box (not fork code): `scripts/build-npm-launcher.test.ts`
  (`/var` vs `/private/var`) and desktop `DesktopLinuxUrlHandler.test.ts` theme icons
  (case-insensitive filesystem).
- **Windows dev box (2026-11-20 merge).** About 35 tests fail only on Windows: POSIX path
  assertions (`/` vs `\`, `C:\` drive), symlink `EPERM`, `chmod` execute bits, `cmd.exe` instead of a
  POSIX shell, `process.getuid` missing (Claude task-output tailing), plus `Orchestrator.control-reads`
  needing Node 26's `StatementSync#stat`. Upstream CI runs Ubuntu/macOS only. Fork-only tests in that
  set: `cli/desktopLaunch.test.ts` (2), `terminal/NodePtyAdapter.test.ts` (chmod), desktop
  `DesktopUserData.test.ts` (custom profile path); making them path-agnostic is open.
- Rebuild `t3 open` on upstream's `t3 app` activation, and ship it in a real release, so `t3 .`
  works without building from this checkout.
