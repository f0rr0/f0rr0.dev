import type { PublicCodexMetric, PublicCodexStats } from "@/lib/codex/stats";

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
  const peak = Math.max(1, ...stats.dailyUsage.map(({ tokens }) => tokens));
  const leadingDays = new Date(
    `${stats.dailyUsage[0]?.day ?? "1970-01-04"}T00:00:00.000Z`
  ).getUTCDay();
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
  ];

  return (
    <section aria-labelledby="codex-stats-title" className="home-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-xs uppercase tracking-[0.14em] text-primary">
            Building with AI
          </p>
          <h2
            className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            id="codex-stats-title"
          >
            Codex, in numbers
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Sanitized usage across personal ChatGPT accounts. Prompts and
          credentials are never stored here.
        </p>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        <Metric label="Lifetime tokens" metric={stats.totals.lifetimeTokens} />
        <Metric label="Today" metric={stats.totals.todayTokens} />
        <Metric label="Last 7 days" metric={stats.totals.last7Days} />
        <Metric label="Last 30 days" metric={stats.totals.last30Days} />
      </dl>

      <figure className="mt-10">
        <div
          className="grid grid-flow-col grid-rows-7 auto-cols-fr gap-0.5 sm:gap-1"
          role="img"
          aria-label="Combined daily token activity over the last year"
        >
          {Array.from({ length: leadingDays }, (_, index) => (
            <span aria-hidden="true" key={`leading-${String(index)}`} />
          ))}
          {stats.dailyUsage.map(({ day: date, tokens }) => {
            const ratio = tokens / peak;
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
            return (
              <span
                aria-hidden="true"
                className={`aspect-square min-w-0 rounded-[0.2rem] ${color}`}
                key={date}
                title={`${date}: ${number.format(tokens)} tokens`}
              />
            );
          })}
        </div>
        <figcaption className="mt-2 flex justify-between font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          <span>1 year ago</span>
          <span>Today</span>
        </figcaption>
        <ol className="sr-only">
          {stats.dailyUsage.map(({ day: date, tokens }) => (
            <li key={date}>
              {day.format(new Date(`${date}T00:00:00.000Z`))}:{" "}
              {number.format(tokens)} tokens
            </li>
          ))}
        </ol>
      </figure>

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
        <div>
          <h3 className="font-serif text-xl font-bold text-foreground">
            Unified activity
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Highest observed values and pooled primary limit across connected
            accounts.
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
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
              label={`Primary limit${stats.primaryLimit.planType === null ? "" : ` · ${stats.primaryLimit.planType}`}`}
              usedPercent={stats.primaryLimit.usedPercent}
            />
          </div>
        )}
      </article>
    </section>
  );
}
