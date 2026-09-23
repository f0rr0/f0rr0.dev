"use client";

import { SiteSection } from "@/components/site-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const MonthAxis = ({
  calendarOffset,
  values,
}: {
  calendarOffset: number;
  values: PublicCodexSeries["values"];
}) => {
  const columns = Math.ceil((calendarOffset + values.length) / 7);
  const ticks = values.flatMap((point, index) =>
    index === 0 ||
    point.day.slice(0, 7) === (values[index - 1]?.day ?? point.day).slice(0, 7)
      ? []
      : [{ day: point.day, index }]
  );
  return (
    <div
      aria-hidden="true"
      className="relative mt-2 h-4 max-sm:[&>span:nth-child(even)]:hidden"
    >
      {ticks.map((tick) => {
        const position =
          Math.floor((calendarOffset + tick.index) / 7) / (columns - 1);
        return (
          <span
            className={`absolute -translate-x-1/2 font-sans text-xs text-muted-foreground ${position > 0.95 ? "-translate-x-full" : ""}`}
            key={tick.day}
            style={{ left: `${String(position * 100)}%` }}
          >
            {formatDate(tick.day, "month")}
          </span>
        );
      })}
    </div>
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
              className={`aspect-square min-w-0 rounded-[0.2rem] outline-none motion-safe:transition-transform motion-safe:hover:scale-125 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${color}`}
              tabIndex={tokens === 0 ? -1 : 0}
              type="button"
            />
          );
        })}
      </div>
      <MonthAxis calendarOffset={leadingDays} values={series.values} />
      {series.partial ? (
        <figcaption className="mt-1 font-sans text-xs text-muted-foreground">
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
  return (
    <TooltipGroup>
      <Tabs className="gap-4" defaultValue="daily">
        <SiteSection
          id="token-activity"
          title="Activity"
          className=""
          action={
            <TabsList aria-label="Token activity interval" variant="line">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
            </TabsList>
          }
        >
          <TabsContent value="daily">
            <ActivityHeatmap mode="daily" series={daily} />
          </TabsContent>
          <TabsContent value="weekly">
            <ActivityHeatmap mode="weekly" series={weekly} />
          </TabsContent>
          <TabsContent value="cumulative">
            <ActivityHeatmap mode="cumulative" series={cumulative} />
          </TabsContent>
        </SiteSection>
      </Tabs>
    </TooltipGroup>
  );
}
