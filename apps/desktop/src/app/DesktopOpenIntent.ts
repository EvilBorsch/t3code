import type { DesktopOpenWorkspaceIntent } from "@t3tools/contracts";
import {
  parseDesktopOpenWorkspaceArgs,
  type DesktopOpenWorkspaceSource,
} from "@t3tools/shared/desktopOpenArgs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

export class DesktopOpenWorkspacePathError extends Schema.TaggedErrorClass<DesktopOpenWorkspacePathError>()(
  "DesktopOpenWorkspacePathError",
  {
    path: Schema.String,
    reason: Schema.Literals(["empty", "not-directory"]),
  },
) {
  override get message(): string {
    if (this.reason === "empty") {
      return "Open-workspace path cannot be empty.";
    }
    return `Open-workspace path is not a directory: ${this.path}`;
  }
}

export type DesktopOpenIntentRuntimeServices =
  | DesktopWindow.DesktopWindow
  | ElectronApp.ElectronApp
  | FileSystem.FileSystem
  | Path.Path;

/**
 * @effect-expect-leaking DesktopWindow | ElectronApp | FileSystem | Path
 */
export class DesktopOpenIntent extends Context.Service<
  DesktopOpenIntent,
  {
    readonly enqueue: (
      intent: DesktopOpenWorkspaceIntent,
    ) => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>;
    readonly handleCommandLine: (
      commandLine: readonly string[],
      source: DesktopOpenWorkspaceSource,
    ) => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>;
    readonly flush: Effect.Effect<
      void,
      DesktopWindow.DesktopWindowError,
      DesktopWindow.DesktopWindow
    >;
    readonly peek: Effect.Effect<DesktopOpenWorkspaceIntent | null>;
    readonly ack: Effect.Effect<void>;
    readonly register: Effect.Effect<void, never, Scope.Scope | DesktopOpenIntentRuntimeServices>;
  }
>()("@t3tools/desktop/app/DesktopOpenIntent") {}

const { logInfo: logOpenIntentInfo, logWarning: logOpenIntentWarning } =
  makeComponentLogger("desktop-open-intent");

const normalizeOpenWorkspaceIntent = Effect.fn("desktop.openIntent.normalize")(function* (
  intent: DesktopOpenWorkspaceIntent,
) {
  const trimmed = intent.workspaceRoot.trim();
  if (trimmed.length === 0) {
    return yield* new DesktopOpenWorkspacePathError({
      path: intent.workspaceRoot,
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

  return {
    workspaceRoot: resolved,
    newThread: intent.newThread,
    source: intent.source,
  } satisfies DesktopOpenWorkspaceIntent;
});

export const make = Effect.gen(function* () {
  const pendingRef = yield* Ref.make<Option.Option<DesktopOpenWorkspaceIntent>>(Option.none());

  const enqueue = Effect.fn("desktop.openIntent.enqueue")(function* (
    intent: DesktopOpenWorkspaceIntent,
  ) {
    const normalized = yield* normalizeOpenWorkspaceIntent(intent).pipe(
      Effect.catch((error) =>
        logOpenIntentWarning("ignored invalid open-workspace intent", {
          path: intent.workspaceRoot,
          reason: error.reason,
        }).pipe(Effect.as(null)),
      ),
    );
    if (normalized === null) {
      return;
    }
    yield* Ref.set(pendingRef, Option.some(normalized));
    yield* logOpenIntentInfo("queued open-workspace intent", {
      workspaceRoot: normalized.workspaceRoot,
      newThread: normalized.newThread,
      source: normalized.source,
    });
  });

  const flush = Effect.gen(function* () {
    const pending = yield* Ref.get(pendingRef);
    if (Option.isNone(pending)) {
      return;
    }
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    const didDispatch = yield* desktopWindow.dispatchOpenWorkspace(pending.value);
    if (!didDispatch) {
      return;
    }
    yield* logOpenIntentInfo("dispatched open-workspace intent", {
      workspaceRoot: pending.value.workspaceRoot,
      newThread: pending.value.newThread,
      source: pending.value.source,
    });
  }).pipe(Effect.withSpan("desktop.openIntent.flush"));

  const peek = Ref.get(pendingRef).pipe(
    Effect.map((pending) => (Option.isNone(pending) ? null : pending.value)),
  );

  const ack = Ref.set(pendingRef, Option.none()).pipe(Effect.asVoid);

  const handleCommandLine = Effect.fn("desktop.openIntent.handleCommandLine")(function* (
    commandLine: readonly string[],
    source: DesktopOpenWorkspaceSource,
  ) {
    const parsed = parseDesktopOpenWorkspaceArgs(commandLine, source);
    if (!parsed) {
      return;
    }
    yield* enqueue(parsed);
  });

  return DesktopOpenIntent.of({
    enqueue,
    handleCommandLine,
    flush,
    peek,
    ack,
    register: Effect.gen(function* () {
      const electronApp = yield* ElectronApp.ElectronApp;
      const context = yield* Effect.context<
        DesktopWindow.DesktopWindow | FileSystem.FileSystem | Path.Path
      >();
      const runPromise = Effect.runPromiseWith(context);

      yield* handleCommandLine(process.argv, "argv");

      yield* electronApp.on(
        "second-instance",
        (_event: unknown, commandLine: string[] | undefined) => {
          void runPromise(
            Effect.gen(function* () {
              if (Array.isArray(commandLine)) {
                yield* handleCommandLine(commandLine, "second-instance");
              }
              yield* flush.pipe(Effect.ignore({ log: true }));
            }),
          );
        },
      );

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          for (let attempt = 0; attempt < 120; attempt += 1) {
            const pending = yield* Ref.get(pendingRef);
            if (Option.isNone(pending)) {
              return;
            }
            yield* flush.pipe(Effect.ignore({ log: true }));
            yield* Effect.sleep("500 millis");
          }
          yield* logOpenIntentWarning(
            "timed out waiting for renderer to acknowledge open-workspace",
          );
        }),
      );
    }).pipe(Effect.withSpan("desktop.openIntent.register")),
  });
});

export const layer = Layer.effect(DesktopOpenIntent, make);
