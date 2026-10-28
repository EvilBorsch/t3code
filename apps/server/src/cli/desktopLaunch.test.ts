// @effect-diagnostics nodeBuiltinImport:off -- The test plants a live-server record in a temp T3 home.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NetService from "@t3tools/shared/Net";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command } from "effect/cli";

import { makeCli } from "../binCli.ts";
import { PersistedServerRuntimeState } from "../serverRuntimeState.ts";
import {
  DesktopAppResolver,
  listDesktopBinaryCandidates,
  resolveDesktopBinaryPath,
} from "./desktopLaunch.ts";
import { DesktopOpenWorkspacePathError } from "./open.ts";

const encodeRuntimeState = Schema.encodeEffect(Schema.fromJsonString(PersistedServerRuntimeState));

it("prefers Nightly, then Beta, then the pre-Beta Alpha name on macOS", () => {
  const candidates = listDesktopBinaryCandidates({
    platform: "darwin",
    homeDirectory: "/Users/test",
    env: {},
  });
  assert.deepStrictEqual(
    candidates.slice(0, 4).map((candidate) => candidate.label),
    ["T3 Code (Nightly)", "T3 Code (Beta)", "T3 Code (Alpha)", "T3 Code"],
  );
});

it("resolves T3CODE_DESKTOP_BINARY first when executable", () => {
  const resolved = resolveDesktopBinaryPath({
    platform: "darwin",
    homeDirectory: "/Users/test",
    env: { T3CODE_DESKTOP_BINARY: "/custom/t3-binary" },
    isExecutable: (filePath) => filePath === "/custom/t3-binary",
  });
  assert.deepStrictEqual(
    resolved,
    Option.some({
      binaryPath: "/custom/t3-binary",
      label: "T3CODE_DESKTOP_BINARY",
    }),
  );
});

it("includes macOS app bundle path for Nightly", () => {
  const candidates = listDesktopBinaryCandidates({
    platform: "darwin",
    homeDirectory: "/Users/test",
    env: {},
  });
  assert.equal(candidates[0]?.label, "T3 Code (Nightly)");
  assert.equal(candidates[0]?.appBundlePath, "/Applications/T3 Code (Nightly).app");
});

it("returns none when no candidates are executable", () => {
  const resolved = resolveDesktopBinaryPath({
    platform: "darwin",
    homeDirectory: "/Users/test",
    env: {},
    isExecutable: () => false,
  });
  assert.deepStrictEqual(resolved, Option.none());
});

const installedDesktopApp = () =>
  Option.some({
    binaryPath: "/Applications/T3 Code.app/Contents/MacOS/T3 Code",
    label: "T3 Code",
  });

it.effect(
  "t3 <path> hands the workspace to an installed desktop app instead of starting a server",
  () =>
    Effect.gen(function* () {
      const error = yield* Command.runWith(makeCli(), { version: "0.0.0" })([
        "./missing-workspace",
      ]).pipe(
        Effect.provideService(DesktopAppResolver, installedDesktopApp),
        Effect.provide(Layer.mergeAll(NodeServices.layer, NetService.layer)),
        Effect.flip,
      );
      assert.instanceOf(error, DesktopOpenWorkspacePathError);
      assert.equal(error.reason, "not-directory");
    }),
);

// Dev runners start the server as bare `t3` configured through env; a desktop app
// installed on the same machine must not take that launch.
it.effect("bare t3 stays a server launch when a desktop app is installed", () =>
  Effect.acquireUseRelease(
    Effect.promise(() => NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-cli-bare-"))),
    (baseDir) =>
      Effect.gen(function* () {
        const stateDir = NodePath.join(baseDir, "userdata");
        const record = yield* encodeRuntimeState({
          version: 1,
          // Живой чужой процесс: запись с собственным PID CLI считает оставшейся от убитого контейнера.
          pid: process.ppid,
          port: 3773,
          origin: "http://127.0.0.1:3773",
          startedAt: "2026-10-01T00:00:00.000Z",
          serviceManaged: true,
        });
        yield* Effect.promise(() => NodeFSP.mkdir(stateDir, { recursive: true }));
        yield* Effect.promise(() =>
          NodeFSP.writeFile(NodePath.join(stateDir, "server-runtime.json"), record),
        );

        const error = yield* Command.runWith(makeCli(), { version: "0.0.0" })([]).pipe(
          Effect.provideService(DesktopAppResolver, installedDesktopApp),
          Effect.provide(
            Layer.mergeAll(
              NodeServices.layer,
              NetService.layer,
              ConfigProvider.layer(ConfigProvider.fromEnv({ env: { T3CODE_HOME: baseDir } })),
            ),
          ),
          Effect.flip,
        );
        assert.include(String(error), "A T3 Code server is already running");
      }),
    (baseDir) => Effect.promise(() => NodeFSP.rm(baseDir, { recursive: true, force: true })),
  ),
);
