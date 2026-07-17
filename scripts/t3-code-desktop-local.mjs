#!/usr/bin/env node
/**
 * Local desktop launcher used by `t3 .` / `t3 open` during development.
 * Spawns the rebuilt Electron main from this repo so --open-workspace works
 * without waiting for a Nightly release.
 *
 * Uses a distinct CFBundleIdentifier + userData dir so an already-running
 * installed Nightly/Alpha does not steal the single-instance lock.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { resolveElectronLaunchCommand } from "../apps/desktop/scripts/electron-launcher.mjs";

const LOCAL_BUNDLE_ID = "com.t3tools.t3code.local-open";

const scriptsDir = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const repoRoot = NodePath.resolve(scriptsDir, "..");
const desktopDir = NodePath.join(repoRoot, "apps", "desktop");
const mainEntry = NodePath.join(desktopDir, "dist-electron", "main.cjs");
const passthroughArgs = process.argv.slice(2);
const homeDir = process.env.HOME?.trim() || ".";
const userDataDir = NodePath.join(homeDir, ".t3-local-open", "electron-user-data");

const launch = resolveElectronLaunchCommand([
  `--user-data-dir=${userDataDir}`,
  mainEntry,
  ...passthroughArgs,
]);

// electron-launcher returns .../T3 Code (Alpha).app/Contents/MacOS/Electron
const appBundlePath = NodePath.resolve(launch.electronPath, "..", "..", "..");
const infoPlistPath = NodePath.join(appBundlePath, "Contents", "Info.plist");
if (NodeFS.existsSync(infoPlistPath)) {
  for (const [key, value] of [
    ["CFBundleIdentifier", LOCAL_BUNDLE_ID],
    ["CFBundleName", "T3 Code (Local Open)"],
    ["CFBundleDisplayName", "T3 Code (Local Open)"],
  ]) {
    const replace = NodeChildProcess.spawnSync(
      "plutil",
      ["-replace", key, "-string", value, infoPlistPath],
      { encoding: "utf8" },
    );
    if (replace.status !== 0) {
      NodeChildProcess.spawnSync("plutil", ["-insert", key, "-string", value, infoPlistPath], {
        encoding: "utf8",
      });
    }
  }
}

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
delete childEnv.VITE_DEV_SERVER_URL;
childEnv.T3CODE_DESKTOP_APP_USER_MODEL_ID =
  childEnv.T3CODE_DESKTOP_APP_USER_MODEL_ID?.trim() || LOCAL_BUNDLE_ID;
childEnv.T3CODE_HOME = childEnv.T3CODE_HOME?.trim() || NodePath.join(homeDir, ".t3-local-open");

const child = NodeChildProcess.spawn(launch.electronPath, launch.args, {
  cwd: desktopDir,
  detached: true,
  stdio: "ignore",
  env: childEnv,
});
child.unref();
