import { Info, Plug } from "lucide-react";
import Image from "next/image";

import { CodexActivity } from "@/components/codex-activity";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  year: "numeric",
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

const GitHubMark = () => (
  <svg
    aria-hidden="true"
    className="size-3.5"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M12 1.95068C17.525 1.95068 22 6.42568 22 11.9507C21.9995 14.0459 21.3419 16.0883 20.1198 17.7902C18.8977 19.4922 17.1727 20.768 15.1875 21.4382C14.6875 21.5382 14.5 21.2257 14.5 20.9632C14.5 20.6257 14.5125 19.5507 14.5125 18.2132C14.5125 17.2757 14.2 16.6757 13.8375 16.3632C16.0625 16.1132 18.4 15.2632 18.4 11.4257C18.4 10.3257 18.0125 9.43818 17.375 8.73818C17.475 8.48818 17.825 7.46318 17.275 6.08818C17.275 6.08818 16.4375 5.81318 14.525 7.11318C13.725 6.88818 12.875 6.77568 12.025 6.77568C11.175 6.77568 10.325 6.88818 9.525 7.11318C7.6125 5.82568 6.775 6.08818 6.775 6.08818C6.225 7.46318 6.575 8.48818 6.675 8.73818C6.0375 9.43818 5.65 10.3382 5.65 11.4257C5.65 15.2507 7.975 16.1132 10.2 16.3632C9.9125 16.6132 9.65 17.0507 9.5625 17.7007C8.9875 17.9632 7.55 18.3882 6.65 16.8757C6.4625 16.5757 5.9 15.8382 5.1125 15.8507C4.275 15.8632 4.775 16.3257 5.125 16.5132C5.55 16.7507 6.0375 17.6382 6.15 17.9257C6.35 18.4882 7 19.5632 9.5125 19.1007C9.5125 19.9382 9.525 20.7257 9.525 20.9632C9.525 21.2257 9.3375 21.5257 8.8375 21.4382C6.8458 20.7752 5.11342 19.502 3.88611 17.799C2.65881 16.096 1.9989 14.0498 2 11.9507C2 6.42568 6.475 1.95068 12 1.95068Z" />
  </svg>
);

