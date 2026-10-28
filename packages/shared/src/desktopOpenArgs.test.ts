// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
import { describe, expect, it, vi } from "vite-plus/test";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  clearPendingDesktopOpenWorkspace,
  parseDesktopOpenWorkspaceArgs,
  readPendingDesktopOpenWorkspace,
  serializeDesktopOpenArgs,
  writePendingDesktopOpenWorkspace,
} from "./desktopOpenArgs.ts";

describe("desktopOpenArgs", () => {
  it("serializes open-workspace args with equals-form path", () => {
    expect(serializeDesktopOpenArgs({ workspaceRoot: "/tmp/brain" })).toEqual([
      "--open-workspace=/tmp/brain",
      "--new-thread",
    ]);
  });

  it("omits new-thread when explicitly disabled", () => {
    expect(serializeDesktopOpenArgs({ workspaceRoot: "/tmp/brain", newThread: false })).toEqual([
      "--open-workspace=/tmp/brain",
    ]);
  });

  it("parses open-workspace args from argv", () => {
    expect(
      parseDesktopOpenWorkspaceArgs(["--open-workspace=/tmp/brain", "--new-thread"], "argv"),
    ).toEqual({
      workspaceRoot: "/tmp/brain",
      newThread: true,
      source: "argv",
    });
  });

  it("parses spaced open-workspace args for compatibility", () => {
    expect(
      parseDesktopOpenWorkspaceArgs(["--open-workspace", "/tmp/brain", "--new-thread"], "argv"),
    ).toEqual({
      workspaceRoot: "/tmp/brain",
      newThread: true,
      source: "argv",
    });
  });

  it("returns null when open-workspace is missing", () => {
    expect(parseDesktopOpenWorkspaceArgs(["--new-thread"], "second-instance")).toBeNull();
  });

  it("round-trips pending open-workspace file", () => {
    const stateDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-open-pending-"));
    try {
      writePendingDesktopOpenWorkspace({
        stateDir,
        workspaceRoot: "/tmp/from-file",
        newThread: true,
      });
      expect(readPendingDesktopOpenWorkspace(stateDir)).toEqual({
        workspaceRoot: "/tmp/from-file",
        newThread: true,
        source: "pending-file",
      });
      clearPendingDesktopOpenWorkspace(stateDir);
      expect(readPendingDesktopOpenWorkspace(stateDir)).toBeNull();
    } finally {
      NodeFS.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("ignores stale pending open-workspace files", () => {
    const stateDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-open-stale-"));
    const writtenAt = Date.parse("2026-10-01T00:00:00.000Z");
    vi.setSystemTime(writtenAt);
    try {
      writePendingDesktopOpenWorkspace({
        stateDir,
        workspaceRoot: "/tmp/stale",
        newThread: true,
      });
      expect(readPendingDesktopOpenWorkspace(stateDir, writtenAt + 121_000)).toBeNull();
      expect(NodeFS.existsSync(NodePath.join(stateDir, "pending-open-workspace.json"))).toBe(false);
    } finally {
      vi.useRealTimers();
      NodeFS.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
