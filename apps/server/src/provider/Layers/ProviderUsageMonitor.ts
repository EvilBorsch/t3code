/**
 * ProviderUsageMonitorLive — сворачивает `account.rate-limits.updated` события
 * из общего runtime-потока в `ServerProvider.usage` соответствующего инстанса.
 * Реестр публикует обновлённый снапшот клиентам через `streamChanges`, так что
 * лимиты доезжают до UI тем же путём, что и статусы провайдеров.
 *
 * @module ProviderUsageMonitorLive
 */
import { defaultInstanceIdForDriver } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { normalizeProviderUsagePayload } from "../providerUsage.ts";
import { ProviderRegistry } from "../Services/ProviderRegistry.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import {
  ProviderUsageMonitor,
  type ProviderUsageMonitorShape,
} from "../Services/ProviderUsageMonitor.ts";

const make = Effect.gen(function* () {
  const providerService = yield* ProviderService;
  const providerRegistry = yield* ProviderRegistry;

  const start: ProviderUsageMonitorShape["start"] = () =>
    Effect.forkScoped(
      Stream.runForEach(providerService.streamEvents, (event) =>
        Effect.gen(function* () {
          if (event.type !== "account.rate-limits.updated") {
            return;
          }
          const instanceId = event.providerInstanceId ?? defaultInstanceIdForDriver(event.provider);
          const providers = yield* providerRegistry.getProviders;
          const previous = providers.find((provider) => provider.instanceId === instanceId)?.usage;
          const usage = normalizeProviderUsagePayload({
            payload: event.payload,
            capturedAt: event.createdAt,
            previous,
          });
          if (!usage) {
            return;
          }
          yield* providerRegistry.setProviderUsage({ instanceId, usage });
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.usage.monitor.event-failed", {
              eventId: event.eventId,
              provider: event.provider,
              cause,
            }),
          ),
        ),
      ),
    ).pipe(Effect.asVoid);

  return { start } satisfies ProviderUsageMonitorShape;
});

export const ProviderUsageMonitorLive = Layer.effect(ProviderUsageMonitor, make);
