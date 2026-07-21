import type { ServerProviderUsage, ServerProviderUsageWindow } from "@t3tools/contracts";

export type ProviderUsageSlot = "daily" | "weekly";

export interface ProviderUsageWindowPresentation {
  readonly slot: ProviderUsageSlot;
  readonly title: string;
  /** Короткая подпись внутри кружочка ("5h" / "7d"). */
  readonly badge: string;
  readonly usedPercent: number;
  readonly resetsAtMs: number | null;
  /** Окно уже сбросилось — показываем 0% до следующего события провайдера. */
  readonly isExpired: boolean;
}

const FIVE_HOUR_MINUTES = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatWindowHours(windowMinutes: number): string {
  const hours = windowMinutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${Math.round(hours)}h`;
}

function windowTitle(slot: ProviderUsageSlot, windowMinutes: number | undefined): string {
  if (slot === "weekly") {
    return "Weekly limit";
  }
  if (windowMinutes !== undefined && windowMinutes !== FIVE_HOUR_MINUTES) {
    return `${formatWindowHours(windowMinutes)} limit`;
  }
  return "Session limit (5h)";
}

function windowBadge(slot: ProviderUsageSlot, windowMinutes: number | undefined): string {
  if (slot === "weekly") {
    return "7d";
  }
  return windowMinutes !== undefined ? formatWindowHours(windowMinutes) : "5h";
}

function presentWindow(
  slot: ProviderUsageSlot,
  window: ServerProviderUsageWindow,
  nowMs: number,
): ProviderUsageWindowPresentation {
  const resetsAtMs = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  const hasReset = Number.isFinite(resetsAtMs);
  const isExpired = hasReset && resetsAtMs <= nowMs;
  return {
    slot,
    title: windowTitle(slot, window.windowMinutes),
    badge: windowBadge(slot, window.windowMinutes),
    usedPercent: isExpired ? 0 : Math.max(0, Math.min(100, window.usedPercent)),
    resetsAtMs: hasReset && !isExpired ? resetsAtMs : null,
    isExpired,
  };
}

/**
 * Проецирует нормализованный usage-снапшот в готовые к отрисовке окна
 * (daily, weekly) в стабильном порядке.
 */
export function presentProviderUsage(
  usage: ServerProviderUsage,
  nowMs: number,
): ReadonlyArray<ProviderUsageWindowPresentation> {
  const windows: Array<ProviderUsageWindowPresentation> = [];
  if (usage.daily) {
    windows.push(presentWindow("daily", usage.daily, nowMs));
  }
  if (usage.weekly) {
    windows.push(presentWindow("weekly", usage.weekly, nowMs));
  }
  return windows;
}

export function formatUsagePercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  if (clamped > 0 && clamped < 1) {
    return "<1%";
  }
  return `${Math.round(clamped)}%`;
}

function formatRelativeDuration(deltaMs: number): string {
  const totalMinutes = Math.max(1, Math.round(deltaMs / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatAbsoluteReset(resetsAtMs: number, nowMs: number): string {
  const reset = new Date(resetsAtMs);
  const timeText = reset.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sameDay = new Date(nowMs).toDateString() === reset.toDateString();
  if (sameDay) {
    return timeText;
  }
  if (resetsAtMs - nowMs < 7 * DAY_MS) {
    return `${reset.toLocaleDateString(undefined, { weekday: "short" })} ${timeText}`;
  }
  return `${reset.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${timeText}`;
}

/**
 * Человекочитаемое время сброса окна: "Resets in 3h 15m (14:30)".
 * Для сброшенного окна возвращает пояснение об ожидании свежих данных.
 */
export function formatUsageResetLabel(
  window: Pick<ProviderUsageWindowPresentation, "resetsAtMs" | "isExpired">,
  nowMs: number,
): string {
  if (window.isExpired) {
    return "Window has reset — usage updates after the next turn";
  }
  if (window.resetsAtMs === null) {
    return "Reset time unknown";
  }
  const relative = formatRelativeDuration(window.resetsAtMs - nowMs);
  const absolute = formatAbsoluteReset(window.resetsAtMs, nowMs);
  return `Resets in ${relative} (${absolute})`;
}
