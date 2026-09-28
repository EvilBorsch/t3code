import { assert, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { listDesktopBinaryCandidates, resolveDesktopBinaryPath } from "./desktopLaunch.ts";

it("prefers Nightly over Alpha on macOS", () => {
  const candidates = listDesktopBinaryCandidates({
    platform: "darwin",
    homeDirectory: "/Users/test",
    env: {},
  });
  assert.equal(candidates[0]?.label, "T3 Code (Nightly)");
  assert.ok(candidates.some((candidate) => candidate.label === "T3 Code (Alpha)"));
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