const SkillMark = () => (
  <svg aria-hidden="true" className="size-3.5" viewBox="0 0 24 24">
    <path
      className="fill-[#FFD400] dark:fill-[#F7D57C]"
      d="M10.5605 11.1335V23.072C10.5489 23.0717 10.5371 23.0724 10.5254 23.072C10.0588 23.0636 9.62892 22.9264 9.2373 22.6599L5.0625 19.8093C4.72937 19.576 4.467 19.284 4.27539 18.9343C4.09219 18.5844 4.00007 18.209 4 17.8093V7.95966C4.00001 7.58534 4.08077 7.23416 4.24219 6.90692L10.5605 11.1335Z"
    />
    <path
      className="fill-[#F75858] dark:fill-[#FF8082]"
      d="M19.7246 5.44696C19.9079 5.78029 20 6.13882 20 6.52216V16.3845C20 16.7927 19.8957 17.18 19.6875 17.5466C19.4875 17.9132 19.2079 18.2049 18.8496 18.4216L11.8496 22.7214C11.4515 22.9651 11.022 23.0817 10.5605 23.072V11.1208L19.7041 5.40985C19.7109 5.42223 19.718 5.43443 19.7246 5.44696Z"
    />
    <path
      className="fill-[#8166E1] dark:fill-[#9279D8]"
      d="M20 16.3845C20 16.7927 19.8957 17.18 19.6875 17.5466C19.4875 17.9132 19.2079 18.2049 18.8496 18.4216L11.8496 22.7214C11.4515 22.9651 11.022 23.0817 10.5605 23.072V17.322L19.7041 11.611C19.7135 11.6215 20 11.4372 20 11.4372V16.3845Z"
    />
    <path
      className="fill-[#BDAAFF] dark:fill-[#C1ACFF]"
      d="M10.5605 17.3347V23.072C10.5489 23.0717 10.5371 23.0724 10.5254 23.072C10.0588 23.0636 9.62892 22.9264 9.2373 22.6599L5.0625 19.8093C4.72937 19.576 4.467 19.284 4.27539 18.9343C4.09219 18.5844 4.00007 18.209 4 17.8093V12.9684L10.5605 17.3347Z"
    />
    <path
      className="fill-[#FFA43D] dark:fill-[#FBC484]"
      d="M4.24219 6.90659C4.26041 6.86966 4.27952 6.83258 4.2998 6.79624C4.49979 6.42971 4.77945 6.13785 5.1377 5.92124L12.0996 1.64683C12.4996 1.39683 12.9337 1.27619 13.4004 1.28452C13.8669 1.2846 14.296 1.4174 14.6875 1.68394L18.9746 4.60874C19.2872 4.82514 19.5293 5.09292 19.7031 5.40952L10.5605 11.1205V11.1332L4.24219 6.90659Z"
    />
  </svg>
);

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
      label: "Current streak",
      metric: stats.highlights.currentStreakDays,
      tooltip: null,
      value: formatDays(stats.highlights.currentStreakDays.value),
    },
    {
      label: "Longest streak",
      metric: stats.highlights.longestStreakDays,
      tooltip: null,
      value: formatDays(stats.highlights.longestStreakDays.value),
    },
    {
      label: "Daily peak",
      metric: stats.highlights.peakDailyTokens,
      tooltip: null,
      value:
        stats.highlights.peakDailyTokens.value === null
          ? "—"
          : compactNumber.format(stats.highlights.peakDailyTokens.value),
    },
    {
      label: "Fast mode",
      metric: stats.insights.fastModeUsagePercent,
      tooltip: "Range across multiple agents.",
      value: formatRange(
        stats.insights.fastModeUsagePercent,
        (value) => `${value.toFixed(1)}%`
      ),
    },
    {
      label: "Skills explored",
      metric: stats.insights.skillsExplored,
      tooltip: "Range across multiple agents.",
      value: formatRange(stats.insights.skillsExplored, (value) =>
        number.format(value)
      ),
    },
    {
      label: "Reasoning leaders",
      metric: {
        partial:
          stats.insights.reasoningEfforts.partial ||
          stats.insights.reasoningEffortPercent.partial,
      },
      tooltip:
        reasoningShare === "—"
          ? "Leaders across multiple agents."
          : `Each agent's leading level represents ${reasoningShare} of its usage.`,
      value:
        reasoningLeaders === "—" || reasoningShare === "—"
          ? reasoningLeaders
          : `${reasoningLeaders} · ${reasoningShare}`,
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
              : `${day.format(new Date(`${stats.busiestDay.day}T00:00:00.000Z`))} · ${compactNumber.format(stats.busiestDay.tokens)}`}
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

      <TooltipProvider delay={100}>
        <article className="mt-8 rounded-lg border border-border p-5">
          <h3 className="font-serif text-xl font-bold text-foreground">
            Activity highlights
          </h3>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            {highlights.map(({ label, metric, tooltip, value }) => (
              <div key={label}>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  {label}
                  {tooltip === null ? null : (
                    <Tooltip>
                      <TooltipTrigger
                        aria-label={`${label}: ${tooltip}`}
                        className="inline-flex size-4 items-center justify-center rounded-sm"
                        type="button"
                      >
                        <Info aria-hidden="true" className="size-3" />
                      </TooltipTrigger>
                      <TooltipContent>{tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </dt>
                <dd className="mt-1 font-mono text-foreground">
                  {value}
                  {metric.partial ? " · partial" : ""}
                </dd>
              </div>
            ))}
          </dl>
          {stats.insights.topTools.length === 0 ? null : (
            <div className="mt-6 border-t border-border pt-5">
              <h4 className="font-ui text-sm font-medium text-foreground">
                Top tools
              </h4>
              <ol className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                {stats.insights.topTools.map((tool) => (
                  <li
                    className="flex min-w-0 items-center justify-between gap-3"
                    key={`${tool.kind}:${tool.name}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
                        {tool.logoUrl === undefined ? null : (
                          <Image
                            alt=""
                            className={
                              tool.logoUrlDark === undefined
                                ? "size-3.5 object-contain"
                                : "size-3.5 object-contain dark:hidden"
                            }
                            height={14}
                            src={tool.logoUrl}
                            width={14}
                          />
                        )}
                        {tool.logoUrlDark === undefined ? null : (
                          <Image
                            alt=""
                            className="hidden size-3.5 object-contain dark:block"
                            height={14}
                            src={tool.logoUrlDark}
                            width={14}
                          />
                        )}
                        {tool.logoUrl === undefined ? (
                          tool.kind === "skill" ? (
                            <SkillMark />
                          ) : tool.name === "github" ? (
                            <GitHubMark />
                          ) : (
                            <Plug aria-hidden="true" className="size-3.5" />
                          )
                        ) : null}
                      </span>
                      <span className="truncate font-mono text-foreground">
                        {tool.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {number.format(tool.usageCount)} runs
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {stats.primaryLimit === null ? null : (
            <div className="mt-6 border-t border-border pt-5">
              <LimitBar
                label="Primary limit"
                usedPercent={stats.primaryLimit.usedPercent}
              />
            </div>
          )}
        </article>
      </TooltipProvider>
    </section>
  );
}
