import { parseCliArgs } from "./cliArgs.ts";

export const OPEN_WORKSPACE_FLAG = "open-workspace";
export const NEW_THREAD_FLAG = "new-thread";

export type DesktopOpenWorkspaceSource = "argv" | "second-instance";

export interface DesktopOpenWorkspaceIntent {
  readonly workspaceRoot: string;
  readonly newThread: boolean;
  readonly source: DesktopOpenWorkspaceSource;
}

export function serializeDesktopOpenArgs(input: {
  readonly workspaceRoot: string;
  readonly newThread?: boolean;
}): string[] {
  const args = [`--${OPEN_WORKSPACE_FLAG}`, input.workspaceRoot];
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
