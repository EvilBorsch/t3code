/**
 * Нормализация сырых rate-limit событий провайдеров (`account.rate-limits.updated`)
 * в единый `ServerProviderUsage` с окнами `daily` (короткое окно провайдера,
 * обычно 5 часов) и `weekly`.
 *
 * Поддерживаемые формы payload.rateLimits:
 *  - Codex app-server: `{ rateLimits: { primary?, secondary? } }` (возможно без
 *    внешней обёртки) — окна вида `{ usedPercent, resetsAt?, windowDurationMins? }`.
 *    Обновления разреженные: отсутствующее окно не сбрасывает ранее увиденное.
 *  - Claude SDK `rate_limit_event`: `{ rate_limit_info: { rateLimitType,
 *    utilization?, resetsAt? } }` — одно окно за событие.
 *  - Claude `/usage` снапшот: `{ rate_limits: { five_hour?, seven_day? } }` —
 *    окна вида `{ utilization, resets_at }`.
 */
import type { ServerProviderUsage, ServerProviderUsageWindow } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const FIVE_HOUR_WINDOW_MINUTES = 300;
const SEVEN_DAY_WINDOW_MINUTES = 10_080;
// Окна длиной до суток считаем "daily"-слотом, всё, что дольше, — "weekly".
const DAILY_SLOT_MAX_MINUTES = 1_440;

type UsageSlot = "daily" | "weekly";

interface SlottedWindow {
  readonly slot: UsageSlot;
  readonly window: ServerProviderUsageWindow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Приводит отметку сброса к ISO-строке. Провайдеры присылают либо epoch в
 * секундах (Codex, Claude events), либо в миллисекундах, либо ISO-строку
 * (Claude `/usage`).
 */
function toResetIso(value: unknown): string | undefined {
  if (typeof value === "string") {
    return Option.match(DateTime.make(value), {
      onNone: () => undefined,
      onSome: DateTime.formatIso,
    });
  }
  const numeric = toFiniteNumber(value);
  if (numeric === undefined || numeric <= 0) {
    return undefined;
  }
  const epochMillis = numeric > 1e12 ? numeric : numeric * 1000;
  return DateTime.formatIso(DateTime.makeUnsafe(epochMillis));
}

function makeWindow(input: {
  readonly usedPercent: number;
  readonly resetsAt?: string | undefined;
  readonly windowMinutes?: number | undefined;
}): ServerProviderUsageWindow {
  return {
    usedPercent: clampPercent(input.usedPercent),
    ...(input.resetsAt ? { resetsAt: input.resetsAt } : {}),
    ...(input.windowMinutes !== undefined ? { windowMinutes: input.windowMinutes } : {}),
  };
}

function codexWindow(value: unknown, fallbackSlot: UsageSlot): SlottedWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const usedPercent = toFiniteNumber(value["usedPercent"]);
  if (usedPercent === undefined) {
    return undefined;
  }
  const windowMinutes = toFiniteNumber(value["windowDurationMins"]);
  const slot: UsageSlot =
    windowMinutes === undefined
      ? fallbackSlot
      : windowMinutes <= DAILY_SLOT_MAX_MINUTES
        ? "daily"
        : "weekly";
  return {
    slot,
    window: makeWindow({
      usedPercent,
      resetsAt: toResetIso(value["resetsAt"]),
      ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    }),
  };
}

function collectCodexWindows(snapshot: Record<string, unknown>): ReadonlyArray<SlottedWindow> {
  const windows: Array<SlottedWindow> = [];
  const primary = codexWindow(snapshot["primary"], "daily");
  if (primary) {
    windows.push(primary);
  }
  const secondary = codexWindow(snapshot["secondary"], "weekly");
  if (secondary) {
    windows.push(secondary);
  }
  return windows;
}

