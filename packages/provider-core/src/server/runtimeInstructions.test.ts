import { describe, expect, it } from "vite-plus/test";
import { t3AgentTools } from "./mcpSession.ts";
import { buildRuntimeInstructions } from "./runtimeInstructions.ts";

const NO_TOOLS = t3AgentTools(undefined);

describe("buildRuntimeInstructions", () => {
  it("requires explicit registration of every PR and stack layer", () => {
    const instructions = buildRuntimeInstructions(
      { harness: "Codex" },
      { ...NO_TOOLS, pullRequests: true },
    );
    expect(instructions).toContain("When the t3-code MCP server exposes link_pull_request");
    expect(instructions).toContain("with the full PR URL immediately after creating a PR");
    expect(instructions).toContain("For a stack, call it for every layer");
    expect(instructions).toContain("call list_thread_pull_requests and link any PR");
  });

  it("describes PR linking only when the session has pull request tools", () => {
    const instructions = buildRuntimeInstructions(
      { harness: "Codex" },
      { ...NO_TOOLS, threads: true, visualReplies: true },
    );
    expect(instructions).toMatch(/^<runtime_info>.*<\/runtime_info>$/s);
    expect(instructions).not.toContain("link_pull_request");
  });

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions(
        {
          harness: "Codex",
          model: "  custom\nmodel  ",
          reasoningEffort: " high\n",
        },
        NO_TOOLS,
      ),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it("names the model by display name and slug when they differ", () => {
    expect(
      buildRuntimeInstructions(
        { harness: "Codex", model: "gpt-5.4", modelName: "GPT-5.4" },
        NO_TOOLS,
      ),
    ).toContain("through the Codex harness, as GPT-5.4 (model slug: gpt-5.4).");
    expect(
      buildRuntimeInstructions(
        { harness: "Codex", model: "my-model", modelName: "my-model" },
        NO_TOOLS,
      ),
    ).toContain("through the Codex harness, as my-model.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model }, NO_TOOLS);
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });
});
