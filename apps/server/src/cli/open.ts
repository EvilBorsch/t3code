import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { launchDesktopApp } from "./desktopLaunch.ts";

export class DesktopOpenWorkspacePathError extends Schema.TaggedError<DesktopOpenWorkspacePathError>()(
  "DesktopOpenWorkspacePathError",
  {
    path: Schema.String,
    reason: Schema.Literals(["empty", "not-directory"]),
  },
) {
  override get message(): string {
    if (this.reason === "empty") {
      return "Workspace path cannot be empty.";
    }
    return `Workspace path is not a directory: ${this.path}`;
  }
}

const resolveOpenWorkspaceRoot = Effect.fn("resolveOpenWorkspaceRoot")(function* (rawPath: string) {
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return yield* new DesktopOpenWorkspacePathError({
      path: rawPath,
      reason: "empty",
    });
  }

  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const resolved = path.resolve(trimmed);
  const stat = yield* fs.stat(resolved).pipe(Effect.option);
  if (Option.isNone(stat) || stat.value.type !== "Directory") {
    return yield* new DesktopOpenWorkspacePathError({
      path: resolved,
      reason: "not-directory",
    });
  }
  return resolved;
});

export const openDesktopWorkspace = Effect.fn("openDesktopWorkspace")(function* (rawPath: string) {
  const workspaceRoot = yield* resolveOpenWorkspaceRoot(rawPath);
  const launched = yield* launchDesktopApp({
    workspaceRoot,
    newThread: true,
  });
  yield* Console.log(
    `Opening ${launched.workspaceRoot} in ${launched.label} and starting a new thread.`,
  );
});

export const openCommand = Command.make("open", {
  path: Argument.string("path").pipe(
    Argument.withDescription("Workspace directory to open (defaults to the current directory)."),
    Argument.withDefault("."),
  ),
}).pipe(
  Command.withDescription("Open a workspace in the T3 Code desktop app and start a new thread."),
  Command.withHandler((flags) => openDesktopWorkspace(flags.path)),
);
