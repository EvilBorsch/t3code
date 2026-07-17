import { describe, expect, it } from "vite-plus/test";

import { parseDesktopOpenWorkspaceArgs, serializeDesktopOpenArgs } from "./desktopOpenArgs.ts";

describe("desktopOpenArgs", () => {
  it("serializes open-workspace args with new-thread by default", () => {
    expect(serializeDesktopOpenArgs({ workspaceRoot: "/tmp/brain" })).toEqual([
      "--open-workspace",
      "/tmp/brain",
      "--new-thread",
    ]);
  });

  it("omits new-thread when explicitly disabled", () => {
    expect(serializeDesktopOpenArgs({ workspaceRoot: "/tmp/brain", newThread: false })).toEqual([
      "--open-workspace",
      "/tmp/brain",
    ]);
  });

  it("parses open-workspace args from argv", () => {
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
});
