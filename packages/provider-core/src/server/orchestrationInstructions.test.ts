import { assert, describe, it } from "@effect/vitest";

import type { T3AgentTools } from "./mcpSession.ts";
import {
  t3AcpPromptWithInstructions,
  t3OrchestrationPromptForFirstRun,
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

describe("T3 instructions per agent tool group", () => {
  it("describes only the tool groups the session has", () => {
    assert.equal(t3OrchestrationSystemPrompt(NO_TOOLS), undefined);

    const visualOnly = t3OrchestrationSystemPrompt(VISUAL_REPLIES_ONLY);
    assert.include(visualOnly, "## T3 Code visuals and preview");
    assert.include(visualOnly, "html_render");
    assert.notInclude(visualOnly, "delegate_task");
    assert.notInclude(visualOnly, "preview_*");

    const threadsOnly = t3OrchestrationSystemPrompt({ ...NO_TOOLS, threads: true });
    assert.include(threadsOnly, "delegate_task");
    assert.notInclude(threadsOnly, "html_render");
    assert.notInclude(threadsOnly, "preview_*");

    const browserOnly = t3OrchestrationSystemPrompt({ ...NO_TOOLS, browser: true });
    assert.include(browserOnly, "preview_*");
    assert.notInclude(browserOnly, "html_render");
  });

  it("keeps every section of the full text under Codex's per-entry limit", () => {
    const sections = t3OrchestrationSections(ALL_TOOLS);
    assert.equal(sections.length, 3);
    assert.include(sections[2], "### Visuals and preview");
    for (const section of sections) {
      assert.isBelow(new TextEncoder().encode(section).length, 4_000);
    }
  });

  it("wraps the first run's prompt only when the session has T3 tools", () => {
    const prompt = "Inspect the repository.";
    const injected = t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, tools: ALL_TOOLS });

    assert.include(injected, "<t3_code_orchestration_instructions>");
    assert.include(injected, "T3 Code orchestration");
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
