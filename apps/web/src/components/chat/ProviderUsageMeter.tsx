import { useMemo } from "react";
import type { ServerProviderUsage } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import {
  formatUsagePercent,
  formatUsageResetLabel,
  presentProviderUsage,
  type ProviderUsageWindowPresentation,
} from "~/lib/providerUsage";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function usageColor(usedPercent: number): string {
  if (usedPercent > 90) {
    return "var(--color-red-500)";
  }
  if (usedPercent >= 75) {
    return "var(--color-amber-500)";
  }
  return "var(--color-blue-500)";
}

function UsageWindowCircle(props: {
  window: ProviderUsageWindowPresentation;
  providerDisplayName?: string | null | undefined;
  nowMs: number;
}) {
  const { window, providerDisplayName, nowMs } = props;
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (window.usedPercent / 100) * circumference;
  const color = usageColor(window.usedPercent);
  const percentText = formatUsagePercent(window.usedPercent);
  const resetLabel = formatUsageResetLabel(window, nowMs);
  const title = providerDisplayName ? `${providerDisplayName} · ${window.title}` : window.title;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-6 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={`${title}: ${percentText} used. ${resetLabel}`}
          >
            <span className="relative flex size-4 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 35%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
              <span
                className="relative select-none text-[6.5px] font-semibold leading-none tracking-tight"
                aria-hidden="true"
              >
                {window.badge}
              </span>
            </span>
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-64 max-w-none p-0">
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">{title}</div>
            <div className="text-[11px] tabular-nums text-muted-foreground/70">
              {percentText} used
            </div>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(window.usedPercent)}
            aria-label={`${window.title} usage`}
          >
            <div
              className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${window.usedPercent}%`, backgroundColor: color }}
            />
          </div>
          <div className="text-[11px] leading-4 text-muted-foreground/70">{resetLabel}</div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/**
 * Кружочки daily/weekly лимитов аккаунта провайдера. Рисует только окна,
 * по которым есть данные; при наведении показывает процент и время сброса.
 */
export function ProviderUsageMeter(props: {
  usage: ServerProviderUsage;
  providerDisplayName?: string | null | undefined;
}) {
  // usage.capturedAt меняется с каждым событием, так что пересчёт "now"
  // при обновлении данных достаточен — отдельного таймера не требуется.
  const nowMs = useMemo(() => Date.now(), [props.usage]);
  const windows = presentProviderUsage(props.usage, nowMs);
  if (windows.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center">
      {windows.map((window) => (
        <UsageWindowCircle
          key={window.slot}
          window={window}
          providerDisplayName={props.providerDisplayName}
          nowMs={nowMs}
        />
      ))}
    </span>
  );
}
