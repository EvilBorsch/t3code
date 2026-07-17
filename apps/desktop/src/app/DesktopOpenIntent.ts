import type { DesktopOpenWorkspaceIntent } from "@t3tools/contracts";
import {
  clearPendingDesktopOpenWorkspace,
  parseDesktopOpenWorkspaceArgs,
  readPendingDesktopOpenWorkspace,
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
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
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
  | DesktopEnvironment.DesktopEnvironment
  | FileSystem.FileSystem
  | Path.Path;

/**
 * @effect-expect-leaking DesktopWindow | ElectronApp | DesktopEnvironment | FileSystem | Path
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
  const environment = yield* DesktopEnvironment.DesktopEnvironment;

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

  const consumePendingFile = Effect.fn("desktop.openIntent.consumePendingFile")(function* () {
    const intent = readPendingDesktopOpenWorkspace(environment.stateDir);
    if (!intent) {
      return false;
    }
    clearPendingDesktopOpenWorkspace(environment.stateDir);
    yield* enqueue(intent);
    return true;
  });

  const ingestExternalOpenRequest = Effect.fn("desktop.openIntent.ingestExternal")(function* (
    commandLine: readonly string[] | undefined,
    source: DesktopOpenWorkspaceSource,
  ) {
    if (Array.isArray(commandLine)) {
      yield* handleCommandLine(commandLine, source);
    }
    yield* consumePendingFile();
    yield* flush.pipe(Effect.ignore({ log: true }));
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
      yield* consumePendingFile();

      yield* electronApp.on(
        "second-instance",
        (_event: unknown, commandLine: string[] | undefined) => {
          void runPromise(ingestExternalOpenRequest(commandLine, "second-instance"));
        },
      );

      // macOS Launch Services activates the existing app instead of delivering
      // CLI argv via second-instance. Consume the pending file on activate.
      yield* electronApp.on("activate", () => {
        void runPromise(ingestExternalOpenRequest(undefined, "pending-file"));
      });

      // Keep polling: activate may not fire when Nightly is already frontmost.
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          while (true) {
            const consumed = yield* consumePendingFile();
            if (consumed) {
              yield* flush.pipe(Effect.ignore({ log: true }));
            }
            yield* Effect.sleep("750 millis");
          }
        }),
      );

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          for (let attempt = 0; attempt < 120; attempt += 1) {
            const pending = yield* Ref.get(pendingRef);
            if (Option.isNone(pending)) {
              if (attempt >= 20) {
                return;
              }
            } else {
              yield* flush.pipe(Effect.ignore({ log: true }));
            }
            yield* Effect.sleep("500 millis");
          }
          const stillPending = yield* Ref.get(pendingRef);
          if (Option.isSome(stillPending)) {
            yield* logOpenIntentWarning(
              "timed out waiting for renderer to acknowledge open-workspace",
            );
          }
        }),
      );
    }).pipe(Effect.withSpan("desktop.openIntent.register")),
  });
});

export const layer = Layer.effect(DesktopOpenIntent, make);
