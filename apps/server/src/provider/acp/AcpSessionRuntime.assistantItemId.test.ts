import { describe, expect, it } from "vite-plus/test";

import { assistantItemId } from "./AcpSessionRuntime.ts";

describe("assistantItemId", () => {
  it("namespaces segment ids by runtime id so session/load cannot collide", () => {
    const sessionId = "7fac2c3e-f044-44b6-aea7-5e2eed3f28cc";
    const firstRuntime = assistantItemId(sessionId, "runtime-a", 0);
    const resumedRuntime = assistantItemId(sessionId, "runtime-b", 0);

    expect(firstRuntime).toBe(`assistant:${sessionId}:runtime:runtime-a:segment:0`);
    expect(resumedRuntime).toBe(`assistant:${sessionId}:runtime:runtime-b:segment:0`);
    expect(firstRuntime).not.toBe(resumedRuntime);
  });
});
