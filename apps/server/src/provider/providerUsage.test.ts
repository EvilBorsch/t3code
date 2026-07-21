import type { ServerProviderUsage } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import { normalizeProviderUsage, normalizeProviderUsagePayload } from "./providerUsage.ts";

const CAPTURED_AT = "2026-07-21T12:00:00.000Z";

describe("normalizeProviderUsagePayload", () => {
  it("нормализует Codex-нотификацию с primary/secondary окнами", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rateLimits: {
            primary: {
              usedPercent: 37,
              resetsAt: 1_784_900_000,
              windowDurationMins: 300,
            },
            secondary: {
              usedPercent: 62,
              resetsAt: 1_785_300_000,
              windowDurationMins: 10_080,
            },
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.deepStrictEqual(usage, {
      daily: {
        usedPercent: 37,
        resetsAt: "2026-07-24T13:33:20.000Z",
        windowMinutes: 300,
      },
      weekly: {
        usedPercent: 62,
        resetsAt: "2026-07-29T04:40:00.000Z",
        windowMinutes: 10_080,
      },
      capturedAt: CAPTURED_AT,
    });
  });

  it("раскладывает Codex-окна по длительности, а не по имени слота", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rateLimits: {
            primary: { usedPercent: 10, windowDurationMins: 10_080 },
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.strictEqual(usage?.daily, undefined);
    assert.strictEqual(usage?.weekly?.usedPercent, 10);
  });

  it("переносит незатронутые окна из предыдущего состояния (sparse update)", () => {
    const previous: ServerProviderUsage = {
      weekly: { usedPercent: 55, windowMinutes: 10_080 },
      capturedAt: "2026-07-21T11:00:00.000Z",
    };
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rateLimits: {
            primary: { usedPercent: 20, windowDurationMins: 300 },
          },
        },
      },
      capturedAt: CAPTURED_AT,
      previous,
    });

    assert.deepStrictEqual(usage, {
      daily: { usedPercent: 20, windowMinutes: 300 },
      weekly: { usedPercent: 55, windowMinutes: 10_080 },
      capturedAt: CAPTURED_AT,
    });
  });

  it("нормализует Claude rate_limit_event с пятичасовым окном", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed",
            rateLimitType: "five_hour",
            utilization: 48,
            resetsAt: 1_784_910_000,
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.deepStrictEqual(usage, {
      daily: {
        usedPercent: 48,
        resetsAt: "2026-07-24T16:20:00.000Z",
        windowMinutes: 300,
      },
      capturedAt: CAPTURED_AT,
    });
  });

  it("игнорирует Claude-события про перерасход и другие типы окон", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rate_limit_info: {
            status: "allowed",
            rateLimitType: "overage",
            utilization: 12,
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.strictEqual(usage, undefined);
  });

  it("нормализует Claude /usage снапшот с ISO-строками сброса", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rate_limits: {
            five_hour: { utilization: 30.4, resets_at: "2026-07-21T15:30:00Z" },
            seven_day: { utilization: 71, resets_at: "2026-07-25T00:00:00Z" },
            seven_day_opus: { utilization: 5, resets_at: "2026-07-25T00:00:00Z" },
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.deepStrictEqual(usage, {
      daily: {
        usedPercent: 30.4,
        resetsAt: "2026-07-21T15:30:00.000Z",
        windowMinutes: 300,
      },
      weekly: {
        usedPercent: 71,
        resetsAt: "2026-07-25T00:00:00.000Z",
        windowMinutes: 10_080,
      },
      capturedAt: CAPTURED_AT,
    });
  });

  it("принимает epoch в миллисекундах", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rateLimits: {
            primary: { usedPercent: 1, resetsAt: 1_784_900_000_000, windowDurationMins: 300 },
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.strictEqual(usage?.daily?.resetsAt, "2026-07-24T13:33:20.000Z");
  });

  it("ограничивает usedPercent диапазоном 0..100", () => {
    const usage = normalizeProviderUsagePayload({
      payload: {
        rateLimits: {
          rateLimits: {
            primary: { usedPercent: 140, windowDurationMins: 300 },
          },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.strictEqual(usage?.daily?.usedPercent, 100);
  });

  it("разбирает ответ Codex account/rateLimits/read без обёртки события", () => {
    const usage = normalizeProviderUsage({
      rateLimits: {
        primary: { usedPercent: 12, resetsAt: 1_784_900_000, windowDurationMins: 300 },
        secondary: { usedPercent: 34, resetsAt: 1_785_300_000, windowDurationMins: 10_080 },
        planType: "pro",
      },
      capturedAt: CAPTURED_AT,
    });

    assert.deepStrictEqual(usage, {
      daily: { usedPercent: 12, resetsAt: "2026-07-24T13:33:20.000Z", windowMinutes: 300 },
      weekly: { usedPercent: 34, resetsAt: "2026-07-29T04:40:00.000Z", windowMinutes: 10_080 },
      capturedAt: CAPTURED_AT,
    });
  });

  it("разбирает Claude /usage-снапшот из probe без обёртки события", () => {
    const usage = normalizeProviderUsage({
      rateLimits: {
        rate_limits: {
          five_hour: { utilization: 20, resets_at: "2026-07-21T15:00:00Z" },
          seven_day: { utilization: 44, resets_at: "2026-07-26T00:00:00Z" },
        },
      },
      capturedAt: CAPTURED_AT,
    });

    assert.strictEqual(usage?.daily?.usedPercent, 20);
    assert.strictEqual(usage?.weekly?.usedPercent, 44);
  });

  it("возвращает undefined для нераспознанного payload", () => {
    assert.strictEqual(
      normalizeProviderUsagePayload({ payload: { rateLimits: {} }, capturedAt: CAPTURED_AT }),
      undefined,
    );
    assert.strictEqual(
      normalizeProviderUsagePayload({ payload: undefined, capturedAt: CAPTURED_AT }),
      undefined,
    );
    assert.strictEqual(
      normalizeProviderUsagePayload({ payload: "garbage", capturedAt: CAPTURED_AT }),
      undefined,
    );
  });
});