function claudeEventWindow(info: Record<string, unknown>): SlottedWindow | undefined {
  const utilization = toFiniteNumber(info["utilization"]);
  if (utilization === undefined) {
    return undefined;
  }
  const rateLimitType = info["rateLimitType"];
  if (rateLimitType !== "five_hour" && rateLimitType !== "seven_day") {
    return undefined;
  }
  const slot: UsageSlot = rateLimitType === "five_hour" ? "daily" : "weekly";
  return {
    slot,
    window: makeWindow({
      usedPercent: utilization,
      resetsAt: toResetIso(info["resetsAt"]),
      windowMinutes: slot === "daily" ? FIVE_HOUR_WINDOW_MINUTES : SEVEN_DAY_WINDOW_MINUTES,
    }),
  };
}

function claudeSnapshotWindow(value: unknown, slot: UsageSlot): SlottedWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const utilization = toFiniteNumber(value["utilization"]);
  if (utilization === undefined) {
    return undefined;
  }
  return {
    slot,
    window: makeWindow({
      usedPercent: utilization,
      resetsAt: toResetIso(value["resets_at"]),
      windowMinutes: slot === "daily" ? FIVE_HOUR_WINDOW_MINUTES : SEVEN_DAY_WINDOW_MINUTES,
    }),
  };
}

function collectClaudeSnapshotWindows(
  rateLimits: Record<string, unknown>,
): ReadonlyArray<SlottedWindow> {
  const windows: Array<SlottedWindow> = [];
  const fiveHour = claudeSnapshotWindow(rateLimits["five_hour"], "daily");
  if (fiveHour) {
    windows.push(fiveHour);
  }
  const sevenDay = claudeSnapshotWindow(rateLimits["seven_day"], "weekly");
  if (sevenDay) {
    windows.push(sevenDay);
  }
  return windows;
}

function collectUsageWindows(payload: unknown): ReadonlyArray<SlottedWindow> {
  if (!isRecord(payload)) {
    return [];
  }

  const info = payload["rate_limit_info"];
  if (isRecord(info)) {
    const window = claudeEventWindow(info);
    return window ? [window] : [];
  }

  const claudeSnapshot = payload["rate_limits"];
  if (isRecord(claudeSnapshot)) {
    return collectClaudeSnapshotWindows(claudeSnapshot);
  }

  const codexWindows = collectCodexWindows(payload);
  if (codexWindows.length > 0) {
    return codexWindows;
  }

  // Codex-нотификация может прийти обёрнутой: `{ rateLimits: { primary, ... } }`.
  const nested = payload["rateLimits"];
  return isRecord(nested) ? collectUsageWindows(nested) : [];
}

/**
 * Строит состояние usage-лимитов из уже развёрнутого объекта лимитов —
 * ответа `account/rateLimits/read` у Codex либо `/usage`-снапшота Claude.
 * Окна, не затронутые входными данными, переносятся из `previous` (обновления
 * провайдеров разреженные). Возвращает `undefined`, когда не распознано ни
 * одного окна.
 */
export function normalizeProviderUsage(input: {
  readonly rateLimits: unknown;
  readonly capturedAt: string;
  readonly previous?: ServerProviderUsage | undefined;
}): ServerProviderUsage | undefined {
  const windows = collectUsageWindows(input.rateLimits);
  if (windows.length === 0) {
    return undefined;
  }

  const next: {
    daily?: ServerProviderUsageWindow;
    weekly?: ServerProviderUsageWindow;
  } = {
    ...(input.previous?.daily ? { daily: input.previous.daily } : {}),
    ...(input.previous?.weekly ? { weekly: input.previous.weekly } : {}),
  };
  for (const { slot, window } of windows) {
    next[slot] = window;
  }

  return {
    ...next,
    capturedAt: input.capturedAt,
  };
}

/**
 * Обёртка для рантайм-события `account.rate-limits.updated`, где объект
 * лимитов лежит в `payload.rateLimits`.
 */
export function normalizeProviderUsagePayload(input: {
  readonly payload: unknown;
  readonly capturedAt: string;
  readonly previous?: ServerProviderUsage | undefined;
}): ServerProviderUsage | undefined {
  return normalizeProviderUsage({
    rateLimits: isRecord(input.payload) ? input.payload["rateLimits"] : undefined,
    capturedAt: input.capturedAt,
    previous: input.previous,
  });
}
