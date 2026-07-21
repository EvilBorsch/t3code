import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ProviderUsageMonitorShape {
  /**
   * Start the background worker that folds `account.rate-limits.updated`
   * runtime events into per-instance `ServerProvider.usage` snapshots.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ProviderUsageMonitor extends Context.Service<
  ProviderUsageMonitor,
  ProviderUsageMonitorShape
>()("t3/provider/Services/ProviderUsageMonitor") {}
