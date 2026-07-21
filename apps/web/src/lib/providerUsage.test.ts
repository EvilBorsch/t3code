import { describe, expect, it } from "vite-plus/test";
import type { ServerProviderUsage } from "@t3tools/contracts";

import { formatUsagePercent, formatUsageResetLabel, presentProviderUsage } from "./providerUsage";

const NOW = Date.parse("2026-07-21T12:00:00.000Z");

describe("presentProviderUsage", () => {
  it("проецирует daily и weekly окна в стабильном порядке", () => {
    const usage: ServerProviderUsage = {
      daily: {
        usedPercent: 40,
        resetsAt: "2026-07-21T15:00:00.000Z",
        windowMinutes: 300,
      },
      weekly: {
        usedPercent: 70,
        resetsAt: "2026-07-25T00:00:00.000Z",
        windowMinutes: 10_080,
      },
      capturedAt: "2026-07-21T11:00:00.000Z",
    };

    const windows = presentProviderUsage(usage, NOW);
    expect(windows.map((window) => window.slot)).toEqual(["daily", "weekly"]);
    expect(windows[0]?.badge).toBe("5h");
    expect(windows[0]?.title).toBe("Session limit (5h)");
    expect(windows[0]?.usedPercent).toBe(40);
    expect(windows[1]?.badge).toBe("7d");
    expect(windows[1]?.title).toBe("Weekly limit");
  });

  it("помечает истёкшее окно и обнуляет процент", () => {
    const usage: ServerProviderUsage = {
      daily: {
        usedPercent: 90,
        resetsAt: "2026-07-21T10:00:00.000Z",
        windowMinutes: 300,
      },
      capturedAt: "2026-07-21T09:00:00.000Z",
    };

    const [window] = presentProviderUsage(usage, NOW);
    expect(window?.isExpired).toBe(true);
    expect(window?.usedPercent).toBe(0);
    expect(window?.resetsAtMs).toBeNull();
  });

  it("рендерит только доступные окна", () => {
    const usage: ServerProviderUsage = {
      weekly: { usedPercent: 12, windowMinutes: 10_080 },
      capturedAt: "2026-07-21T11:00:00.000Z",
    };
    const windows = presentProviderUsage(usage, NOW);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.slot).toBe("weekly");
  });

  it("подписывает нестандартное короткое окно по длительности", () => {
    const usage: ServerProviderUsage = {
      daily: { usedPercent: 5, windowMinutes: 180 },
      capturedAt: "2026-07-21T11:00:00.000Z",
    };
    const [window] = presentProviderUsage(usage, NOW);
    expect(window?.badge).toBe("3h");
    expect(window?.title).toBe("3h limit");
  });
});

describe("formatUsagePercent", () => {
  it("округляет и обрабатывает малые доли", () => {
    expect(formatUsagePercent(0)).toBe("0%");
    expect(formatUsagePercent(0.4)).toBe("<1%");
    expect(formatUsagePercent(49.6)).toBe("50%");
    expect(formatUsagePercent(150)).toBe("100%");
  });
});

describe("formatUsageResetLabel", () => {
  it("форматирует относительное и абсолютное время сброса", () => {
    const label = formatUsageResetLabel(
      { resetsAtMs: Date.parse("2026-07-21T15:30:00.000Z"), isExpired: false },
      NOW,
    );
    expect(label).toMatch(/^Resets in 3h 30m \(/);
  });

  it("сообщает про истёкшее окно", () => {
    expect(formatUsageResetLabel({ resetsAtMs: null, isExpired: true }, NOW)).toBe(
      "Window has reset — usage updates after the next turn",
    );
  });

  it("сообщает про неизвестное время сброса", () => {
    expect(formatUsageResetLabel({ resetsAtMs: null, isExpired: false }, NOW)).toBe(
      "Reset time unknown",
    );
  });
});
