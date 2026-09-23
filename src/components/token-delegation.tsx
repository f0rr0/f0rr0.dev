"use client";

import { Pie, PieChart, useChartWidth } from "recharts";

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

function DelegationSlices({ data }: { data: (TokenRow & { fill: string })[] }) {
  const width = useChartWidth() ?? 320;
  // Reserve 80px per side for the connector and the longest label.
  const radius = Math.max(0, Math.min(160, (width - 160) / 2));
  return (
    <Pie
      data={data}
      dataKey="value"
      nameKey="label"
      innerRadius={(radius * 2) / 3}
      outerRadius={radius}
      startAngle={90}
      endAngle={-270}
      stroke="var(--background)"
      strokeWidth={2}
      isAnimationActive={false}
      labelLine={({ points }: { points: { x: number; y: number }[] }) => {
        const [start, end] = points;
        const direction = end.x >= start.x ? 1 : -1;
        return (
          <path
            d={`M${start.x},${start.y} L${end.x - direction * 8},${end.y}`}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
        );
      }}
      label={({ x, y, textAnchor, index }) => {
        const row = data[index];
        const words =
          row.label === "Other activity" ? ["Other", "activity"] : [row.label];
        return (
          <text
            x={x}
            y={y}
            dominantBaseline="central"
            textAnchor={textAnchor}
            className="fill-foreground text-xs"
          >
            {words.map((word, i) => (
              <tspan key={word} x={x} dy={i === 0 ? -words.length * 8 : 16}>
                {word}
              </tspan>
            ))}
            <tspan x={x} dy={16} className="fill-muted-foreground tabular-nums">
              {row.value > 0 && row.value < 0.1
                ? "<0.1%"
                : percent.format(row.value / 100)}
            </tspan>
          </text>
        );
      }}
    />
  );
}

export function TokenDelegation({ rows }: { rows: readonly TokenRow[] }) {
  const data = rows.map((row) => ({
    ...row,
    fill: config[row.label as keyof typeof config]?.color ?? "var(--chart-5)",
  }));
  return (
    <ChartContainer
      config={config}
      className="mx-auto h-72 w-full aspect-auto sm:h-96"
      initialDimension={{ width: 320, height: 288 }}
      role="img"
      aria-label={data
        .map((row) => `${row.label}: ${percent.format(row.value / 100)}`)
        .join(", ")}
    >
      <PieChart accessibilityLayer={false}>
        <DelegationSlices data={data} />
      </PieChart>
    </ChartContainer>
  );
}
