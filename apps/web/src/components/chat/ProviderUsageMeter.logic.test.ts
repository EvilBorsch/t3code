import type { ServerProviderUsageLimits } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatUsageReset, presentUsageWindows } from "./ProviderUsageMeter.logic";

const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe("presentUsageWindows", () => {
  it("shows Claude's session, weekly and model-scoped weekly windows in that order", () => {
    const limits: ServerProviderUsageLimits = {
      checkedAt: iso(0),
      windows: [
        {
          id: "seven_day_fable",
          kind: "weekly",
          label: "Weekly · Fable",
          usedPercent: 93,
          windowDurationMins: 7 * 24 * 60,
          resetsAt: iso(3 * DAY),
        },
        {
          id: "seven_day",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 80,
          windowDurationMins: 7 * 24 * 60,
          resetsAt: iso(3 * DAY),
        },
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent: 42,
          windowDurationMins: 300,
          resetsAt: iso(2 * HOUR + 13 * 60 * 1000),
        },
      ],
    };

    const windows = presentUsageWindows(limits, NOW);

    expect(windows.map((window) => window.badge)).toEqual(["5h", "7d", "F"]);
    expect(windows.map((window) => window.title)).toEqual(["Session", "Weekly", "Weekly · Fable"]);
    expect(windows.map((window) => window.tone)).toEqual(["ok", "warning", "critical"]);
    expect(windows[0]).toMatchObject({ usedPercent: 42, remainingPercent: 58, isExpired: false });
  });

  it("badges Codex windows by their duration, including a monthly Free plan allowance", () => {
    const paid: ServerProviderUsageLimits = {
      checkedAt: iso(0),
      windows: [
        {
          id: "primary",
          kind: "session",
          label: "Session",
          usedPercent: 10,
          windowDurationMins: 300,
          resetsAt: iso(HOUR),
        },
        {
          id: "secondary",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 20,
          windowDurationMins: 7 * 24 * 60,
          resetsAt: iso(5 * DAY),
        },
      ],
    };
    const free: ServerProviderUsageLimits = {
      checkedAt: iso(0),
      windows: [
        {
          id: "primary",
          kind: "monthly",
          label: "Monthly",
          usedPercent: 55,
          windowDurationMins: 30 * 24 * 60,
          resetsAt: iso(12 * DAY),
        },
      ],
    };

    expect(presentUsageWindows(paid, NOW).map((window) => window.badge)).toEqual(["5h", "7d"]);
    expect(presentUsageWindows(free, NOW).map((window) => window.badge)).toEqual(["30d"]);
  });

  it("renders a window whose reset has passed as untouched until fresh data arrives", () => {
    const limits: ServerProviderUsageLimits = {
      checkedAt: iso(-3 * HOUR),
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent: 97,
          windowDurationMins: 300,
          resetsAt: iso(-5 * 60 * 1000),
        },
      ],
    };

    const [window] = presentUsageWindows(limits, NOW);

    expect(window).toMatchObject({
      usedPercent: 0,
      remainingPercent: 100,
      isExpired: true,
      tone: "ok",
      resetsAtMs: null,
    });
    expect(formatUsageReset(window!, NOW)).toBe("Window has reset · waiting for fresh data");
  });

  it("draws nothing for an account that cannot report or a probe that failed", () => {
    expect(presentUsageWindows(undefined, NOW)).toEqual([]);
    expect(
      presentUsageWindows(
        { checkedAt: iso(0), windows: [], unavailable: { reason: "unsupported" } },
        NOW,
      ),
    ).toEqual([]);
    expect(
      presentUsageWindows(
        {
          checkedAt: iso(0),
          windows: [
            {
              id: "five_hour",
              kind: "session",
              label: "Session",
              usedPercent: 12,
              windowDurationMins: 300,
            },
          ],
          unavailable: { reason: "probeFailed" },
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("phrases the countdown to the reset and admits when it is unknown", () => {
    const [timed, untimed] = presentUsageWindows(
      {
        checkedAt: iso(0),
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 30,
            windowDurationMins: 300,
            resetsAt: iso(2 * HOUR + 13 * 60 * 1000),
          },
          { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 30 },
        ],
      },
      NOW,
    );

    expect(formatUsageReset(timed!, NOW)).toBe("Resets in 2h 13m");
    expect(formatUsageReset(untimed!, NOW)).toBe("Reset time unknown");
  });
});
