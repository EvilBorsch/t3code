import type { ServerProvider } from "@t3tools/contracts";
import { useMemo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { resetCreditsSummary } from "../usage/UsageLimits";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { composerFloatingLayerProps } from "./composerEventScope";
import {
  formatUsageReset,
  presentUsageWindows,
  type UsageTone,
  type UsageWindowPresentation,
} from "./ProviderUsageMeter.logic";

const TONE_COLOR: Record<UsageTone, string> = {
  ok: "var(--color-success)",
  warning: "var(--color-warning)",
  critical: "var(--color-error)",
};

const PACE_LABEL = { ahead: "ahead of pace", on: "on pace", under: "under pace" } as const;

/** Кольцо одного окна: заполнение — потраченная доля, цвет — светофор по порогам 75/90%. */
export function UsageRing({
  window,
  className,
  showBadge = true,
}: {
  readonly window: UsageWindowPresentation;
  readonly className?: string;
  readonly showBadge?: boolean;
}) {
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="-rotate-90 absolute inset-0 size-full transform-gpu">
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
          strokeWidth="3"
        />
        {window.usedPercent > 0 ? (
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke={TONE_COLOR[window.tone]}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - window.usedPercent / 100)}
            className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
          />
        ) : null}
      </svg>
      {showBadge ? (
        <span className="relative select-none text-[9px] leading-none font-semibold tracking-tight text-foreground/80">
          {window.badge}
        </span>
      ) : null}
    </span>
  );
}

function UsageWindowRow({
  window,
  nowMs,
}: {
  readonly window: UsageWindowPresentation;
  readonly nowMs: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const resetsAt =
    window.resetsAtMs === null
      ? null
      : formatUpcomingTimestamp(new Date(window.resetsAtMs).toISOString(), timestampFormat, nowMs);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-xs text-muted-foreground">{window.title}</span>
        <span className="text-[11px] tabular-nums">
          <span style={{ color: TONE_COLOR[window.tone] }}>{window.usedPercent}% used</span>
          <span className="mx-1 text-secondary-label">·</span>
          <span className="font-medium text-foreground">{window.remainingPercent}% left</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.usedPercent}
        aria-label={`${window.title} usage`}
      >
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${window.usedPercent}%`, backgroundColor: TONE_COLOR[window.tone] }}
        />
      </div>
      <div className="text-[11px] leading-4 text-secondary-label">
        {formatUsageReset(window, nowMs)}
        {resetsAt ? ` (${resetsAt})` : ""}
        {window.pace ? ` · ${PACE_LABEL[window.pace]}` : ""}
      </div>
    </div>
  );
}

/**
 * Кольца лимитов аккаунта выбранного провайдера рядом с кнопкой отправки:
 * по кольцу на окно (сессия, неделя, модельная неделя). Наведение на любое
 * кольцо раскрывает полную картину по всем окнам с процентами и временем сброса.
 */
export function ProviderUsageMeter({ provider }: { readonly provider: ServerProvider | null }) {
  const limits = provider?.usageLimits;
  // Общий минутный тик приложения: точнее для "resets in" не нужно.
  const nowMs = Date.parse(`${useNowMinute()}:00.000Z`);
  const windows = useMemo(() => presentUsageWindows(limits, nowMs), [limits, nowMs]);
  if (!provider || !limits || windows.length === 0) return null;

  const providerName = provider.displayName?.trim() || String(provider.driver);
  const plan = provider.auth.status === "authenticated" ? provider.auth.label : undefined;
  const credits = limits.resetCredits;
  const details = (
    <div className="flex flex-col gap-2.5 p-[var(--floating-content-inset)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-xs text-muted-foreground">
          {providerName} · usage limits
        </span>
        {plan ? <span className="text-[11px] text-secondary-label">{plan}</span> : null}
      </div>
      {windows.map((window) => (
        <UsageWindowRow key={window.id} window={window} nowMs={nowMs} />
      ))}
      {credits && credits.availableCount > 0 ? (
        <div className="text-[11px] leading-4 text-secondary-label tabular-nums">
          {resetCreditsSummary(credits, nowMs)}
        </div>
      ) : null}
    </div>
  );

  return (
    <span className="inline-flex items-center">
      {windows.map((window) => (
        <Popover key={window.id}>
          <PopoverTrigger
            openOnHover
            delay={150}
            closeDelay={0}
            render={
              <Button
                size="icon-sm"
                variant="ghost-muted"
                className="size-7 rounded-full hover:text-muted-foreground data-pressed:text-muted-foreground"
                aria-label={`${providerName} ${window.title}: ${window.usedPercent}% used, ${window.remainingPercent}% left. ${formatUsageReset(window, nowMs)}`}
              >
                <UsageRing window={window} className="size-6" />
              </Button>
            }
          />
          <PopoverPopup
            {...composerFloatingLayerProps}
            tooltipStyle
            side="top"
            align="end"
            viewportClassName="p-0"
            className="w-72 max-w-none text-left whitespace-normal"
          >
            {details}
          </PopoverPopup>
        </Popover>
      ))}
    </span>
  );
}
