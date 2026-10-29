import { assert, describe, it } from "@effect/vitest";

import type { T3AgentTools } from "./mcpSession.ts";
import {
  T3_CODE_DEVICE_TOOL_INSTRUCTIONS,
  T3_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  t3AcpPromptWithInstructions,
  t3OrchestrationPrompt,
  t3OrchestrationSections,
  t3OrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

const NO_TOOLS: T3AgentTools = {
  threads: false,
  pullRequests: false,
  visualReplies: false,
  browser: false,
  device: false,
};
const ALL_TOOLS: T3AgentTools = {
  threads: true,
  pullRequests: true,
  visualReplies: true,
  browser: true,
  device: true,
};
const VISUAL_REPLIES_ONLY: T3AgentTools = { ...NO_TOOLS, visualReplies: true };
const THREADS_ONLY: T3AgentTools = { ...NO_TOOLS, threads: true };

describe("T3 instructions per agent tool group", () => {
  it("describes only the tool groups the session has", () => {
    assert.equal(t3OrchestrationSystemPrompt(NO_TOOLS), undefined);

    const visualOnly = t3OrchestrationSystemPrompt(VISUAL_REPLIES_ONLY);
    assert.include(visualOnly, "## T3 Code visuals and preview");
    assert.include(visualOnly, "html_render");
    assert.notInclude(visualOnly, "delegate_task");
    assert.notInclude(visualOnly, "preview_*");

    const threadsOnly = t3OrchestrationSystemPrompt(THREADS_ONLY);
    assert.include(threadsOnly, "delegate_task");
    assert.notInclude(threadsOnly, "html_render");
    assert.notInclude(threadsOnly, "preview_*");
    assert.notInclude(threadsOnly, "## T3 Code devices");

    const browserOnly = t3OrchestrationSystemPrompt({ ...NO_TOOLS, browser: true });
    assert.include(browserOnly, "preview_*");
    assert.notInclude(browserOnly, "html_render");

    const deviceOnly = t3OrchestrationSystemPrompt({ ...NO_TOOLS, device: true });
    assert.include(deviceOnly, T3_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(deviceOnly, "delegate_task");
  });

  it("keeps every section of the full text under Codex's per-entry limit", () => {
    const sections = t3OrchestrationSections(ALL_TOOLS);
    assert.equal(sections.length, 3);
    assert.include(sections[2], "### Visuals and preview");
    for (const section of [...sections, T3_CODE_DEVICE_TOOL_INSTRUCTIONS]) {
      assert.isBelow(new TextEncoder().encode(section).length, 4_000);
    }
  });

  it("wraps the prompt until the conversation was told, and only when the session has T3 tools", () => {
    const prompt = "Inspect the repository.";
    const run = (tools: T3AgentTools, orchestrationDelivered: boolean) =>
      t3OrchestrationPrompt({
        prompt,
        tools,
        orchestrationDelivered,
        deviceInstructionsDelivered: orchestrationDelivered,
      });

    const injected = run(ALL_TOOLS, false);
    assert.include(injected, "<t3_code_orchestration_instructions>");
    assert.include(injected, "T3 Code orchestration");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(run(ALL_TOOLS, true), prompt);
    assert.equal(run(NO_TOOLS, false), prompt);
  });

  it("gives ACP sessions only the guidance for granted tool groups", () => {
    const prompt = "Inspect the repository.";
    const all = t3AcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", tools: ALL_TOOLS },
    });
    assert.include(all, "T3 Code browser");
    assert.include(all, "T3 Code orchestration");
    assert.include(all, "ACP fallback");

    const visualOnly = t3AcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", tools: VISUAL_REPLIES_ONLY },
    });
    assert.include(visualOnly, "html_render");
    assert.notInclude(visualOnly, "T3 Code browser");
    assert.notInclude(visualOnly, "T3 Code orchestration");
    assert.notInclude(visualOnly, "ACP fallback");

    const withoutTools = t3AcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", tools: NO_TOOLS },
    });
    assert.include(withoutTools, "T3 Code interaction mode: Default");
    assert.notInclude(withoutTools, "html_render");
  });

  it("reinjects ACP guidance only when mode or tool groups change", () => {
    const prompt = "Continue.";
    const defaultState = { interactionMode: "default", tools: ALL_TOOLS } as const;

    assert.equal(
      t3AcpPromptWithInstructions({
        prompt,
        state: defaultState,
        previousState: { interactionMode: "default", tools: { ...ALL_TOOLS } },
      }),
      prompt,
    );
    const withoutThreads = t3AcpPromptWithInstructions({
      prompt,
      state: { ...defaultState, tools: { ...ALL_TOOLS, threads: false } },
      previousState: defaultState,
    });
    assert.notInclude(withoutThreads, "T3 Code orchestration");
    assert.include(withoutThreads, "html_render");
  });
});

describe("T3 device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(T3_CODE_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(T3_CODE_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__t3-code__device_list,mcp__t3-code__device_open,mcp__t3-code__device_screenshot,mcp__t3-code__device_close`.";
    assert.include(T3_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      T3_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      T3_CODE_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      T3_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      T3_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    const withDevices = { ...THREADS_ONLY, device: true };
    const firstRun = (tools: T3AgentTools) =>
      t3OrchestrationPrompt({
        prompt: "Check the login screen.",
        tools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(withDevices), T3_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(THREADS_ONLY), "## T3 Code devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      t3OrchestrationPrompt({
        prompt: "Check the login screen.",
        tools: withDevices,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), T3_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), "T3 Code orchestration");
    assert.equal(laterRun(true), "Check the login screen.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = { interactionMode: "default", tools: THREADS_ONLY } as const;
    const withDevices = t3AcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, tools: { ...THREADS_ONLY, device: true } },
      previousState: state,
    });
    assert.include(withDevices, T3_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      t3AcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(t3AcpPromptWithInstructions({ prompt: "Hi.", state }), "## T3 Code devices");
  });
});
