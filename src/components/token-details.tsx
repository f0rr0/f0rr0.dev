import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CodexActivity } from "@/components/codex-activity";
import { CodexHighlights, CodexUsageLimit } from "@/components/codex-stats";
import { CodexToolIcon } from "@/components/codex-tool-icon";
import { SiteSection } from "@/components/site-page";
import { TokenHistoryChart } from "@/components/token-history";
import { TokenStatGrid } from "@/components/token-stat-grid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sitePreferences } from "@/content/site";
import { tokenPreferences } from "@/content/tokens";
import type {
  SourceStatus,
  TokenDetails,
  TokenRow,
} from "@/lib/codex/analytics";
import type { PublicCodexStats } from "@/lib/codex/stats";
import { formatDate } from "@/lib/date";

const number = new Intl.NumberFormat(sitePreferences.language);
const compact = new Intl.NumberFormat(sitePreferences.language, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat(sitePreferences.language, {
  maximumFractionDigits: 1,
});

function Coverage({ status }: { status: SourceStatus }) {
  if (!status.partial && status.available > 0) {
    return null;
  }
  return (
    <p className="mt-4 text-base text-muted-foreground">
      {status.available === 0
        ? "Temporarily unavailable."
        : "Some usage is missing from this breakdown."}
    </p>
  );
}

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="min-w-0 py-2.5">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-light tabular-nums">
        {value === null
          ? "—"
          : `${suffix === "%" ? percent.format(value) : compact.format(value)}${suffix}`}
      </dd>
    </div>
  );
}

