import Link from "next/link";

import { CodexActivity } from "@/components/codex-activity";
import { CodexHighlights } from "@/components/codex-stats";
import { SiteSection } from "@/components/site-page";
import { TokenHistoryChart } from "@/components/token-history";
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
  rows: readonly TokenRow[];
  unit: string;
  className?: string;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <dl className={`space-y-4 text-base ${className}`}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-rows-[1fr_auto]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 wrap-anywhere">{row.label}</dt>
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

function Tools({ details }: { details: TokenDetails | null }) {
  if (!details || (!details.plugins && !details.skills)) {
    return null;
  }
  return (
    <div className="mt-12 grid gap-x-4 gap-y-12 md:grid-cols-2 md:gap-y-4">
      {(
        [
          ["tools", "Tools", details.plugins],
          ["skills", "Skills", details.skills],
        ] as const
      ).map(([id, title, data]) =>
        data ? (
          <SiteSection
            key={id}
            id={id}
            title={title}
            className="min-w-0 scroll-mt-8 md:row-span-6 md:grid md:grid-rows-subgrid [&>div:first-child]:mb-4 md:[&>div:first-child]:mb-0"
          >
            <Ranking
              rows={data.rows.slice(0, 5)}
              unit="calls"
              className="md:contents md:space-y-0"
            />
            {data.rows.length === 0 && data.status.available > 0 ? (
              <p className="text-base text-muted-foreground">
                No calls reported.
              </p>
            ) : null}
            <Coverage status={data.status} />
          </SiteSection>
        ) : null
      )}
    </div>
  );
}

function Breakdowns({
  details,
  days,
}: {
  details: TokenDetails | null;
  days: 7 | 30;
}) {
  const { activity, models, plugins, skills } = details ?? {};
  if (![activity, models, plugins, skills].some(Boolean)) {
    return null;
  }
  return (
    <Tabs value={days} className="mt-12">
      <SiteSection
        className="scroll-mt-8"
        id="breakdowns"
        title="Usage"
        description="Text tokens reported for this period. New input is fresh context. Cached input is context reused across requests. Output is generated text. The selected period also applies to models, tools, and skills below."
        action={
          <TabsList aria-label="Usage period" variant="line">
            {([7, 30] as const).map((period) => (
              <TabsTrigger
                key={period}
                value={period}
                nativeButton={false}
                render={
                  <a
                    href={`/tokens?days=${period}#breakdowns`}
                    aria-label={`Last ${period} days`}
                  />
                }
              >
                Last {period} days
              </TabsTrigger>
            ))}
          </TabsList>
        }
      >
        <TabsContent value={days} className="text-base">
          <dl className="token-stat-grid md:grid-cols-3!">
            {tokenPreferences.sections.activity ? (
              <>
                <Metric label="Text tokens" value={activity?.tokens ?? null} />
                <Metric label="Turns" value={activity?.turns ?? null} />
              </>
            ) : null}
            {tokenPreferences.sections.composition ? (
              <>
                <Metric
                  label="Input cache hit rate"
                  value={activity?.cacheHit ?? null}
                  suffix="%"
                />
                {(activity?.composition ?? []).map((row) => (
                  <Metric key={row.label} label={row.label} value={row.value} />
                ))}
              </>
            ) : null}
          </dl>
          {activity ? <Coverage status={activity.status} /> : null}
          {details?.models ? (
            <SiteSection id="models" title="Models">
              <Ranking rows={details.models.rows} unit="turns" />
              {details.models.rows.length === 0 &&
              details.models.status.available > 0 ? (
                <p className="text-base text-muted-foreground">
                  No turns reported for this period.
                </p>
              ) : null}
              <Coverage status={details.models.status} />
            </SiteSection>
          ) : null}
          <Tools details={details} />
        </TabsContent>
      </SiteSection>
    </Tabs>
  );
}

export function TokenUsageDetails({
  stats,
  details,
  days = 30,
}: {
  days?: 7 | 30;
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
                className="mt-12 grid gap-6"
                aria-label="Activity and workflow"
              >
                <CodexActivity {...stats.activity} />
                <CodexHighlights stats={stats} compact />
              </section>
              <TokenHistoryChart
                history={stats.history}
                today={stats.reportingDay}
              />
            </>
          ) : null}
          <Breakdowns details={details} days={days} />
        </>
      ) : null}
    </>
  );
}
