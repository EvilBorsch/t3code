import type { V2TurnStartParams__AdditionalContextEntry } from "effect-codex-app-server/schema";
import type { T3AgentTools } from "@t3tools/provider-core/server/mcpSession";
import { buildRuntimeInstructions } from "@t3tools/provider-core/server/runtimeInstructions";

import {
  T3_CODE_BROWSER_TOOL_INSTRUCTIONS,
  t3OrchestrationSections,
} from "@t3tools/provider-core/server/orchestrationInstructions";

/** Codex silently truncates additionalContext values over 1,000 tokens, counted as UTF-8 bytes / 4. */
export const CODEX_ADDITIONAL_CONTEXT_VALUE_MAX_BYTES = 4_000;

const T3_CODE_DEVICE_TOOL_INSTRUCTIONS = `## T3 Code devices

For iOS Simulators and Android Emulators here, call \`device_list\`, then \`device_open\`. Drive the device with the exact \`agent-device\` launcher and flags it returns, on every command. Prefer \`agent-device snapshot -i\` refs over coordinates. Use \`device_screenshot\` to see the screen. Use \`xcrun simctl\` or \`adb\` only for builds, logs, and ports. If a platform is unavailable, say so.`;

export interface CodexRuntimeInfo {
  readonly model: string;
  readonly modelName?: string | undefined;
  readonly reasoningEffort?: string | undefined;
}

/**
 * Keep this outside collaboration mode; model-catalog mode text overrides client developer_instructions.
 * Text for `preview_*` or `device_*` tools the turn lacks would steer the model away from the
 * automation it still has, so each block follows the session's T3 tools.
 */
export function buildCodexAdditionalContext(
  runtime: CodexRuntimeInfo,
  tools: T3AgentTools,
): Record<string, V2TurnStartParams__AdditionalContextEntry> {
  const toolInstructions = [
    tools.browser ? T3_CODE_BROWSER_TOOL_INSTRUCTIONS : "",
    tools.device ? T3_CODE_DEVICE_TOOL_INSTRUCTIONS : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // Split values to fit per-entry caps; number keys because Codex emits them in key order.
  return {
    ...Object.fromEntries(
      t3OrchestrationSections(tools).map((section, index) => [
        `t3_code_orchestration_${String(index + 1).padStart(2, "0")}`,
        { kind: "application" as const, value: section },
      ]),
    ),
    t3_code_runtime: {
      kind: "application",
      value: buildRuntimeInstructions({ harness: "Codex", ...runtime }, tools),
    },
    ...(toolInstructions
      ? { t3_code_tools: { kind: "application", value: toolInstructions } }
      : {}),
  };
}
