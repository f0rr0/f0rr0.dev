"use client";

import { SiteSection } from "@/components/site-page";
import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/site-tooltip";
import { TokenMonthAxis } from "@/components/token-month-axis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicCodexSeries } from "@/lib/codex/stats";
import { formatDate } from "@/lib/date";

const number = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const date = (day: string) => new Date(`${day}T00:00:00.000Z`);
const weekStart = (day: string) => {
  const value = date(day);
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value;
};

export const activityThresholds = (counts: number[]) => {
  const positive = counts
    .filter((count) => count > 0)
    .toSorted((a, b) => a - b);
  return [0.25, 0.5, 0.75].map(
    (quantile) =>
      positive[Math.max(0, Math.ceil(positive.length * quantile) - 1)] ?? 0
  );
};

const ActivityHeatmap = ({
  mode,
  series,
}: {
  mode: "cumulative" | "daily" | "weekly";
  series: PublicCodexSeries;
}) => {
  const thresholds = activityThresholds(
    series.values.map(({ tokens }) => tokens)
  );
  const leadingDays = date(series.values[0]?.day ?? "1970-01-04").getUTCDay();
  return (
    <figure>
      <div
        aria-label={`${mode} token activity${series.partial ? ", partial data" : ""}`}
        className="grid grid-flow-col grid-rows-7 auto-cols-fr gap-0.5 sm:gap-1"
        role="group"
      >
        {Array.from({ length: leadingDays }, (_, index) => (
          <span aria-hidden="true" key={`leading-${String(index)}`} />
        ))}
        {series.values.map(({ day, tokens }) => {
          const band = thresholds.filter(
            (threshold) => tokens > threshold
          ).length;
          const color =
            tokens === 0
              ? "bg-muted/60"
              : band === 0
                ? "bg-primary/25"
                : band === 1
                  ? "bg-primary/45"
                  : band === 2
                    ? "bg-primary/70"
                    : "bg-primary";
          const dayLabel = formatDate(mode === "weekly" ? weekStart(day) : day);
          return (
            <TooltipTrigger
              key={day}
              payload={
                <TooltipContent>
                  {dayLabel} · {compactNumber.format(tokens)} tokens
                </TooltipContent>
              }
              aria-label={`${dayLabel}: ${number.format(tokens)} tokens`}
              className={`aspect-square min-w-0 rounded-heatmap outline-none motion-safe:transition-transform motion-safe:hover:scale-125 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${color}`}
              tabIndex={tokens === 0 ? -1 : 0}
              type="button"
            />
          );
        })}
      </div>
      <TokenMonthAxis calendarOffset={leadingDays} values={series.values} />
      {series.partial ? (
        <figcaption className="mt-1 font-sans text-sm text-muted-foreground">
          Partial history
        </figcaption>
      ) : null}
    </figure>
  );
};

export function CodexActivity({
  cumulative,
  daily,
  weekly,
}: {
  cumulative: PublicCodexSeries;
  daily: PublicCodexSeries;
  weekly: PublicCodexSeries;
}) {
  const views = (
    [
      ["daily", "Daily", daily],
      ["weekly", "Weekly", weekly],
      ["cumulative", "Cumulative", cumulative],
    ] as const
  ).filter(
    (entry) =>
      entry[2].values.length > 0 &&
      (!entry[2].partial || entry[2].values.some((point) => point.tokens > 0))
  );
  if (views.length === 0) {
    return null;
  }
  return (
    <TooltipGroup>
      <Tabs className="gap-4" defaultValue={views[0][0]}>
        <SiteSection
          id="token-activity"
          title="Activity"
          className=""
          action={
            <TabsList aria-label="Token activity interval" variant="line">
              {views.map(([mode, label]) => (
                <TabsTrigger
                  className="font-normal text-muted-foreground data-active:font-medium transition-[color,background-color,border-color,box-shadow] duration-(--motion-fast) motion-reduce:transition-none"
                  key={mode}
                  value={mode}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        >
          {views.map(([mode, , series]) => (
            <TabsContent key={mode} value={mode}>
              <ActivityHeatmap mode={mode} series={series} />
            </TabsContent>
          ))}
        </SiteSection>
      </Tabs>
    </TooltipGroup>
  );
}
