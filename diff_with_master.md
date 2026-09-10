# Diff vs `origin/main` (branch `fix-claude-usage-master`)

> Default branch is **`main`** (there is no `master` remote). This file is the full handoff
> document for **everything** on this branch that differs from `origin/main`, so another
> human/LLM can continue without rediscovering intent from scattered commits.
>
> Lineage: `fix-claude` → `fix-claude-usage` (account usage limits) →
> `fix-claude-usage-master` (merged current `origin/main`). Published as
> [`EvilBorsch/t3code`](https://github.com/EvilBorsch/t3code), a fork of `pingdotgg/t3code`.

**Sync status (2026-09-06, after fetching and merging `origin/main` at `223ff4490`):**
**0 commits behind** / **30 commits ahead**. Re-check with:

```bash
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

## Commits on this branch (oldest → newest)

| Commit      | Summary                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `2c7df9070` | `Fix claude` — first Claude probe hardening (TTL on failure, timeout, cwd)  |
| `85d1338c2` | Merge `origin/main` into `fix-claude`                                       |
| `08728b5b4` | Full `t3 open` / desktop open-workspace pipeline + remaining Claude/pty/UI  |
| `14c07d7f2` | Isolate local Electron userData from Nightly + local `t3` launcher scripts  |
| `6dad6216b` | Document full `fix-claude` delta vs `origin/main` (this handoff doc)        |
| `6db2e51e9` | macOS Nightly open fix: pending-file + `open -a`, prefer installed Nightly  |
| `fe07eadb7` | `fix diff`                                                                  |
| `1a4952fec` | Namespace assistant message IDs so `session/load` cannot collide            |
| `70cbd80fe` | Codex turn-fold preview for long prompts + smaller default diffs            |
| `8e5c7db18` | Heal corrupt warm thread caches that drop user prompts                      |
| `c7d5b82c8` | **Account usage limits** for Codex + Claude (providers tab + composer)      |
| `a09e00f6e` | README section describing this fork                                         |
| `474aa329d` | **Merge current `origin/main`** — see Theme E for the reconciliations       |
| `45d8565aa` | Probe Claude capabilities from a neutral directory again (desktop hang fix) |
| `5cb52fe93` | Refresh this handoff doc for the post-merge branch state                    |
| `e576c2043` | **Thread message search** — FTS5 + `searchThreads` RPC + command palette    |
| `43b6367ec` | **Composer OS file drop** → path mentions via `getPathForFile`              |
| `9e6ae2d1f` | **Model reroute notices** in the work log (Claude safety fallback, Codex)   |
| `253d416ab` | Enlarge the composer usage rings for legibility                             |
| `(HEAD)`    | This handoff doc refresh                                                    |

## Merge 2026-09-06 — what upstream absorbed

Upstream `223ff4490` (747 commits) landed several of this branch's features on its own. The
merge took upstream's versions and retired the fork's duplicates:

| Fork feature                                  | Upstream equivalent                                                              | Resolution                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme D — account usage limits                | `feat(usage): show Codex and Claude subscription limits on a Limits tab (#9507)` | **Dropped.** `providerUsage.ts`, `ProviderUsageMonitor`, `ProviderUsageMeter.tsx`, `web/lib/providerUsage.ts`, the registry usage overlay and `ServerProvider.usage` are gone. Upstream's `ProviderUsageLimitsIngestion`, `ComposerUsageLimits` and the Limits page replace them and also cover model-scoped and overage windows. |
| Hard-coded Claude catalog with Opus 5 / xhigh | `feat(models): discover Claude models from remote manifest (#9084)`              | **Dropped.** The manifest already lists Fable 5.1, Opus 5 and Sonnet 5; `modelPickerModelHighlights.ts` was deleted with it.                                                                                                                                                                                                      |
| `model_refusal_fallback` → `model.rerouted`   | Upstream handles the same SDK message in `ClaudeAdapter`                         | **Dropped** the fork's duplicate case and test; the ingestion mapping to a work-log entry is kept.                                                                                                                                                                                                                                |
| Composer OS file drop → path mentions         | `feat(server): accept PDF, ZIP, and other file uploads up to 50MB (#8235)`       | **Merged.** `planComposerFileDrop` now yields `attachmentFiles` + `mentionText`: a file with a resolvable path becomes a mention, everything else (images, browser drops, path-less files) goes through upstream's `addComposerAttachments`.                                                                                      |
| `insertComposerTextAtEnd`                     | Upstream refactored it onto `insertComposerText(text, position, options)`        | Upstream's version; the drop handler still calls `insertComposerTextAtEnd`.                                                                                                                                                                                                                                                       |
| Warm thread cache healing                     | Upstream added an in-memory `resumeCache` in front of the IndexedDB read         | **Merged.** `isReusableThreadDetailCache` still guards the disk read; a retained in-memory snapshot skips the disk read and the guard.                                                                                                                                                                                            |
| Oniguruma highlighter                         | Upstream exports `PREFERRED_HIGHLIGHTER = "shiki-wasm"` and passes it everywhere | Upstream's constant; the fork's `claimSyntaxHighlighterEngine()` early claim in `main.tsx` stays.                                                                                                                                                                                                                                 |
| Claude probe cwd                              | Upstream still passes the server cwd (`ClaudeDriver.ts`)                         | **Kept** `probeCwd = os.tmpdir()` — see Theme A pitfall #10.                                                                                                                                                                                                                                                                      |

Everything else (Themes A–C, E, F, sidebar reveal, `enableAgentBrowserAccess: false`) carried
over unchanged. `docs/user/` was not touched: none of the surviving fork features are
described there.

## Product themes (all intentional deltas)

This branch is **not** a single-feature branch. It has six themes:

1. **Claude auth / provider reliability** — probe must be robust and must not run in a huge directory. **Much of the original auth-detection half was replaced by upstream during the `474aa329d` merge — read Theme A before trusting older notes.**
2. **Terminal / node-pty under Electron** — spawn-helper resolution through `app.asar` → `app.asar.unpacked`; attach must not hide error events.
3. **`t3 .` / `t3 open` → desktop workspace + new draft** — CLI launches **installed Nightly** (not local Alpha) with open-workspace intent; desktop queues intent (argv / second-instance / pending-file); renderer creates project + draft (pencil semantics). Includes local-dev isolation so a rebuilt desktop can run beside installed Nightly when explicitly opted in.
4. **Account usage limits** — daily/weekly rate-limit rings in the composer and a limits row per provider card, polled from each provider CLI rather than inferred from turns. See Theme D.
5. **Merge reconciliations** — places where upstream reworked the same code this branch touched. See Theme E.
6. **Timeline ergonomics** — turn-fold prompt preview for long Codex prompts + smaller default changed-files trees. See Theme F.

Plus three features landed on 2026-07-22 (`e576c2043`, `43b6367ec`, `9e6ae2d1f`) — thread
message search, composer OS file drop, and model-reroute notices. See _Landed 2026-07-22_
after Theme F.

---

## Theme A — Claude auth / capability probe

### Problem

- Claude CLI could be installed but unauthenticated; T3 still treated the provider as usable.
- Capability probe failures could be cached for the full TTL, delaying recovery.
- Probe could hang / run in a bad working directory (server cwd).
- UI banner used generic copy even when the server already sent a specific message.
- Send path did not hard-block unauthenticated providers.

### What survives today

1. **Probe runs in a neutral directory** (`os.tmpdir()`, passed by `ClaudeDriver`).
   This is the single most load-bearing item in this theme — see below.
2. `ProviderStatusBanner` prefers `status.message` over generic copy.
3. `ChatView` still aborts send when the selected provider reports
   `auth.status === "unauthenticated"`. **For Claude this path is currently unreachable**
   (nothing sets that status anymore); it still applies to other providers.
4. Probe timeout is now **25s** (upstream raised it from this branch's 20s for Bedrock).

### Probe working directory — do not regress this again

Claude Code scans its working directory during initialization, so probe cost is dictated by
what that directory contains. Measured on a real machine:

| Probe cwd          | `initializationResult()` |
| ------------------ | ------------------------ |
| `os.tmpdir()`      | ~0.6s                    |
| a project checkout | ~0.4s                    |
| `$HOME`            | **~58s**                 |

The desktop app's server cwd is `$HOME`. Upstream's `474aa329d` change made the probe use
the server cwd, which blew the 25s budget on every refresh; the capabilities cache then held
that miss for its whole TTL, so the provider card sat on _"Could not verify Claude
authentication status from initialization result."_ while turns kept working normally.
`45d8565aa` restored the neutral directory.

`probeClaudeCapabilities(settings, env, cwd?)` still accepts a cwd — only the driver's choice
of value changed. Passing a project directory would also be fast and would additionally expose
project-scoped slash commands; passing the server cwd is what must never happen.

### Replaced by upstream in the `474aa329d` merge

Upstream reworked auth detection around `apiProvider`, because treating "no subscription and
no token" as logged-out also mislabels Amazon Bedrock (external AWS credentials, no
subscription fields) and made it unselectable. Consequences to be aware of:

- The probe result no longer carries `authenticated: boolean`; it carries `apiProvider`.
- The `status: "error"` + `auth.status: "unauthenticated"` mapping for Claude is **gone**.
  A logged-out Claude now reports `ready`.
- `isClaudeAccountAuthenticated()` is still defined in `ClaudeProvider.ts` but is **dead code**.
- The fail-fast cache TTL was lost: `Cache.makeWith` (failures expire immediately) became
  upstream's `Cache.make` with a flat 5-minute TTL, so a failed probe is now cached for the
  full window. This is what turned the cwd regression above into a sticky error.

These are listed under follow-ups rather than silently re-applied, since re-adding the
unauthenticated mapping on top of upstream's model needs a Bedrock-safe rule.

### Files

| Path                                                       | Change                                               |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `apps/server/src/provider/Layers/ClaudeProvider.ts`        | probe shape, `/usage` read, upstream auth model      |
| `apps/server/src/provider/Layers/ClaudeProvider.test.ts`   | **new** — probe cwd guard + account field coverage   |
| `apps/server/src/provider/Drivers/ClaudeDriver.ts`         | neutral probe cwd (`os.tmpdir()`) + capability cache |
| `apps/server/src/provider/Layers/ProviderRegistry.test.ts` | related registry/Claude coverage                     |
| `apps/web/src/components/ChatView.tsx`                     | block send when unauthenticated                      |
| `apps/web/src/components/chat/ProviderStatusBanner.tsx`    | prefer server message                                |

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

## Theme D — Account usage limits (data retired 2026-09-06, UI re-added 2026-09-10)

> **Data side retired.** Upstream #9507 ships the probe, `ProviderUsageLimitsIngestion` and
> `ServerProvider.usageLimits`; see _Merge 2026-09-06_. The notes below describe the fork's
> original data path for archaeology only.
>
> **UI side re-added 2026-09-10.** Upstream only shows limits on demand (`/usage-limits`
> banner, Usage → Limits), which lost the always-visible meter the fork was built for. It is
> back, reading upstream's `provider.usageLimits`:
>
> - `apps/web/src/components/chat/ProviderUsageMeter.tsx` — one ring per window beside the
>   composer send button (session `5h`, weekly `7d`, model-scoped weekly by model initial,
>   monthly `30d`); fill is spent share, colour goes success → warning at 75% → error above 90%.
>   Hover shows every window with `% used · % left`, the reset countdown and absolute time,
>   pace, and banked Codex reset credits.
> - `ProviderUsageMeter.logic.ts` (+ test) — window ordering, badges, expiry: a window whose
>   reset has passed renders 0% with "waiting for fresh data" rather than a stale figure.
> - `settings/ProviderInstanceCard.tsx` — the same rings inline on each provider row, and a
>   "Usage limits" section in the editor using upstream's `LimitWindows` bars.
> - Clock is the shared minute tick (`useNowMinute`), never a per-component timer.
> - Mobile keeps upstream's on-demand panel only.

### Problem

Nothing in the UI showed how much of the plan's quota was left, and the only signal the
runtime received was `account.rate-limits.updated`, which arrives **during a turn**. Quota is
also spent outside T3 Code, so a turn-driven number is stale exactly when it matters.

### Behavior now

1. **Limits are polled from each provider CLI**, folded into probes that already run:
   - **Codex** — `account/rateLimits/read` added to the existing app-server probe batch
     (`~60s` refresh). No extra process.
   - **Claude** — the `/usage` control request on the lightweight SDK probe session that
     already reads account info (`~5min` TTL). Its prompt never yields, so no API request is
     made and no tokens are spent. No extra process.
2. Runtime `account.rate-limits.updated` events still apply instantly during a turn.
3. Probe and event snapshots are reconciled by `capturedAt` (`pickFreshestUsage`), so neither
   source clobbers fresher data. Ties go to the probe, which carries every window.
4. Usage is an **overlay** in `ProviderRegistry`, like `updateState`: it survives probe
   refreshes that know nothing about it, is persisted to the per-instance status cache, and is
   re-seeded on boot.
5. UI: two rings beside the composer send button for the selected provider, hover shows
   percent + reset time; the same numbers appear as a row on each provider settings card.
   Above 75% is amber, above 90% red. A window whose reset time has passed renders 0% with an
   explanatory tooltip instead of a stale number.

### Window classification — by duration, not field name

Codex returns its **7-day** window under `primary` with `secondary: null` on at least some
plans. Slots are therefore derived from `windowDurationMins` (`<= 1440` → daily, else weekly),
never from the field it arrived in. Mapping `primary → daily` would render a weekly limit
labelled as a 5-hour one.

Accepted payload shapes (all normalized to `{ daily?, weekly?, capturedAt }`):

| Source                    | Shape                                                           |
| ------------------------- | --------------------------------------------------------------- |
| Codex app-server          | `{ primary?, secondary? }` with `usedPercent`/`resetsAt`        |
| Claude `rate_limit_event` | `{ rate_limit_info: { rateLimitType, utilization, resetsAt } }` |
| Claude `/usage` snapshot  | `{ rate_limits: { five_hour?, seven_day? } }`                   |

Reset stamps arrive as epoch seconds, epoch millis, or ISO strings; all three are handled.

### Providers without limits

**Cursor exposes no account usage.** `cursor-agent status/about --format json` return only
version, tier and email, and ACP's `usage_update` carries per-turn context and cost, not plan
limits. The internal `GetUsageLimitStatusAndActiveGrants` RPC exists in the binary but is not
reachable through the CLI or ACP. The meter renders nothing rather than fabricating numbers.
Grok and OpenCode are likewise not covered.

### Files

| Path                                                        | Change                                              |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `packages/contracts/src/server.ts`                          | `ServerProviderUsage` / `ServerProviderUsageWindow` |
| `apps/server/src/provider/providerUsage.ts`                 | **new** — payload normalization                     |
| `apps/server/src/provider/providerUsage.test.ts`            | **new** — all three payload shapes                  |
| `apps/server/src/provider/Layers/ProviderUsageMonitor.ts`   | **new** — folds runtime events into the overlay     |
| `apps/server/src/provider/Services/ProviderUsageMonitor.ts` | **new** — service tag                               |
| `apps/server/src/provider/Layers/ProviderRegistry.ts`       | usage overlay + `pickFreshestUsage`                 |
| `apps/server/src/provider/Layers/CodexProvider.ts`          | `account/rateLimits/read` in the probe              |
| `apps/server/src/provider/Layers/ClaudeProvider.ts`         | `/usage` control request in the probe               |
| `apps/server/src/provider/providerSnapshot.ts`              | `usage` on the snapshot builder                     |
| `apps/server/src/provider/providerStatusCache.ts`           | usage survives cache hydration                      |
| `apps/web/src/lib/providerUsage.ts`                         | **new** — presentation + reset formatting           |
| `apps/web/src/components/chat/ProviderUsageMeter.tsx`       | **new** — composer rings                            |
| `apps/web/src/components/settings/ProviderInstanceCard.tsx` | limits row                                          |
| `apps/web/src/components/chat/ChatComposer.tsx`             | mounts the meter for the selected provider          |

---

## Theme E — Merge reconciliations (`474aa329d`)

Upstream had independently reworked several areas this branch touches. What was decided:

| Area                        | Resolution                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACP assistant item IDs      | Upstream landed the **same** `session/load` namespacing fix using Effect's crypto instead of `node:crypto`. Upstream's version taken; `assistantItemId` kept exported and this branch's test retargeted from `scope:` to `runtime:`.                                                        |
| Claude auth detection       | Upstream's `apiProvider` model taken wholesale — see Theme A.                                                                                                                                                                                                                               |
| Warm thread cache heuristic | A **still-running** turn with no messages no longer counts as assistant evidence. Without this, upstream's new `ACTIVE_THREAD` fixture (empty `messages`, running turn) was rejected as corrupt and the thread never went live from cache. Settled turns and assistant output still reject. |
| Desktop identity isolation  | Kept alongside upstream's `configuredBaseDir` handling in `stateDir`.                                                                                                                                                                                                                       |
| Sidebar layout              | Kept `DesktopOpenWorkspaceListener` alongside upstream's stage backdrop / resizable sidebar work.                                                                                                                                                                                           |
| `packages/shared` exports   | Both `./desktopOpenArgs` (this branch) and `./connectAuth` (upstream) kept.                                                                                                                                                                                                                 |

---

## Theme F — Timeline ergonomics (`70cbd80fe`)

### Problem

On settled turns the user's prompt bubble scrolled off-screen behind the "Worked for …"
fold and huge auto-expanded changed-files trees, so it was hard to tell **which prompt** a
fold belonged to.

### Behavior now

1. **Turn-fold prompt preview** — each fold row carries `userPromptPreview` (the preceding
   user prompt, whitespace-collapsed, truncated to ~140 chars) + `userMessageId`, rendered on
   the "Worked for …" row so long prompts stay identifiable after folding.
2. **Smaller default diffs** — changed-file directory trees auto-expand only when the diff is
   small (`CHANGED_FILES_DEFAULT_EXPAND_MAX = 12` files); larger trees start collapsed.

### Files

| Path                                                          | Change                                    |
| ------------------------------------------------------------- | ----------------------------------------- |
| `apps/web/src/components/chat/MessagesTimeline.logic.ts`      | fold preview derivation + expand constant |
| `apps/web/src/components/chat/MessagesTimeline.tsx`           | renders preview on the fold row           |
| `apps/web/src/components/chat/MessagesTimeline.logic.test.ts` | preview + expand-threshold coverage       |

Related (same commit family, already covered elsewhere): `1a4952fec` turn-scoped assistant
message IDs also touch `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
(+ its test) — assistant segment message IDs are namespaced by `turn:` so `session/load`
replays cannot collide (see Theme E, ACP assistant item IDs row).

---

## Landed 2026-07-22 — search, file drop, model-reroute notices

Committed as `e576c2043` (search), `43b6367ec` (file drop), `9e6ae2d1f` (model reroute),
`253d416ab` (usage-ring polish). Three features plus polish:

### `e576c2043` — Thread message search (FTS5 + command palette)

Search chat **message text** from the command palette, not just thread titles/branches.

- Migration `033_ProjectionThreadMessageSearch` — FTS5 **trigram** virtual table
  `projection_thread_messages_search` (external content on `projection_thread_messages`)
  plus insert/delete/update triggers keeping it in sync.
- New RPC `orchestration.searchThreads` (`WsOrchestrationSearchThreadsRpc`): query
  3–256 chars, `limit ≤ 200`, returns matching `threadIds`
  (`THREAD_MESSAGE_SEARCH_*` constants in `packages/contracts/src/orchestration.ts`).
- Server chain: `ProjectionThreadMessages.searchThreads` →
  `ProjectionSnapshotQuery.searchThreadIds` → handler in `apps/server/src/ws.ts`.
- Web: search query in `apps/web/src/state/queries.ts`; `CommandPalette.logic.ts` injects the
  query into `searchTerms` of threads whose messages matched, so message hits surface through
  the existing thread rows.
- Several server tests gained `searchThreadIds` stubs for the widened
  `ProjectionSnapshotQuery` interface (`OrchestrationEngine.test`, `serverRuntimeStartup.test`,
  `ProviderSessionReaper.test`, `ProjectSetupScriptRunner.test`, `CheckpointDiffQuery.test`).

### `43b6367ec` — Composer OS file drop → path mentions

Dropping **non-image** files from the OS onto the composer inserts an `@`-mention with the
absolute path instead of failing; images keep the existing attachment path.

- `DesktopBridge.getPathForFile?` in `packages/contracts/src/ipc.ts` + `preload.ts`
  (Electron `webUtils.getPathForFile`; `undefined` in browser builds).
- `apps/web/src/components/chat/composerFileDrop.ts` (**new**) — `planComposerFileDrop`:
  images → attachments, other files → serialized file-link mentions, web build without a
  path resolver → explanatory error instead of a mention.
- `ChatComposer.tsx` wires the plan into the drop handler.

### `9e6ae2d1f` — Model reroute notice (Claude safety fallback Fable → Opus)

When the Fable safety classifier refuses a request and Claude Code retries the turn on the
fallback model (Opus), the dialog silently continued on another model with no UI signal.

- `ClaudeAdapter` now handles the SDK `system/model_refusal_fallback` message (previously it
  fell into the unknown-system-message warning) → emits the pre-existing but previously
  unconsumed `model.rerouted` runtime event with
  `{fromModel, toModel, reason: "refusal[:<category>]"}` — and resyncs `currentApiModelId`
  to the fallback model, so the next `sendTurn` with the user's selected model re-asserts it
  via `setModel` instead of silently staying on the fallback forever.
- `ProviderRuntimeIngestion` maps `model.rerouted` → an info work-log activity, e.g.
  _"Model switched: claude-fable-5 → claude-opus-4-8 (refusal:cyber)"_. This also makes
  Codex `model/rerouted` notifications visible — they were emitted but dropped by ingestion.
- Tests: `ProviderRuntimeIngestion.modelRerouted.test.ts` (**new**) + a
  `model_refusal_fallback` case in `ClaudeAdapter.test.ts`.
- **Known gap:** `retracted_message_uuids` from the fallback message are not processed, so a
  refused partial answer may remain visible in the transcript (follow-up).

### Miscellaneous

- `253d416ab` `ProviderUsageMeter.tsx` — larger usage rings / tap targets, bigger badge text
  (Theme D legibility polish).
- `docs/superpowers/` (untracked, intentionally uncommitted) — local skills/tooling docs,
  not product code.

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
10. **Never point the Claude capability probe at the server cwd** — on desktop that is `$HOME` and initialization takes ~58s, past the 25s budget. See Theme A.
11. **Usage windows are classified by duration**, not by the field they arrive in — Codex ships a 7-day window under `primary`. See Theme D.
12. **A failed capability probe is cached for the full 5-minute TTL** since the merge, so probe regressions present as sticky errors rather than transient ones.

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

# Usage limits (server normalization + web presentation)
cd apps/server && vp test src/provider/providerUsage.test.ts
cd apps/web && vp test src/lib/providerUsage.test.ts

# Manual: usage limits arrive with no turn at all — start against a clean home and
# watch the per-instance status cache fill in:
#   T3CODE_HOME=/tmp/t3-check node apps/server/src/bin.ts serve --port 13779 --base-dir /tmp/t3-check
#   cat /tmp/t3-check/caches/claudeAgent.json | python3 -m json.tool | grep -A8 '"usage"'
# Run the server from $HOME to cover the Theme A regression: status must stay "ready".

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
- `apps/server/src/provider/Layers/ProviderUsageMonitor.ts`
- `apps/server/src/provider/Services/ProviderUsageMonitor.ts`
- `apps/server/src/provider/providerUsage.ts`
- `apps/server/src/provider/providerUsage.test.ts`
- `apps/server/src/provider/acp/AcpSessionRuntime.assistantItemId.test.ts`
- `apps/web/src/components/DesktopOpenWorkspaceListener.tsx`
- `apps/web/src/components/chat/ProviderUsageMeter.tsx`
- `apps/web/src/lib/openWorkspaceIntent.ts`
- `apps/web/src/lib/openWorkspaceIntent.test.ts`
- `apps/web/src/lib/providerUsage.ts`
- `apps/web/src/lib/providerUsage.test.ts`
- `packages/client-runtime/src/state/threadCache.test.ts`
- `packages/shared/src/desktopOpenArgs.ts`
- `packages/shared/src/desktopOpenArgs.test.ts`
- `scripts/t3-code-desktop-local.mjs`
- `scripts/t3-local.sh`
- `diff_with_master.md` (this file)

### Modified

- `README.md`
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
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`
- `apps/server/src/provider/providerMaintenanceRunner.test.ts`
- `apps/server/src/server.ts`
- `apps/server/src/serverRuntimeStartup.ts`
- `apps/server/src/provider/Drivers/ClaudeDriver.ts`
- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `apps/server/src/provider/Layers/CodexProvider.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.test.ts`
- `apps/server/src/provider/Services/ProviderRegistry.ts`
- `apps/server/src/provider/providerSnapshot.ts`
- `apps/server/src/provider/providerStatusCache.ts`
- `apps/server/src/provider/testUtils/providerRegistryMock.ts`
- `apps/server/src/terminal/Manager.ts`
- `apps/server/src/terminal/Manager.test.ts`
- `apps/server/src/terminal/NodePtyAdapter.ts`
- `apps/server/src/terminal/NodePtyAdapter.test.ts`
- `apps/web/src/components/AppSidebarLayout.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/components/chat/MessagesTimeline.logic.ts`
- `apps/web/src/components/chat/MessagesTimeline.logic.test.ts`
- `apps/web/src/components/chat/ProviderStatusBanner.tsx`
- `apps/web/src/components/settings/ProviderInstanceCard.tsx`
- `apps/server/src/provider/acp/AcpSessionRuntime.ts`
- `packages/client-runtime/src/state/threads.ts`
- `packages/client-runtime/src/state/threads-sync.test.ts`
- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/server.ts`
- `packages/shared/package.json`

### Landed 2026-07-22 (commits `e576c2043` … `253d416ab` — see _Landed 2026-07-22_)

Added:

- `apps/server/src/persistence/Migrations/033_ProjectionThreadMessageSearch.ts` (+ test)
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.modelRerouted.test.ts`
- `apps/web/src/components/chat/composerFileDrop.ts` (+ test)

Modified (27 files total): thread-search chain (`ProjectionThreadMessages*`,
`ProjectionSnapshotQuery*`, `Migrations.ts`, `ws.ts`, `rpc.ts`, `orchestration.ts`,
`CommandPalette*`, `queries.ts`, client-runtime `orchestration.ts`), file-drop chain
(`ipc.ts`, `preload.ts`, `ChatComposer.tsx`), model-reroute chain (`ClaudeAdapter*`,
`ProviderRuntimeIngestion.ts`), `ProviderUsageMeter.tsx`, and `searchThreadIds` stubs in
five server test files.

---

## Suggested follow-ups (not done on this branch)

**From the `474aa329d` merge (highest value first):**

- **Restore fail-fast capability caching.** Upstream's flat `Cache.make` TTL keeps a failed
  Claude probe for 5 minutes; the pre-merge `Cache.makeWith` expired failures immediately.
  This is what made the Theme A cwd regression sticky instead of self-healing.
- **Decide the fate of logged-out Claude detection.** Upstream removed the
  `unauthenticated` mapping, so a logged-out Claude reports `ready` and `ChatView`'s send
  guard is unreachable for it. Re-adding it needs a rule that does not mislabel Bedrock.
- **Remove or re-wire `isClaudeAccountAuthenticated()`** — currently dead code.

**Usage limits:**

- Consider passing a project directory (not `$HOME`) as the Claude probe cwd to also surface
  project-scoped slash commands, keeping the neutral-directory guarantee for the desktop case.
- No coverage for Grok / OpenCode / Cursor; Cursor is blocked upstream of us (Theme D).
- Rings show only `daily` / `weekly`; Claude also reports per-model and overage windows.

**Pre-existing:**

- Ship a Nightly/Alpha release that includes Theme C (pending-file + `open -a` path) so stock installs work without rebuilding from this checkout.
- Install a `t3` CLI shim from the desktop installer / brew cask.
- Deep-link (`t3code://open?path=...`) reusing `DesktopOpenIntent` + pending-file.
- Decide whether root `t3` should always prefer desktop when installed, or only `t3 open`.
- Harden flush-until-ack so the renderer does not receive duplicate `dispatchOpenWorkspace` IPC while waiting for ack (poller can re-flush).
