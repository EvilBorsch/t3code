# Composer OS file drop → path mentions

Date: 2026-07-22
Status: approved (chat), implemented in this branch

## Problem

Dropping a file from the OS (Finder) onto the chat composer only works for
images; any other file (`log.txt`, …) is rejected with "Unsupported file
type". Users want a dropped file to appear exactly like an `@` mention with
its **absolute path** (e.g. `[log.txt](/Users/me/Downloads/log.txt)`), with no
copy into the project — the agent reads the file from where it lives.

## Constraint

Only the Electron desktop build can resolve the OS path of a dropped `File`
(`webUtils.getPathForFile`). Plain browsers never expose it. Decision (user):
in the web build a non-image drop shows a clear error toast/thread error; the
feature itself is desktop-only.

## Design

1. **Contract** (`packages/contracts/src/ipc.ts`): optional
   `getPathForFile?: (file: File) => string` on `DesktopBridge`, present only
   in the desktop build (same pattern as `preview`).
2. **Preload** (`apps/desktop/src/preload.ts`): implement via
   `webUtils.getPathForFile(file)`.
3. **Composer** (`apps/web/.../ChatComposer.tsx` + new pure module
   `composerFileDrop.ts`): on drop, partition `dataTransfer.files`:
   - `image/*` → existing attachment flow (`addComposerImages`), unchanged;
   - others → resolve absolute path via the bridge and insert
     `serializeComposerFileLink(path)` mentions at the end of the prompt
     (same insert path as file-tree drags). Multiple files → multiple
     mentions in one insert.
   - no bridge (web) or empty path (synthetic File) → error surfaced via
     `setThreadError`, matching the existing unsupported-type error.

The pure partition/serialization logic lives in `composerFileDrop.ts` with
unit tests, mirroring `composerMentionDrag.ts`.

## Out of scope

Paste handling (still images-only), mobile app, uploading file contents as
attachments in the web build.
