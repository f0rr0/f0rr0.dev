import { CodexActivity } from "@/components/codex-activity";
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
const day = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
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
  label: string;
  metric: PublicCodexMetric;
}) => (
  <div className="border-t border-border pt-3">
    <dt className="font-ui text-xs uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </dt>
    <dd className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground">
      {metric.value === null ? "—" : compactNumber.format(metric.value)}
      {metric.partial ? (
        <span className="ml-2 font-ui text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          partial
        </span>
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
      <div className="flex items-baseline justify-between gap-3 font-ui text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(100 - used)}% left</span>
      </div>
      <div
        aria-label={`${label}: ${String(Math.round(used))}% used`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(used)}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${String(used)}%` }}
        />
      </div>
    </div>
  );
};

export function CodexStats({ stats }: { stats: PublicCodexStats }) {
  const highlights = [
    {
      label: "Current streak",
      metric: stats.highlights.currentStreakDays,
      value: formatDays(stats.highlights.currentStreakDays.value),
    },
    {
      label: "Longest streak",
      metric: stats.highlights.longestStreakDays,
      value: formatDays(stats.highlights.longestStreakDays.value),
    },
    {
      label: "Daily peak",
      metric: stats.highlights.peakDailyTokens,
      value:
        stats.highlights.peakDailyTokens.value === null
          ? "—"
          : compactNumber.format(stats.highlights.peakDailyTokens.value),
    },
    {
      label: "Fast mode",
      metric: stats.insights.fastModeUsagePercent,
      value: formatRange(
        stats.insights.fastModeUsagePercent,
        (value) => `${value.toFixed(1)}%`
      ),
    },
    {
      label: "Skills explored",
      metric: stats.insights.skillsExplored,
      value: formatRange(stats.insights.skillsExplored, (value) =>
        number.format(value)
      ),
    },
    {
      label: "Reasoning leaders",
      metric: stats.insights.reasoningEfforts,
      value:
        stats.insights.reasoningEfforts.values.length === 0
          ? "—"
          : stats.insights.reasoningEfforts.values
              .map(reasoningLabel)
              .join(" · "),
    },
  ];

  return (
    <section aria-labelledby="codex-stats-title" className="home-section">
      <h2
        className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        id="codex-stats-title"
      >
        AI, in numbers
      </h2>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Metric label="Lifetime tokens" metric={stats.totals.lifetimeTokens} />
        <Metric label="Today" metric={stats.totals.todayTokens} />
        <Metric label="Last 7 days" metric={stats.totals.last7Days} />
        <Metric label="Last 30 days" metric={stats.totals.last30Days} />
      </dl>

      <CodexActivity {...stats.activity} />

      <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-border py-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Busiest day</dt>
          <dd className="mt-1 font-mono text-foreground">
            {stats.busiestDay === null
              ? "—"
              : `${day.format(new Date(`${stats.busiestDay.day}T00:00:00.000Z`))} · ${compactNumber.format(stats.busiestDay.tokens)} tokens`}
            {stats.busiestDay?.partial === true ? " · partial" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Longest chat</dt>
          <dd className="mt-1 font-mono text-foreground">
            {formatDuration(stats.totals.longestRunningTurnSec.value)}
            {stats.totals.longestRunningTurnSec.partial ? " · partial" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total chats</dt>
          <dd className="mt-1 font-mono text-foreground">
            {stats.totals.totalThreads.value === null
              ? "—"
              : number.format(stats.totals.totalThreads.value)}
            {stats.totals.totalThreads.partial ? " · partial" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total skills used</dt>
          <dd className="mt-1 font-mono text-foreground">
            {stats.totals.totalSkillsUsed.value === null
              ? "—"
              : number.format(stats.totals.totalSkillsUsed.value)}
            {stats.totals.totalSkillsUsed.partial ? " · partial" : ""}
          </dd>
        </div>
      </dl>

      <article className="mt-8 rounded-lg border border-border p-5">
        <h3 className="font-serif text-xl font-bold text-foreground">
          Activity highlights
        </h3>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {highlights.map(({ label, metric, value }) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-foreground">
                {value}
                {metric.partial ? " · partial" : ""}
              </dd>
            </div>
          ))}
        </dl>
        {stats.primaryLimit === null ? null : (
          <div className="mt-6 border-t border-border pt-5">
            <LimitBar
              label="Primary limit"
              usedPercent={stats.primaryLimit.usedPercent}
            />
          </div>
        )}
      </article>
    </section>
  );
}
