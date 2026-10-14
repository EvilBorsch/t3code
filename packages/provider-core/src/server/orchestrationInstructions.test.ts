import { assert, describe, it } from "@effect/vitest";

import type { T3AgentTools } from "./mcpSession.ts";
import {
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  T3_CODE_VISUAL_REPLY_INSTRUCTIONS,
  t3AcpPromptWithInstructions,
  t3OrchestrationPromptForFirstRun,
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

describe("T3 orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Use `delegate_task`");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "ordinary top-level T3 conversations");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Never use them merely");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "cross-provider");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "call `delegate_task` again");
    assert.include(
      T3_CODE_ORCHESTRATION_INSTRUCTIONS,
      "Do not use `t3_thread_send` on `childThreadId`",
    );
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "structured object, never as JSON text");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, '"everyMs":3600000');
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "bindToCurrentThread=false");
  });

  it("keeps visual replies separate from thread tools", () => {
    assert.notInclude(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "html_render");
    assert.include(T3_CODE_VISUAL_REPLY_INSTRUCTIONS, "html_preview");
    assert.include(T3_CODE_VISUAL_REPLY_INSTRUCTIONS, "html_render");
  });

  it("injects prompt fallback only for a first run with T3 tools", () => {
    const prompt = "Inspect the repository.";
    const injected = t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, tools: ALL_TOOLS });

    assert.include(injected, "<t3_code_orchestration_instructions>");
    assert.include(injected, "T3 Code orchestration");
    assert.include(injected, "T3 Code visual replies");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(
      t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 2, tools: ALL_TOOLS }),
      prompt,
    );
    assert.equal(
      t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, tools: NO_TOOLS }),
      prompt,
    );
  });

  it("describes only the tool groups the session has", () => {
    assert.equal(t3OrchestrationSystemPrompt(NO_TOOLS), undefined);
    assert.equal(t3OrchestrationSystemPrompt({ ...NO_TOOLS, browser: true }), undefined);

    const visualOnly = t3OrchestrationSystemPrompt(VISUAL_REPLIES_ONLY);
    assert.include(visualOnly, "html_render");
    assert.notInclude(visualOnly, "delegate_task");

    const threadsOnly = t3OrchestrationSystemPrompt({ ...NO_TOOLS, threads: true });
    assert.include(threadsOnly, "delegate_task");
    assert.notInclude(threadsOnly, "html_render");

    assert.equal(
      t3OrchestrationSystemPrompt(ALL_TOOLS),
      T3_CODE_ORCHESTRATION_INSTRUCTIONS + T3_CODE_VISUAL_REPLY_INSTRUCTIONS,
    );
  });

  it("gives ACP sessions provider-neutral mode, browser, orchestration, and visual guidance", () => {
    const injected = t3AcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", tools: ALL_TOOLS },
    });

    assert.include(injected, "T3 Code interaction mode: Default");
    assert.include(injected, "T3 Code collaborative browser");
    assert.include(injected, "T3 Code orchestration");
    assert.include(injected, "T3 Code visual replies");
    assert.include(injected, "<user_request>\nInspect the repository.\n</user_request>");
  });

  it("gives ACP sessions only the guidance for granted tool groups", () => {
    const visualOnly = t3AcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", tools: VISUAL_REPLIES_ONLY },
    });
    assert.include(visualOnly, "T3 Code visual replies");
    assert.notInclude(visualOnly, "T3 Code collaborative browser");
    assert.notInclude(visualOnly, "T3 Code orchestration");

    const withoutTools = t3AcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", tools: NO_TOOLS },
    });
    assert.include(withoutTools, "T3 Code interaction mode: Default");
    assert.notInclude(withoutTools, "T3 Code collaborative browser");
    assert.notInclude(withoutTools, "T3 Code orchestration");
    assert.notInclude(withoutTools, "T3 Code visual replies");
  });

  it("reinjects ACP guidance only when mode or tool availability changes", () => {
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
    assert.include(
      t3AcpPromptWithInstructions({
        prompt,
        state: { ...defaultState, interactionMode: "plan" },
        previousState: defaultState,
      }),
      "T3 Code interaction mode: Plan",
    );
    const withoutThreads = t3AcpPromptWithInstructions({
      prompt,
      state: { ...defaultState, tools: { ...ALL_TOOLS, threads: false } },
      previousState: defaultState,
    });
    assert.include(withoutThreads, "T3 Code interaction mode: Default");
    assert.notInclude(withoutThreads, "T3 Code orchestration");
    assert.include(withoutThreads, "T3 Code visual replies");
  });
});
