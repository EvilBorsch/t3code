// @effect-diagnostics nodeBuiltinImport:off - detached Electron launch needs Node child_process/fs/path.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { serializeDesktopOpenArgs } from "@t3tools/shared/desktopOpenArgs";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class DesktopAppNotFoundError extends Schema.TaggedErrorClass<DesktopAppNotFoundError>()(
  "DesktopAppNotFoundError",
  {
    searchedPaths: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return [
      "T3 Code desktop app was not found.",
      "Install it from https://github.com/pingdotgg/t3code/releases or with `brew install --cask t3-code`,",
      "or set T3CODE_DESKTOP_BINARY to the app executable.",
      ...(this.searchedPaths.length > 0
        ? [`Looked in: ${this.searchedPaths.slice(0, 8).join(", ")}`]
        : []),
    ].join(" ");
  }
}

export class DesktopAppLaunchError extends Schema.TaggedErrorClass<DesktopAppLaunchError>()(
  "DesktopAppLaunchError",
  {
    binaryPath: Schema.String,
    workspaceRoot: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to launch T3 Code desktop app at '${this.binaryPath}'.`;
  }
}

export type DesktopLaunchCandidate = {
  readonly binaryPath: string;
  readonly label: string;
};

const MAC_APP_NAMES = ["T3 Code (Nightly)", "T3 Code (Alpha)", "T3 Code"] as const;

const isExecutableFile = (filePath: string): boolean => {
  try {
    const stats = NodeFS.statSync(filePath);
    if (!stats.isFile()) return false;
    NodeFS.accessSync(filePath, NodeFS.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const macBinaryForAppBundle = (appBundlePath: string, appName: string): string =>
  NodePath.join(appBundlePath, "Contents", "MacOS", appName);

export function listDesktopBinaryCandidates(input: {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly env?: NodeJS.ProcessEnv;
}): DesktopLaunchCandidate[] {
  const homeDirectory = input.homeDirectory ?? NodeOS.homedir();
  const env = input.env ?? process.env;
  const candidates: DesktopLaunchCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (binaryPath: string, label: string) => {
    const normalized = NodePath.resolve(binaryPath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ binaryPath: normalized, label });
  };

  const envBinary = env.T3CODE_DESKTOP_BINARY?.trim();
  if (envBinary) {
    pushCandidate(envBinary, "T3CODE_DESKTOP_BINARY");
  }

  const envApp = env.T3CODE_DESKTOP_APP?.trim();
  if (envApp && input.platform === "darwin") {
    const appName = NodePath.basename(envApp, ".app");
    pushCandidate(macBinaryForAppBundle(envApp, appName), envApp);
  }

  if (input.platform === "darwin") {
    const searchRoots = ["/Applications", NodePath.join(homeDirectory, "Applications")];
    for (const root of searchRoots) {
      for (const appName of MAC_APP_NAMES) {
        const appBundlePath = NodePath.join(root, `${appName}.app`);
        pushCandidate(macBinaryForAppBundle(appBundlePath, appName), appName);
      }
    }
  } else if (input.platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    const programFiles = env.ProgramFiles?.trim();
    const winRoots = [
      ...(localAppData ? [NodePath.join(localAppData, "Programs")] : []),
      ...(programFiles ? [programFiles] : []),
    ];
    for (const root of winRoots) {
      pushCandidate(NodePath.join(root, "T3 Code (Nightly)", "t3code.exe"), "T3 Code (Nightly)");
      pushCandidate(NodePath.join(root, "T3 Code (Alpha)", "t3code.exe"), "T3 Code (Alpha)");
      pushCandidate(NodePath.join(root, "T3 Code", "t3code.exe"), "T3 Code");
    }
  } else {
    pushCandidate("/usr/bin/t3code", "t3code");
    pushCandidate("/usr/local/bin/t3code", "t3code");
    pushCandidate(NodePath.join(homeDirectory, ".local", "bin", "t3code"), "t3code");
  }

  return candidates;
}

export function resolveDesktopBinaryPath(input: {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly isExecutable?: (filePath: string) => boolean;
}): Option.Option<DesktopLaunchCandidate> {
  const isExecutable = input.isExecutable ?? isExecutableFile;
  for (const candidate of listDesktopBinaryCandidates(input)) {
    if (isExecutable(candidate.binaryPath)) {
      return Option.some(candidate);
    }
  }
  return Option.none();
}

export const launchDesktopApp = Effect.fn("launchDesktopApp")(function* (input: {
  readonly workspaceRoot: string;
  readonly newThread?: boolean;
  readonly homeDirectory?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly spawnDetached?: (binaryPath: string, args: readonly string[]) => void;
}) {
  const platform = yield* HostProcessPlatform;
  const resolveInput = {
    platform,
    ...(input.homeDirectory !== undefined ? { homeDirectory: input.homeDirectory } : {}),
    ...(input.env !== undefined ? { env: input.env } : {}),
  };
  const resolved = resolveDesktopBinaryPath(resolveInput);
  if (Option.isNone(resolved)) {
    return yield* new DesktopAppNotFoundError({
      searchedPaths: listDesktopBinaryCandidates(resolveInput).map(
        (candidate) => candidate.binaryPath,
      ),
    });
  }

  const args = serializeDesktopOpenArgs({
    workspaceRoot: input.workspaceRoot,
    ...(input.newThread !== undefined ? { newThread: input.newThread } : {}),
  });
  const spawnDetached =
    input.spawnDetached ??
    ((binaryPath, spawnArgs) => {
      const child = NodeChildProcess.spawn(binaryPath, [...spawnArgs], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    });

  yield* Effect.try({
    try: () => {
      spawnDetached(resolved.value.binaryPath, args);
    },
    catch: (cause) =>
      new DesktopAppLaunchError({
        binaryPath: resolved.value.binaryPath,
        workspaceRoot: input.workspaceRoot,
        cause,
      }),
  });

  return {
    binaryPath: resolved.value.binaryPath,
    label: resolved.value.label,
    workspaceRoot: input.workspaceRoot,
  } as const;
});
