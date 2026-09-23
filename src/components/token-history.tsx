"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { SiteSection } from "@/components/site-page";
import { TokenMonthAxis } from "@/components/token-month-axis";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sitePreferences } from "@/content/site";
import { summarizeTokenHistory } from "@/lib/codex/history";
import type { TokenHistory } from "@/lib/codex/history";
import { formatDate } from "@/lib/date";

const compact = new Intl.NumberFormat(sitePreferences.language, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat(sitePreferences.language);
const config = { tokens: { label: "Tokens", color: "var(--foreground)" } };

function HistoryPlot({
  history,
  today,
  mode,
}: {
  history: TokenHistory;
  today: string;
  mode: "daily" | "cumulative";
}) {
  const summary = summarizeTokenHistory(history, today);
  const rows = mode === "cumulative" ? summary.cumulativeRows : summary.rows;
  const { peak } = summary;
  const peakLabel =
    peak === undefined
      ? ""
      : `Daily peak ${compact.format(peak.tokens ?? 0)} · ${formatDate(peak.day)}`;
  const cumulativePeak = summary.cumulativeRows.find(
    (row) => row.day === peak?.day
  );
  const last = rows.findLast((row) => row.tokens !== null);
  const annotation =
    mode === "daily"
      ? peakLabel
      : last === undefined
        ? ""
        : `${summary.partial ? "Recorded total" : "Total"} ${compact.format(last.tokens ?? 0)}`;
  const marked = mode === "daily" ? peak : last;
  return (
    <>
      <ChartContainer
        config={config}
        className="h-54 w-full aspect-auto sm:h-66 [&_.recharts-surface]:overflow-visible [&_.recharts-surface]:focus-visible:outline-2 [&_.recharts-surface]:focus-visible:outline-ring"
      >
        <LineChart
          accessibilityLayer
          data={rows}
          margin={{ left: 0, right: 0, top: 24, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" hide />
          <YAxis
            tickLine={false}
            axisLine={false}
            mirror
            width={44}
            tickMargin={0}
            tickSize={0}
            interval={0}
            tick={{
              dy: -8,
              stroke: "var(--background)",
              strokeWidth: 3,
              paintOrder: "stroke",
              fill: "var(--muted-foreground)",
              fontSize: 12,
              fontWeight: 300,
            }}
            tickCount={3}
            domain={[0, "auto"]}
            tickFormatter={(value) =>
              Number(value) === 0 ? "" : compact.format(Number(value))
            }
          />
          <ChartTooltip
            filterNull={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as
                | (typeof rows)[number]
                | undefined;
              return active && row !== undefined ? (
                <div className="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm">
                  <p>{formatDate(row.day)}</p>
                  <p>
                    {row.tokens === null
                      ? "Usage unavailable"
                      : `${number.format(row.tokens)} ${mode === "cumulative" && summary.partial ? "recorded " : ""}tokens`}
                  </p>
                  {row.day === today ? (
                    <p className="text-muted-foreground">Today is incomplete</p>
                  ) : null}
                </div>
              ) : null;
            }}
          />
          <Line
            type="linear"
            dataKey="tokens"
            stroke="var(--color-tokens)"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {mode !== "daily" || marked === undefined ? null : (
            <ReferenceLine
              y={marked.tokens ?? 0}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              label={{
                value: annotation,
                position: "insideTopLeft",
                fill: "var(--foreground)",
                fontSize: 12,
              }}
            />
          )}
          {marked === undefined ? null : (
            <ReferenceDot
              x={marked.day}
              y={marked.tokens ?? 0}
              r={3}
              label={
                mode === "cumulative"
                  ? {
                      value: annotation,
                      position: "left",
                      offset: 16,
                      fill: "var(--foreground)",
                      fontSize: 12,
                    }
                  : undefined
              }
              fill="var(--foreground)"
              stroke="var(--background)"
            />
          )}
          {mode === "cumulative" && cumulativePeak !== undefined ? (
            <ReferenceDot
              x={cumulativePeak.day}
              y={cumulativePeak.tokens ?? 0}
              r={4}
              fill="var(--foreground)"
              stroke="var(--background)"
              label={{
                value: peakLabel,
                position:
                  rows.findIndex((row) => row.day === cumulativePeak.day) >
                  rows.length / 2
                    ? "left"
                    : "right",
                offset: 16,
                fill: "var(--foreground)",
                fontSize: 12,
              }}
            />
          ) : null}
        </LineChart>
      </ChartContainer>
      <TokenMonthAxis values={rows} />
      <p className="sr-only">
        {annotation}
        {summary.partial
          ? ". Partial history; gaps indicate unavailable data."
          : ""}
      </p>
    </>
  );
}

export function TokenHistoryChart({
  history,
  today,
}: {
  history: TokenHistory;
  today: string;
}) {
  if (!history.values.some((row) => row.day <= today && row.tokens !== null)) {
    return null;
  }
  return (
    <Tabs defaultValue="cumulative" className="mt-12">
      <SiteSection
        id="token-history"
        title="Token growth"
        className=""
        action={
          <TabsList aria-label="Token history view" variant="line">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
          </TabsList>
        }
      >
        {(["cumulative", "daily"] as const).map((mode) => (
          <TabsContent key={mode} value={mode}>
            <HistoryPlot history={history} today={today} mode={mode} />
          </TabsContent>
        ))}
      </SiteSection>
    </Tabs>
  );
}
