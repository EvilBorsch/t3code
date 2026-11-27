import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

/**
 * Sent by MCP clients that cannot defer tools themselves. `"deferred"` lists a core set plus
 * `tool_search` (for clients that reload on `notifications/tools/list_changed`); `"deferred-proxy"`
 * keeps a fixed core set plus `tool_search` (with schemas) and `tool_call` (for clients that
 * freeze their toolbox per turn).
 */
export const MCP_TOOL_EXPOSURE_HEADER = "t3-tool-exposure";

export type McpToolExposureMode = "deferred" | "deferred-proxy";

export function parseMcpToolExposureMode(
  value: string | undefined,
): McpToolExposureMode | undefined {
  const trimmed = value?.trim();
  return trimmed === "deferred" || trimmed === "deferred-proxy" ? trimmed : undefined;
}

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /** Capabilities the credential grants; read them through `t3AgentTools`. */
  readonly capabilities: ReadonlySet<string>;
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
  /** True while a delegated task this thread started will wake it with its result. */
  readonly hasPendingWake?: Effect.Effect<boolean>;
}

/** Группы T3-инструментов, доступные сессии провайдера; без сервера `t3-code` все false. */
export interface T3AgentTools {
  readonly threads: boolean;
  readonly pullRequests: boolean;
  readonly visualReplies: boolean;
  readonly browser: boolean;
  readonly device: boolean;
}

export const t3AgentTools = (
  session: Pick<McpProviderSessionConfig, "capabilities"> | undefined,
): T3AgentTools => {
  const capabilities = session?.capabilities ?? new Set<string>();
  return {
    threads: capabilities.has("orchestration"),
    pullRequests: capabilities.has("pull-requests"),
    visualReplies: capabilities.has("html"),
    browser: capabilities.has("preview"),
    device: capabilities.has("device"),
  };
};

export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}
