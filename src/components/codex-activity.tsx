"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PublicCodexSeries } from "@/lib/codex/stats";

const number = new Intl.NumberFormat("en-US");
const month = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const fullDay = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const date = (day: string) => new Date(`${day}T00:00:00.000Z`);
const weekStart = (day: string) => {
  const value = date(day);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value;
};

export const activityIntensity = (
  tokens: number,
  minimum: number,
  maximum: number
) =>
  tokens === 0
    ? 0
    : minimum === maximum
      ? 1
      : (Math.log(tokens) - Math.log(minimum)) /
        (Math.log(maximum) - Math.log(minimum));

const MonthAxis = ({
  calendarOffset,
  values,
}: {
  calendarOffset: number;
  values: PublicCodexSeries["values"];
}) => {
  const columns = Math.ceil((calendarOffset + values.length) / 7);
  const ticks = values.flatMap((point, index) =>
    index === 0 || point.day.slice(5, 7) === values[index - 1]?.day.slice(5, 7)
      ? []
      : [{ day: point.day, index }]
  );
  return (
    <div aria-hidden="true" className="relative mt-2 h-4">
      {ticks.map((tick) => {
        const position =
          Math.floor((calendarOffset + tick.index) / 7) / (columns - 1);
        return (
          <span
            className={`absolute -translate-x-1/2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground ${position > 0.95 ? "-translate-x-full" : ""}`}
            key={tick.day}
            style={{ left: `${String(position * 100)}%` }}
          >
            {month.format(date(tick.day))}
          </span>
        );
      })}
    </div>
  );
};

const labels = {
  cumulative: {
    day: (value: string) => `Through ${fullDay.format(date(value))}`,
  },
  daily: {
    day: (value: string) => fullDay.format(date(value)),
  },
  weekly: {
    day: (value: string) => `Week of ${fullDay.format(weekStart(value))}`,
  },
} as const;

const ActivityHeatmap = ({
  mode,
  series,
}: {
  mode: keyof typeof labels;
  series: PublicCodexSeries;
}) => {
  const positiveTokens = series.values
    .map(({ tokens }) => tokens)
    .filter((tokens) => tokens > 0);
  const minimum = Math.min(...positiveTokens);
  const maximum = Math.max(...positiveTokens);
  const leadingDays =
    (date(series.values[0]?.day ?? "1970-01-05").getUTCDay() + 6) % 7;
  const label = labels[mode];
  return (
    <figure>
      <div
        aria-label={`Combined ${mode} token activity${series.partial ? ", partial data" : ""}`}
        className="grid grid-flow-col grid-rows-7 auto-cols-fr gap-0.5 sm:gap-1"
        role="group"
      >
        {Array.from({ length: leadingDays }, (_, index) => (
          <span aria-hidden="true" key={`leading-${String(index)}`} />
        ))}
        {series.values.map(({ day, tokens }) => {
          const ratio = activityIntensity(tokens, minimum, maximum);
          const color =
            tokens === 0
              ? "bg-muted/60"
              : ratio < 0.25
                ? "bg-primary/25"
                : ratio < 0.5
                  ? "bg-primary/45"
                  : ratio < 0.75
                    ? "bg-primary/70"
                    : "bg-primary";
          const dayLabel = label.day(day);
          return (
            <Tooltip key={day}>
              <TooltipTrigger
                aria-label={`${dayLabel}: ${number.format(tokens)} tokens`}
                className={`aspect-square min-w-0 rounded-[0.2rem] outline-none transition-transform hover:scale-125 focus-visible:z-10 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-ring ${color}`}
                tabIndex={tokens === 0 ? -1 : 0}
                type="button"
              />
              <TooltipContent className="flex-col items-start gap-0.5">
                <span>{dayLabel}</span>
                <span className="font-mono font-medium">
                  {number.format(tokens)} tokens
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <MonthAxis calendarOffset={leadingDays} values={series.values} />
      <figcaption className="mt-1 flex items-center justify-between font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {series.partial ? <span>Partial history</span> : null}
        <span className="ml-auto flex items-center gap-1">
          Less
          {[
            "bg-muted/60",
            "bg-primary/25",
            "bg-primary/45",
            "bg-primary/70",
            "bg-primary",
          ].map((color) => (
            <i
              aria-hidden="true"
              className={`size-2 rounded-[0.15rem] ${color}`}
              key={color}
            />
          ))}
          More
        </span>
      </figcaption>
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
    <TooltipProvider delay={100}>
      <Tabs className="mt-10 gap-5" defaultValue="daily">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-serif text-xl font-bold text-foreground">
            Token activity
          </h3>
          <TabsList aria-label="Token activity interval" variant="line">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="daily">
          <ActivityHeatmap mode="daily" series={daily} />
        </TabsContent>
        <TabsContent value="weekly">
          <ActivityHeatmap mode="weekly" series={weekly} />
        </TabsContent>
        <TabsContent value="cumulative">
          <ActivityHeatmap mode="cumulative" series={cumulative} />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}
