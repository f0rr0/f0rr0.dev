import type { ReactNode } from "react";

import { CodexActivity } from "@/components/codex-activity";
import { DateTime } from "@/components/date-time";
import { InfoLabel } from "@/components/info-label";
import { SiteSection } from "@/components/site-page";
import { TokenStatGrid } from "@/components/token-stat-grid";
import { siteNavigation } from "@/content/site";
import { tokenPreferences } from "@/content/tokens";
import type {
  PublicCodexMetric,
  PublicCodexRange,
  PublicCodexStats,
} from "@/lib/codex/stats";

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const number = new Intl.NumberFormat("en-US");
const formatDuration = (seconds: number | null) => {
  if (seconds === null) {
    return "—";
  }
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${String(minutes)}m`
    : `${String(Math.floor(minutes / 60))}h ${String(minutes % 60)}m`;
};

const formatDays = (days: number | null) =>
  days === null ? "—" : `${number.format(days)} days`;
const formatRange = (
  range: PublicCodexRange,
  format: (value: number) => string
) => {
  if (range.minimum === null) {
    return "—";
  }
  if (range.maximum === null) {
    return `≥${format(range.minimum)}`;
  }
  return range.minimum === range.maximum
    ? format(range.minimum)
    : `${format(range.minimum)}–${format(range.maximum)}`;
};
const reasoningLabel = (value: string) =>
  value === "xhigh"
    ? "Extra high"
    : `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;

const Metric = ({
  label,
  metric,
}: {
  label: ReactNode;
  metric: PublicCodexMetric;
}) =>
  metric.value === null ? null : (
    <div className="py-2.5">
      <dt className="text-muted-foreground text-base">{label}</dt>
      <dd className="text-foreground mt-1 text-base font-normal tabular-nums">
        {metric.value === null ? "—" : compactNumber.format(metric.value)}
        {metric.partial ? (
          <span className="text-muted-foreground ml-2 text-base">partial</span>
        ) : null}
      </dd>
    </div>
  );

const LimitBar = ({
  label,
  usedPercent,
}: {
  label: string;
  usedPercent: number;
}) => {
  const used = Math.min(100, usedPercent);
  return (
    <div>
      <div className="text-muted-foreground flex items-baseline justify-between gap-4 text-base">
        <span className="min-w-0 wrap-anywhere">{label}</span>
        <span className="shrink-0">{Math.round(100 - used)}% left</span>
      </div>
      <div
        aria-label={`${label}: ${String(Math.round(used))}% used`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(used)}
        className="bg-muted mt-2 h-1 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${String(used)}%` }}
        />
      </div>
    </div>
  );
};

export const CodexTotals = ({ stats }: { stats: PublicCodexStats }) => (
  <TokenStatGrid>
    <Metric label="Lifetime tokens" metric={stats.totals.lifetimeTokens} />
    <Metric label="Today" metric={stats.totals.todayTokens} />
    <Metric label="Last 7 days" metric={stats.totals.last7Days} />
    <Metric label="Last 30 days" metric={stats.totals.last30Days} />
  </TokenStatGrid>
);

export const CodexHighlights = ({ stats }: { stats: PublicCodexStats }) => {
  const reasoningLeaders =
    stats.insights.reasoningEfforts.values.length === 0
      ? "—"
      : stats.insights.reasoningEfforts.values.map(reasoningLabel).join(" · ");
  const reasoningShare = formatRange(
    stats.insights.reasoningEffortPercent,
    (value) => `${value.toFixed(1)}%`
  );
  const highlights = [
    {
      label: "Total chats",
      metric: stats.totals.totalThreads,
      tooltip: null,
      value:
        stats.totals.totalThreads.value === null
          ? "—"
          : number.format(stats.totals.totalThreads.value),
    },
    {
      label: "Longest turn",
      metric: stats.totals.longestRunningTurnSec,
      tooltip: "Longest response to one request, including tools and waiting.",
      value: formatDuration(stats.totals.longestRunningTurnSec.value),
    },
    {
      label: "Skill uses",
      metric: stats.totals.totalSkillsUsed,
      tooltip: null,
      value:
        stats.totals.totalSkillsUsed.value === null
          ? "—"
          : number.format(stats.totals.totalSkillsUsed.value),
    },
    {
      label: "Skills explored",
      metric: stats.insights.skillsExplored,
      tooltip:
        "Distinct skills used; the range allows for overlap between accounts.",
      value: formatRange(stats.insights.skillsExplored, (value) =>
        number.format(value)
      ),
    },
    {
      label: "Current streak",
      tooltip: null,
      value: formatDays(stats.highlights.currentStreakDays.value),
    },
    {
      label: "Longest streak",
      tooltip: null,
      value: formatDays(stats.highlights.longestStreakDays.value),
    },
    {
      label: "Reasoning",
      metric: {
        partial:
          stats.insights.reasoningEfforts.partial ||
          stats.insights.reasoningEffortPercent.partial,
      },
      tooltip:
        "Most-used thinking levels and their share of each account’s usage.",
      value:
        reasoningLeaders === "—" || reasoningShare === "—"
          ? reasoningLeaders
          : `${reasoningLeaders} · ${reasoningShare}`,
    },
    {
      label: "Fast mode",
      metric: stats.insights.fastModeUsagePercent,
      tooltip: "Share of usage in fast mode, ranging across accounts.",
      value: formatRange(
        stats.insights.fastModeUsagePercent,
        (value) => `${value.toFixed(1)}%`
      ),
    },
  ].filter((item) => item.value !== "—");
  if (highlights.length === 0) {
    return null;
  }

  return (
    <TokenStatGrid>
      {highlights.map(({ label, metric, tooltip, value }) => (
        <div className="py-2.5" key={label}>
          <dt className="text-muted-foreground">
            {tooltip === null ? (
              label
            ) : (
              <InfoLabel label={label} description={tooltip} />
            )}
          </dt>
          <dd className="text-foreground mt-1 text-base font-normal tabular-nums">
            {value}
            {metric?.partial === true ? " · partial" : ""}
          </dd>
        </div>
      ))}
    </TokenStatGrid>
  );
};

export const CodexStats = ({ stats }: { stats: PublicCodexStats }) => {
  if (
    Object.values(stats.totals).every((metric) => metric.value === null) &&
    stats.history.values.every((row) => row.tokens === null)
  ) {
    return null;
  }
  return (
    <SiteSection
      id="token-log"
      title={tokenPreferences.title}
      href={siteNavigation.tokens.path}
      linkLabel="All token usage"
    >
      <CodexTotals stats={stats} />

      <div className="mt-6 empty:hidden">
        <CodexActivity {...stats.activity} />
      </div>
    </SiteSection>
  );
};

export const CodexUsageLimit = ({ stats }: { stats: PublicCodexStats }) => {
  if (stats.limits.length === 0) {
    return null;
  }
  return (
    <SiteSection id="usage-limit" title="Usage limits">
      <div className="space-y-6">
        {stats.limits.map((limit, index) => {
          const window =
            limit.windowDurationMins === 10_080
              ? "Weekly"
              : limit.windowDurationMins === null
                ? "Current window"
                : `${number.format(limit.windowDurationMins / 60)}-hour window`;
          return (
            <div key={index}>
              <LimitBar
                label={limit.label ? `${limit.label} · ${window}` : window}
                usedPercent={limit.usedPercent}
              />
              {limit.resetAt === null ? null : (
                <p className="text-muted-foreground mt-2 text-base">
                  Resets{" "}
                  <DateTime
                    dateTime={new Date(limit.resetAt * 1000).toISOString()}
                  />
                </p>
              )}
            </div>
          );
        })}
      </div>
    </SiteSection>
  );
};
