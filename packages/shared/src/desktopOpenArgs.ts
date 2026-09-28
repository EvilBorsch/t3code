// @effect-diagnostics nodeBuiltinImport:off - sync pending-file IPC between CLI and Electron.
// @effect-diagnostics globalDate:off - pending intent freshness uses wall-clock ISO timestamps.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { parseCliArgs } from "./cliArgs.ts";

export const OPEN_WORKSPACE_FLAG = "open-workspace";
export const NEW_THREAD_FLAG = "new-thread";
export const PENDING_OPEN_WORKSPACE_FILENAME = "pending-open-workspace.json";
/** Ignore leftover pending intents older than this (CLI↔desktop race window). */
export const PENDING_OPEN_WORKSPACE_MAX_AGE_MS = 120_000;

export type DesktopOpenWorkspaceSource = "argv" | "second-instance" | "pending-file";

export interface DesktopOpenWorkspaceIntent {
  readonly workspaceRoot: string;
  readonly newThread: boolean;
  readonly source: DesktopOpenWorkspaceSource;
}

export interface PendingDesktopOpenWorkspace {
  readonly workspaceRoot: string;
  readonly newThread: boolean;
  readonly writtenAt: string;
}

export function pendingOpenWorkspacePath(stateDir: string): string {
  return NodePath.join(stateDir, PENDING_OPEN_WORKSPACE_FILENAME);
}

const isFreshPendingWrite = (writtenAt: string | undefined, nowMs: number): boolean => {
  if (typeof writtenAt !== "string" || writtenAt.trim().length === 0) {
    return false;
  }
  const writtenMs = Date.parse(writtenAt);
  if (!Number.isFinite(writtenMs)) {
    return false;
  }
  const ageMs = nowMs - writtenMs;
  return ageMs >= 0 && ageMs <= PENDING_OPEN_WORKSPACE_MAX_AGE_MS;
};

export function serializeDesktopOpenArgs(input: {
  readonly workspaceRoot: string;
  readonly newThread?: boolean;
}): string[] {
  // Prefer --flag=value so Chromium/Electron second-instance argv mangling cannot
  // insert switches between the flag and its path value.
  const args = [`--${OPEN_WORKSPACE_FLAG}=${input.workspaceRoot}`];
  if (input.newThread !== false) {
    args.push(`--${NEW_THREAD_FLAG}`);
  }
  return args;
}

export function parseDesktopOpenWorkspaceArgs(
  args: readonly string[],
  source: DesktopOpenWorkspaceSource,
): DesktopOpenWorkspaceIntent | null {
  const parsed = parseCliArgs(args, { booleanFlags: [NEW_THREAD_FLAG] });
  const workspaceRoot = parsed.flags[OPEN_WORKSPACE_FLAG];
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim().length === 0) {
    return null;
  }

  return {
    workspaceRoot: workspaceRoot.trim(),
    newThread: Object.hasOwn(parsed.flags, NEW_THREAD_FLAG),
    source,
  };
}

export function writePendingDesktopOpenWorkspace(input: {
  readonly stateDir: string;
  readonly workspaceRoot: string;
  readonly newThread?: boolean;
}): string {
  const filePath = pendingOpenWorkspacePath(input.stateDir);
  NodeFS.mkdirSync(input.stateDir, { recursive: true });
  const payload: PendingDesktopOpenWorkspace = {
    workspaceRoot: input.workspaceRoot,
    newThread: input.newThread !== false,
    writtenAt: new Date().toISOString(),
  };
  NodeFS.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return filePath;
}

export function readPendingDesktopOpenWorkspace(
  stateDir: string,
  nowMs: number = Date.now(),
): DesktopOpenWorkspaceIntent | null {
  const filePath = pendingOpenWorkspacePath(stateDir);
  let raw: string;
  try {
    raw = NodeFS.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingDesktopOpenWorkspace>;
    const workspaceRoot =
      typeof parsed.workspaceRoot === "string" ? parsed.workspaceRoot.trim() : "";
    if (workspaceRoot.length === 0 || !isFreshPendingWrite(parsed.writtenAt, nowMs)) {
      clearPendingDesktopOpenWorkspace(stateDir);
      return null;
    }
    return {
      workspaceRoot,
      newThread: parsed.newThread !== false,
      source: "pending-file",
    };
  } catch {
    clearPendingDesktopOpenWorkspace(stateDir);
    return null;
  }
}

export function clearPendingDesktopOpenWorkspace(stateDir: string): void {
  const filePath = pendingOpenWorkspacePath(stateDir);
  try {
    NodeFS.unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}