function Ranking({
  rows,
  unit,
  className = "",
}: {
  rows: readonly (TokenRow & { icon?: ReactNode })[];
  unit: string;
  className?: string;
}) {
  const maximum =
    unit === "%" ? 100 : Math.max(1, ...rows.map((row) => row.value));
  return (
    <dl className={`space-y-4 text-base ${className}`}>
      {rows.map((row) => (
        <div key={row.name ?? row.label} className="grid grid-rows-[1fr_auto]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="flex min-w-0 items-start gap-2">
              {row.icon}
              <span className="min-w-0 wrap-anywhere">{row.label}</span>
            </dt>
            <dd className="shrink-0 tabular-nums text-muted-foreground">
              {unit === "%"
                ? row.value > 0 && row.value < 0.1
                  ? "<0.1"
                  : percent.format(row.value)
                : number.format(row.value)}
              {unit === "%" ? "%" : ` ${unit}`}
            </dd>
          </div>
          <div aria-hidden="true" className="mt-2 h-1 bg-muted">
            <div
              className="h-full bg-primary/70"
              style={{ width: `${(row.value / maximum) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}

function Tools({
  details,
  toolIcons,
}: {
  details: TokenDetails | null;
  toolIcons: PublicCodexStats["insights"]["topTools"];
}) {
  if (
    ![details?.plugins, details?.skills].some(
      (section) => (section?.rows.length ?? 0) > 0
    )
  ) {
    return null;
  }
  return (
    <div
      className="mt-12 grid gap-x-4 gap-y-12 md:grid-cols-2 md:gap-y-4"
      style={
        { "--ranking-rows": tokenPreferences.rankingLimit + 2 } as CSSProperties
      }
    >
      {(
        [
          ["tools", "Tools", details?.plugins],
          ["skills", "Skills", details?.skills],
        ] as const
      ).map(([id, title, data]) =>
        data && data.rows.length > 0 ? (
          <SiteSection
            key={id}
            id={id}
            title={title}
            description={
              id === "tools"
                ? "Reported plugin invocations, not every shell command or built-in tool call. Counts combine connected accounts."
                : "Reported skill uses, combined by skill name across connected accounts. A use does not establish that a check passed."
            }
            className="min-w-0 scroll-mt-8 md:row-span-[var(--ranking-rows)] md:grid md:grid-rows-subgrid [&>div:first-child]:mb-4 md:[&>div:first-child]:mb-0"
          >
            <Ranking
              rows={data.rows
                .slice(0, tokenPreferences.rankingLimit)
                .map((row) => ({
                  ...row,
                  icon: (
                    <CodexToolIcon
                      tool={{
                        ...toolIcons.find(
                          (tool) =>
                            tool.name === (row.name ?? row.label) &&
                            tool.kind === (id === "skills" ? "skill" : "plugin")
                        ),
                        ...row,
                        name: row.name ?? row.label,
                        kind: id === "skills" ? "skill" : "plugin",
                      }}
                    />
                  ),
                }))}
              unit={id === "skills" ? "uses" : "calls"}
              className="md:contents md:space-y-0"
            />
            <div className="mt-4 text-base text-muted-foreground md:mt-0">
              <p>
                {number.format(data.distinct)}{" "}
                {data.distinct === 1
                  ? title.slice(0, -1).toLowerCase()
                  : title.toLowerCase()}{" "}
                · {number.format(data.total)}{" "}
                {id === "skills" ? "uses" : "calls"}
              </p>
              <Coverage status={data.status} />
            </div>
          </SiteSection>
        ) : null
      )}
    </div>
  );
}

function usageMetrics(details: TokenDetails | null) {
  const activity = details?.activity;
  if (!activity) {
    return [];
  }
  return [
    ...(tokenPreferences.sections.activity
      ? [
          { label: "Text tokens", value: activity.tokens },
          { label: "Turns", value: activity.turns },
        ]
      : []),
    ...(tokenPreferences.sections.composition
      ? [
          {
            label: "Input cache hit rate",
            value: activity.cacheHit,
            suffix: "%",
          },
          ...(activity.composition ?? []),
        ]
      : []),
  ].filter((row) => row.value !== null);
}

function hasBreakdowns(details: TokenDetails | null) {
  return (
    usageMetrics(details).length > 0 ||
    (details?.delegation?.accounts.length ?? 0) > 0 ||
    [details?.models, details?.plugins, details?.skills].some(
      (section) => (section?.rows.length ?? 0) > 0
    )
  );
}

function BreakdownContent({
  details,
  toolIcons,
  periods,
  history = false,
}: {
  details: TokenDetails;
  toolIcons: PublicCodexStats["insights"]["topTools"];
  periods: ReactNode;
  history?: boolean;
}) {
  const metrics = usageMetrics(details);
  const [firstDay] = [
    details.activity?.status.firstDay,
    details.plugins?.status.firstDay,
    details.skills?.status.firstDay,
  ]
    .filter((value): value is string => typeof value === "string")
    .toSorted();
  return (
    <>
      {metrics.length > 0 ? (
        <SiteSection
          id="breakdowns"
          title="Usage"
          className="scroll-mt-8"
          description="Reported text tokens may lag behind the profile totals in the charts. New input is fresh context; cached input reuses context across requests; output is generated text. Cache hit rate measures reused input, not money saved. The selected period applies to every breakdown below."
          action={periods}
        >
          {history && firstDay ? (
            <p className="mb-4 text-base text-muted-foreground">
              Available records since {formatDate(firstDay)}.
            </p>
          ) : null}
          <TokenStatGrid className="md:grid-cols-3">
            {metrics.map((row) => (
              <Metric key={row.label} {...row} />
            ))}
          </TokenStatGrid>
          {details.activity ? (
            <Coverage status={details.activity.status} />
          ) : null}
        </SiteSection>
      ) : (
        <div className="flex justify-end">{periods}</div>
      )}
      {details.models && details.models.rows.length > 0 ? (
        <SiteSection
          id="models"
          title="Models"
          description="Reported AI turns, including background activity—not tokens, cost, or only messages typed by a person. Counts combine connected accounts."
        >
          <Ranking rows={details.models.rows} unit="turns" />
          <Coverage status={details.models.status} />
        </SiteSection>
      ) : null}
      {details.delegation && details.delegation.accounts.length > 0 ? (
        <SiteSection
          id="delegation"
          title="Tasks and subagents"
          description="Share of reported usage within each account, not token shares or task counts. Allowances differ, so accounts are shown separately. Other activity includes background features; unattributed usage stays visible."
        >
          <div className="grid gap-x-4 gap-y-8 md:grid-cols-2">
            {details.delegation.accounts.map((account, index) => (
              <div key={index} className="min-w-0">
                {details.accountCount > 1 ? (
                  <p className="mb-4 text-base text-muted-foreground">
                    {account.label}
                  </p>
                ) : null}
                <Ranking rows={account.rows} unit="%" />
              </div>
            ))}
          </div>
          <Coverage status={details.delegation.status} />
        </SiteSection>
      ) : null}
      <Tools details={details} toolIcons={toolIcons} />
    </>
  );
}

function Breakdowns({
  details,
  weekDetails,
  historyDetails,
  toolIcons,
}: {
  toolIcons: PublicCodexStats["insights"]["topTools"];
  details: TokenDetails | null;
  weekDetails: TokenDetails | null;
  historyDetails: TokenDetails | null;
}) {
  const periods = (
    [
      [7, weekDetails, "Last 7 days"],
      [30, details, "Last 30 days"],
      ["history", historyDetails, "History"],
    ] as readonly (readonly [7 | 30 | "history", TokenDetails | null, string])[]
  ).filter(
    (entry): entry is readonly [7 | 30 | "history", TokenDetails, string] =>
      entry[1] !== null && hasBreakdowns(entry[1])
  );
  if (periods.length === 0) {
    return null;
  }
  const controls =
    periods.length > 1 ? (
      <TabsList aria-label="Usage period" variant="line">
        {periods.map(([days, , label]) => (
          <TabsTrigger key={days} value={days}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    ) : (
      <span className="text-sm text-muted-foreground">{periods[0][2]}</span>
    );
  return (
    <Tabs
      defaultValue={
        periods.some(([value]) => value === 30) ? 30 : periods[0][0]
      }
      className="mt-12"
    >
      {periods.map(([days, periodDetails]) => (
        <TabsContent key={days} value={days} className="text-base">
          <BreakdownContent
            details={periodDetails}
            toolIcons={toolIcons}
            periods={controls}
            history={days === "history"}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function TokenUsageDetails({
  stats,
  details,
  weekDetails = null,
  historyDetails = null,
}: {
  weekDetails?: TokenDetails | null;
  historyDetails?: TokenDetails | null;
  stats: PublicCodexStats | null;
  details: TokenDetails | null;
}) {
  const hasData = stats !== null || (details?.accountCount ?? 0) > 0;
  return (
    <>
      <h1 className="sr-only">{tokenPreferences.title}</h1>
      <p>
        {tokenPreferences.introduction} This is a record of usage, not a measure
        of productivity.{" "}
        {tokenPreferences.workLink ? (
          <Link
            href={tokenPreferences.workLink.href}
            prefetch={false}
            className="underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            {tokenPreferences.workLink.label}
          </Link>
        ) : null}
      </p>
      {!hasData && (
        <p className="mt-12 text-muted-foreground">
          Usage is temporarily unavailable. Please check back later.
        </p>
      )}
      {hasData ? (
        <>
          {stats && tokenPreferences.sections.activity ? (
            <>
              <section
                className="mt-12 grid gap-6 empty:hidden"
                aria-label="Activity and workflow"
              >
                <CodexActivity {...stats.activity} />
                <CodexHighlights stats={stats} />
              </section>
              <TokenHistoryChart
                history={stats.history}
                today={stats.reportingDay}
              />
            </>
          ) : null}
          <Breakdowns
            details={details}
            weekDetails={weekDetails}
            historyDetails={historyDetails}
            toolIcons={stats?.insights.topTools ?? []}
          />
          {stats && tokenPreferences.sections.limits ? (
            <CodexUsageLimit stats={stats} />
          ) : null}
        </>
      ) : null}
    </>
  );
}
