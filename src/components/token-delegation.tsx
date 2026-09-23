"use client";

import { Pie, PieChart } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { sitePreferences } from "@/content/site";
import type { TokenRow } from "@/lib/codex/analytics";

const config = {
  Tasks: { label: "Tasks", color: "var(--chart-1)" },
  Subagents: { label: "Subagents", color: "var(--chart-3)" },
  Other: { label: "Other activity", color: "var(--chart-5)" },
} satisfies ChartConfig;
const percent = new Intl.NumberFormat(sitePreferences.language, {
  style: "percent",
  maximumFractionDigits: 1,
});

export function TokenDelegation({ rows }: { rows: readonly TokenRow[] }) {
  const data = rows.map((row) => ({
    ...row,
    fill: config[row.label as keyof typeof config]?.color ?? "var(--chart-5)",
  }));
  return (
    <div className="grid max-w-md grid-cols-[7rem_minmax(0,1fr)] items-center gap-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <ChartContainer
        config={config}
        className="aspect-square size-28 sm:size-36"
        initialDimension={{ width: 112, height: 112 }}
        aria-hidden="true"
      >
        <PieChart accessibilityLayer={false}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="65%"
            outerRadius="95%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--background)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </PieChart>
      </ChartContainer>
      <dl className="space-y-4 text-base">
        {data.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4"
          >
            <dt className="flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.fill }}
              />
              {row.label}
            </dt>
            <dd className="shrink-0 text-muted-foreground tabular-nums">
              {row.value > 0 && row.value < 0.1
                ? "<0.1%"
                : percent.format(row.value / 100)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
