import type {
  CodexRateLimitWindow,
  PublicCodexMetric,
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
const timestamp = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
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

const LimitWindow = ({
  label,
  window,
}: {
  label: string;
  window: CodexRateLimitWindow;
}) => {
  const used = Math.min(100, window.usedPercent);
  const reset =
    window.resetsAt === null ? null : new Date(window.resetsAt * 1000);
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
      {reset === null ? null : (
        <p className="mt-1 font-mono text-[0.625rem] text-muted-foreground">
          Resets{" "}
          <time dateTime={reset.toISOString()}>{timestamp.format(reset)}</time>{" "}
          UTC
        </p>
      )}
    </div>
  );
};

export function CodexStats({ stats }: { stats: PublicCodexStats }) {
  const peak = Math.max(1, ...stats.dailyUsage.map(({ tokens }) => tokens));

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
          Sanitized usage from {stats.accountCount} personal account
          {stats.accountCount === 1 ? "" : "s"}. Prompts and credentials are
          never stored here.
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
          className="flex h-32 items-end gap-1"
          role="img"
          aria-label="Combined token usage over the last 30 days"
        >
          {stats.dailyUsage.map(({ day: date, tokens }) => (
            <div
              className="flex-1 rounded-t-sm bg-primary/70"
              key={date}
              style={{
                height:
                  tokens === 0
                    ? "0%"
                    : `${String(Math.max(3, (tokens / peak) * 100))}%`,
              }}
              title={`${date}: ${number.format(tokens)} tokens`}
            />
          ))}
        </div>
        <figcaption className="mt-2 flex justify-between font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          <span>30 days ago</span>
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

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-y border-border py-4 text-sm text-muted-foreground">
        <p>
          Busiest day:{" "}
          <strong className="font-medium text-foreground">
            {stats.busiestDay === null
              ? "—"
              : `${day.format(new Date(`${stats.busiestDay.day}T00:00:00.000Z`))} · ${compactNumber.format(stats.busiestDay.tokens)} tokens`}
            {stats.busiestDay?.partial === true ? " · partial" : ""}
          </strong>
        </p>
        <p>
          Longest turn:{" "}
          <strong className="font-medium text-foreground">
            {formatDuration(stats.totals.longestRunningTurnSec.value)}
            {stats.totals.longestRunningTurnSec.partial ? " · partial" : ""}
          </strong>
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {stats.accounts.map(({ id, label, snapshot, stale, updatedAt }) => (
          <article className="rounded-lg border border-border p-5" key={id}>
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-serif text-xl font-bold text-foreground">
                {label}
              </h3>
              <time
                className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground"
                dateTime={updatedAt}
              >
                {stale ? "Stale · " : ""}
                {day.format(new Date(updatedAt))}
              </time>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Current streak</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {formatDays(snapshot.summary.currentStreakDays)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Longest streak</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {formatDays(snapshot.summary.longestStreakDays)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Daily peak</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {snapshot.summary.peakDailyTokens === null
                    ? "—"
                    : compactNumber.format(snapshot.summary.peakDailyTokens)}
                </dd>
              </div>
            </dl>
            {snapshot.availableResetCredits === null ? null : (
              <p className="mt-4 text-sm text-muted-foreground">
                {number.format(snapshot.availableResetCredits)} reset credits
                available
              </p>
            )}
            <div className="mt-6 space-y-5">
              {snapshot.limits.flatMap((limit) =>
                [
                  limit.primary === null ? null : (
                    <LimitWindow
                      key={`${limit.id}-primary`}
                      label={`${limit.name ?? "Primary limit"}${limit.planType === null ? "" : ` · ${limit.planType}`}`}
                      window={limit.primary}
                    />
                  ),
                  limit.secondary === null ? null : (
                    <LimitWindow
                      key={`${limit.id}-secondary`}
                      label={`${limit.name ?? "Limit"}${limit.planType === null ? "" : ` · ${limit.planType}`} · secondary`}
                      window={limit.secondary}
                    />
                  ),
                ].filter((window) => window !== null)
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
