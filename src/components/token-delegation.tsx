"use client";

import { Pie, PieChart, useChartHeight, useChartWidth } from "recharts";

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

export function delegationLabelPositions(
  data: readonly Pick<TokenRow, "value">[],
  radius: number,
  height: number
) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  let consumed = 0;
  const labels = data.map((row) => {
    const angle =
      ((90 - ((consumed + row.value / 2) / total) * 360) * -Math.PI) / 180;
    consumed += row.value;
    return {
      side: Math.cos(angle) >= 0 ? 1 : -1,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });
  // Three lines of 24px text need 72px between callout centers.
  for (const side of [-1, 1]) {
    const column = labels
      .filter((label) => label.side === side)
      .toSorted((a, b) => a.y - b.y);
    for (let i = column.length - 2; i >= 0; i -= 1) {
      column[i].y = Math.min(column[i].y, column[i + 1].y - 72);
    }
    for (let i = 0; i < column.length; i += 1) {
      column[i].y = Math.max(column[i].y, i === 0 ? 36 : column[i - 1].y + 72);
    }
  }
  return labels;
}

function DelegationSlices({ data }: { data: (TokenRow & { fill: string })[] }) {
  const width = useChartWidth() ?? 320;
  const height = useChartHeight() ?? 288;
  // Leave room for labels: 104px on each side and 64px above and below.
  const radius = Math.max(
    0,
    Math.min(128, (width - 208) / 2, (height - 128) / 2)
  );
  const labels = delegationLabelPositions(data, radius, height);
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
      labelLine={false}
      label={({ cx, cy, midAngle = 0, index }) => {
        const angle = (-midAngle * Math.PI) / 180;
        const direction = Math.cos(angle) >= 0 ? 1 : -1;
        // Keep the entire label outside the ring, including near-vertical slices.
        const x = cx + direction * (radius + 20);
        const { y } = labels[index];
        const row = data[index];
        const words =
          row.label === "Other activity" ? ["Other", "activity"] : [row.label];
        return (
          <g>
            <path
              d={`M${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius} L${x - direction * 8},${y}`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={1}
            />
            <text
              x={x}
              y={y}
              dominantBaseline="central"
              textAnchor={direction === 1 ? "start" : "end"}
              className="fill-foreground text-base"
            >
              {words.map((word, i) => (
                <tspan key={word} x={x} dy={i === 0 ? -words.length * 12 : 24}>
                  {word}
                </tspan>
              ))}
              <tspan
                x={x}
                dy={24}
                className="fill-muted-foreground tabular-nums"
              >
                {row.value > 0 && row.value < 0.1
                  ? "<0.1%"
                  : percent.format(row.value / 100)}
              </tspan>
            </text>
          </g>
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
      className="text-sm mx-auto h-72 w-full aspect-auto sm:h-96"
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
