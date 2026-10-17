import { sign as signApplication } from "@electron/osx-sign";
import { afterEach, expect, it, vi } from "vite-plus/test";

import signMacosLocal from "./sign-macos-local.ts";

vi.mock("@electron/osx-sign", () => ({ sign: vi.fn() }));

const context = {
  electronPlatformName: "darwin",
  appOutDir: "/tmp/stage/dist/mac-arm64",
  packager: { appInfo: { productFilename: "T3 Code (Nightly)" } },
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("ad-hoc signs the whole bundle without hardened runtime by default", async () => {
  await signMacosLocal(context);

  expect(signApplication).toHaveBeenCalledOnce();
  const options = vi.mocked(signApplication).mock.calls[0]![0];
  expect(options.app).toBe("/tmp/stage/dist/mac-arm64/T3 Code (Nightly).app");
  expect(options.identity).toBe("-");
  expect(options.identityValidation).toBe(false);
  expect(options.batchCodesignCalls).toBe(true);
  expect(options.optionsForFile?.(options.app, { platform: "darwin" })).toEqual({
    hardenedRuntime: false,
  });
});

it("signs with the local identity from the environment when one is configured", async () => {
  vi.stubEnv("T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY", "T3 Code Local");

  await signMacosLocal(context);

  expect(vi.mocked(signApplication).mock.calls[0]![0].identity).toBe("T3 Code Local");
});

it("leaves non-macOS packages alone", async () => {
  await signMacosLocal({ ...context, electronPlatformName: "linux" });

  expect(signApplication).not.toHaveBeenCalled();
});
