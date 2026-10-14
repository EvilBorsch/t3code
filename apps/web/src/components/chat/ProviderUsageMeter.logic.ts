import type { ServerProviderUsageLimits, ServerProviderUsageWindow } from "@t3tools/contracts";
import { formatDuration, type LimitPace, paceOf } from "@t3tools/shared/usageLimits";

export type UsageTone = "ok" | "warning" | "critical";

export interface UsageWindowPresentation {
  readonly id: string;
  /** Подпись внутри кольца: "5h", "7d", "30d" или первая буква модели для model-scoped окна. */
  readonly badge: string;
  readonly title: string;
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly tone: UsageTone;
  readonly pace: LimitPace | null;
  readonly resetsAtMs: number | null;
  /** Сброс уже прошёл, а свежих данных ещё нет: показываем 0%, а не устаревшую цифру. */
  readonly isExpired: boolean;
}

const KIND_ORDER: Record<ServerProviderUsageWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

export function usageTone(usedPercent: number): UsageTone {
  if (usedPercent > 90) return "critical";
  if (usedPercent >= 75) return "warning";
  return "ok";
}

// Claude отдаёт model-scoped недельные окна как `seven_day_<model>` с подписью
// "Weekly · <Model>" (см. server/claudeUsageLimits.ts); их отличаем по id.
function isModelScoped(window: ServerProviderUsageWindow): boolean {
  return window.id !== "seven_day" && window.id.startsWith("seven_day_");
}

function badgeOf(window: ServerProviderUsageWindow): string {
  if (isModelScoped(window)) {
    const model = window.label.split("·").at(-1)?.trim() ?? "";
    return model.charAt(0).toUpperCase() || "7d";
  }
  const mins = window.windowDurationMins;
  switch (window.kind) {
    case "session":
      return mins ? `${Math.round(mins / 60)}h` : "5h";
    case "weekly":
      return "7d";
    case "monthly":
      return mins ? `${Math.round(mins / (24 * 60))}d` : "30d";
    default:
      return mins ? `${Math.round(mins / (24 * 60))}d` : "?";
  }
}

/**
 * Окна лимитов провайдера в стабильном порядке (сессия, неделя, модельные,
 * месяц), готовые к отрисовке. Пустой список для аккаунта без лимитов
 * (API key) и для неудачного probe: рисовать устаревшие цифры хуже, чем ничего.
 */
export function presentUsageWindows(
  limits: ServerProviderUsageLimits | undefined,
  nowMs: number,
): ReadonlyArray<UsageWindowPresentation> {
  if (!limits || limits.unavailable) return [];
  return [...limits.windows]
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        Number(isModelScoped(a)) - Number(isModelScoped(b)),
    )
    .map((window) => {
      const resetsAtMs = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
      const hasReset = Number.isFinite(resetsAtMs);
      const isExpired = hasReset && resetsAtMs <= nowMs;
      const usedPercent = isExpired
        ? 0
        : Math.round(Math.max(0, Math.min(100, window.usedPercent)));
      return {
        id: window.id,
        badge: badgeOf(window),
        title: window.label,
        usedPercent,
        remainingPercent: 100 - usedPercent,
        tone: usageTone(usedPercent),
        pace: isExpired ? null : paceOf(window, nowMs),
        resetsAtMs: hasReset && !isExpired ? resetsAtMs : null,
        isExpired,
      };
    });
}

/** "Resets in 2h 13m"; абсолютное время добавляет компонент, у него есть формат из настроек. */
export function formatUsageReset(window: UsageWindowPresentation, nowMs: number): string {
  if (window.isExpired) return "Window has reset · waiting for fresh data";
  if (window.resetsAtMs === null) return "Reset time unknown";
  return `Resets in ${formatDuration(window.resetsAtMs - nowMs)}`;
}
