import Link from "next/link";
import type { ReactNode } from "react";

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
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <dl className={`space-y-4 text-base ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-rows-[1fr_auto]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="flex min-w-0 items-start gap-2">
              {row.icon}
              <span className="min-w-0 wrap-anywhere">{row.label}</span>
            </dt>
            <dd className="shrink-0 tabular-nums text-muted-foreground">
              {number.format(row.value)} {unit}
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
    <div className="mt-12 grid gap-x-4 gap-y-12 md:grid-cols-2 md:gap-y-4">
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
            className="min-w-0 scroll-mt-8 md:row-span-6 md:grid md:grid-rows-subgrid [&>div:first-child]:mb-4 md:[&>div:first-child]:mb-0"
          >
            <Ranking
              rows={data.rows.slice(0, 5).map((row) => ({
                ...row,
                icon: (
                  <CodexToolIcon
                    tool={{
                      ...toolIcons.find(
                        (tool) =>
                          tool.name === row.label &&
                          tool.kind === (id === "skills" ? "skill" : "plugin")
                      ),
                      ...row,
                      name: row.label,
                      kind: id === "skills" ? "skill" : "plugin",
                    }}
                  />
                ),
              }))}
              unit="calls"
              className="md:contents md:space-y-0"
            />
            <Coverage status={data.status} />
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
    [details?.models, details?.plugins, details?.skills].some(
      (section) => (section?.rows.length ?? 0) > 0
    )
  );
}

function BreakdownContent({
  details,
  toolIcons,
  periods,
}: {
  details: TokenDetails;
  toolIcons: PublicCodexStats["insights"]["topTools"];
  periods: ReactNode;
}) {
  const metrics = usageMetrics(details);
  return (
    <>
      {metrics.length > 0 ? (
        <SiteSection
          id="breakdowns"
          title="Usage"
          className="scroll-mt-8"
          description="Text tokens reported for this period. New input is fresh context. Cached input is context reused across requests. Output is generated text. The selected period also applies to models, tools, and skills below."
          action={periods}
        >
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
        <SiteSection id="models" title="Models">
          <Ranking rows={details.models.rows} unit="turns" />
          <Coverage status={details.models.status} />
        </SiteSection>
      ) : null}
      <Tools details={details} toolIcons={toolIcons} />
    </>
  );
}

function Breakdowns({
  details,
  weekDetails,
  toolIcons,
}: {
  toolIcons: PublicCodexStats["insights"]["topTools"];
  details: TokenDetails | null;
  weekDetails: TokenDetails | null;
}) {
  const periods = (
    [
      [7, weekDetails],
      [30, details],
    ] as const
  ).filter(
    (entry): entry is readonly [7 | 30, TokenDetails] =>
      entry[1] !== null && hasBreakdowns(entry[1])
  );
  if (periods.length === 0) {
    return null;
  }
  const controls =
    periods.length > 1 ? (
      <TabsList aria-label="Usage period" variant="line">
        {periods.map(([days]) => (
          <TabsTrigger key={days} value={days}>
            Last {days} days
          </TabsTrigger>
        ))}
      </TabsList>
    ) : (
      <span className="text-sm text-muted-foreground">
        Last {periods[0][0]} days
      </span>
    );
  return (
    <Tabs defaultValue={periods.at(-1)?.[0]} className="mt-12">
      {periods.map(([days, periodDetails]) => (
        <TabsContent key={days} value={days} className="text-base">
          <BreakdownContent
            details={periodDetails}
            toolIcons={toolIcons}
            periods={controls}
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
}: {
  weekDetails?: TokenDetails | null;
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
            toolIcons={stats?.insights.topTools ?? []}
          />
          {stats ? <CodexUsageLimit stats={stats} /> : null}
        </>
      ) : null}
    </>
  );
}
