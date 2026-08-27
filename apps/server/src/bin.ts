import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";
import * as CliError from "effect/unstable/cli/CliError";

import * as NetService from "@t3tools/shared/Net";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import packageJson from "../package.json" with { type: "json" };
import { authCommand } from "./cli/auth.ts";
import { connectCommand } from "./cli/connect.ts";
import { pairCommand } from "./cli/pair.ts";
import { hasCloudPublicConfig } from "./cloud/publicConfig.ts";
import { type CliServerFlags, sharedServerCommandFlags } from "./cli/config.ts";
import { resolveDesktopBinaryPath } from "./cli/desktopLaunch.ts";
import { openCommand, openDesktopWorkspace } from "./cli/open.ts";
import { isEntrypoint } from "./entrypoint.ts";
import { projectCommand } from "./cli/project.ts";
import { runServerCommand, serveCommand, startCommand } from "./cli/server.ts";
import { serviceCommand } from "./cli/service.ts";
import { servicePreflightCommand } from "./cli/servicePreflight.ts";
import { triageCommand } from "./cli/triage.ts";

const CliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

const connectPublicConfigMissingMessage =
  "T3 Connect commands are unavailable: this build is missing T3 Connect public configuration.";

class ConnectPublicConfigMissingError extends CliError.UserError {
  override get message() {
    return connectPublicConfigMissingMessage;
  }
}

const connectUnavailableCommand = Command.make("connect", {
  command: Argument.string("command").pipe(Argument.variadic),
}).pipe(
  Command.withDescription("T3 Connect is unavailable in builds without public configuration."),
  Command.withHidden,
  Command.withHandler(() =>
    Effect.fail(
      new CliError.ShowHelp({
        commandPath: ["t3", "connect"],
        errors: [new ConnectPublicConfigMissingError({ cause: connectPublicConfigMissingMessage })],
      }),
    ),
  ),
);

const hasExplicitServerFlags = (flags: CliServerFlags): boolean =>
  Option.isSome(flags.mode ?? Option.none()) ||
  Option.isSome(flags.port ?? Option.none()) ||
  Option.isSome(flags.host ?? Option.none()) ||
  Option.isSome(flags.baseDir ?? Option.none()) ||
  Option.isSome(flags.devUrl ?? Option.none()) ||
  Option.isSome(flags.noBrowser ?? Option.none()) ||
  Option.isSome(flags.bootstrapFd ?? Option.none()) ||
  Option.isSome(flags.autoBootstrapProjectFromCwd ?? Option.none()) ||
  Option.isSome(flags.logWebSocketEvents ?? Option.none()) ||
  Option.isSome(flags.tailscaleServeEnabled ?? Option.none()) ||
  Option.isSome(flags.tailscaleServePort ?? Option.none());

const runRootCommand = (flags: CliServerFlags) =>
  Effect.gen(function* () {
    if (!hasExplicitServerFlags(flags)) {
      const platform = yield* HostProcessPlatform;
      if (Option.isSome(resolveDesktopBinaryPath({ platform }))) {
        return yield* openDesktopWorkspace(Option.getOrElse(flags.cwd ?? Option.none(), () => "."));
      }
    }
    return yield* runServerCommand(flags);
  });

export const makeCli = ({ cloudEnabled = hasCloudPublicConfig } = {}) =>
  Command.make("t3", { ...sharedServerCommandFlags }).pipe(
    Command.withDescription(
      "Open the T3 Code desktop app for a workspace, or run the server when desktop is unavailable.",
    ),
    Command.withHandler((flags) => runRootCommand(flags)),
    Command.withSubcommands([
      openCommand,
      startCommand,
      serveCommand,
      pairCommand,
      authCommand,
      projectCommand,
      serviceCommand,
      servicePreflightCommand,
      triageCommand,
      cloudEnabled ? connectCommand : connectUnavailableCommand,
    ]),
  );

export const cli = makeCli();

if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: process.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  Command.run(cli, { version: packageJson.version }).pipe(
    Effect.scoped,
    Effect.provide(CliRuntimeLayer),
    NodeRuntime.runMain,
  );
}
