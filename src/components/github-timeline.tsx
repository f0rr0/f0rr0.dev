import { ArrowUpRight, LockKeyhole } from "lucide-react";

import { formatDate } from "@/lib/date";
import type {
  GitHubActivity,
  GitHubActivityWeek,
} from "@/lib/github-profile-core";
import { siteConfig } from "@/lib/site";
import type {
  TimelineEdition,
  TimelineEditionEntry,
} from "@/lib/timeline-core";

const numberFormatter = new Intl.NumberFormat("en-US");
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const monthOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const WEEK_IN_MILLISECONDS = 7 * 86_400_000;

const asUtcDate = (date: string) => new Date(`${date}T00:00:00Z`);

const formatTimelineRange = (start: string, end: string) => {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return monthFormatter.format(asUtcDate(end));
  }

  const startDate = asUtcDate(start);
  const endDate = asUtcDate(end);
  if (startDate.getUTCFullYear() === endDate.getUTCFullYear()) {
    return `${monthOnlyFormatter.format(startDate)}—${monthFormatter.format(
      endDate
    )}`;
  }
  return `${monthFormatter.format(startDate)}—${monthFormatter.format(endDate)}`;
};

const isCompact = (entry: TimelineEditionEntry) =>
  entry.kind !== "activity" &&
  (entry.importance === "brief" || entry.importance === "pulse");

const isRenderable = (entry: TimelineEditionEntry) =>
  entry.kind !== "activity" || entry.cadence !== "isolated";

const activityWeekStats = (weeks: readonly GitHubActivityWeek[]) => {
  let activeWeeks = 0;
  let currentRun = 0;
  let longestRun = 0;
  let previousWeekStart: number | undefined;

  for (const week of weeks.toSorted((left, right) =>
    left.weekStart.localeCompare(right.weekStart)
  )) {
    const weekStart = Date.parse(`${week.weekStart}T00:00:00Z`);
    const followsPrevious =
      previousWeekStart !== undefined &&
      weekStart - previousWeekStart === WEEK_IN_MILLISECONDS;

    if (week.contributionCount > 0) {
      activeWeeks += 1;
      currentRun = followsPrevious ? currentRun + 1 : 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 0;
    }
    previousWeekStart = weekStart;
  }

  return { activeWeeks, longestRun };
};

type TimelineBlock =
  | { entry: TimelineEditionEntry; type: "major" }
  | {
      entries: TimelineEditionEntry[];
      key: string;
      month: string;
      type: "dispatches";
    };

const timelineBlocksFrom = (
  entries: readonly TimelineEditionEntry[]
): TimelineBlock[] => {
  const sortedEntries = entries
    .filter(isRenderable)
    .toSorted(
      (left, right) =>
        right.endDate.localeCompare(left.endDate) ||
        right.startDate.localeCompare(left.startDate) ||
        left.id.localeCompare(right.id)
    );
  const dispatchesByMonth = new Map<string, TimelineEditionEntry[]>();
  for (const entry of sortedEntries) {
    if (!isCompact(entry)) {
      continue;
    }
    const month = entry.endDate.slice(0, 7);
    dispatchesByMonth.set(month, [
      ...(dispatchesByMonth.get(month) ?? []),
      entry,
    ]);
  }

  const blocks: TimelineBlock[] = [];
  const emittedDispatchMonths = new Set<string>();
  for (const entry of sortedEntries) {
    if (!isCompact(entry)) {
      blocks.push({ entry, type: "major" });
      continue;
    }

    const month = entry.endDate.slice(0, 7);
    if (emittedDispatchMonths.has(month)) {
      continue;
    }
    emittedDispatchMonths.add(month);
    blocks.push({
      entries: dispatchesByMonth.get(month) ?? [entry],
      key: `dispatches-${month}`,
      month,
      type: "dispatches",
    });
  }
  return blocks;
};

function ActivitySignal({ activity }: Readonly<{ activity: GitHubActivity }>) {
  if (activity.status === "unavailable") {
    return (
      <p className="mt-5 max-w-2xl border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
        GitHub activity is temporarily unavailable. The selected public work
        remains available elsewhere on this page.
      </p>
    );
  }

  const { activeWeeks, longestRun } = activityWeekStats(activity.weeks);

  return (
    <div className="mt-6 border-y border-border py-5 sm:py-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
            Last twelve months
          </p>
          <p className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {numberFormatter.format(activity.totalContributions)} contributions
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Across {numberFormatter.format(activity.activeDays)} active days.{" "}
            {activity.restrictedContributions === null ? (
              <>
                Public and private activity are combined. Private identifiers
                are discarded before storage or editorial processing.
              </>
            ) : (
              <>
                {numberFormatter.format(activity.restrictedContributions)} came
                from private work; only privacy-safe aggregate patterns can
                enter the edition.
              </>
            )}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
            <div className="flex items-baseline gap-1.5">
              <dt>Active weeks</dt>
              <dd className="text-foreground">
                {numberFormatter.format(activeWeeks)}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>Longest weekly run</dt>
              <dd className="text-foreground">
                {numberFormatter.format(longestRun)}
              </dd>
            </div>
          </dl>
        </div>
        <a
          className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-sm font-ui text-sm font-medium text-primary transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:self-auto"
          href={`https://github.com/f0rr0?tab=overview&from=${
            activity.from
          }&to=${activity.to}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          GitHub profile
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </a>
      </div>
      <div
        aria-label={`${numberFormatter.format(
          activity.totalContributions
        )} contributions over ${activity.weeks.length} weeks`}
        className="mt-5 grid h-12 grid-flow-col items-end gap-1 sm:h-14 sm:gap-1.5"
        role="img"
      >
        {activity.weeks.map((week) => (
          <span
            aria-hidden="true"
            className="activity-week block min-h-1 rounded-[1px] bg-primary"
            data-level={week.level}
            key={week.weekStart}
            style={{ height: `${Math.max(12, week.level * 22)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
        <span>{formatDate(new Date(activity.from), siteConfig.language)}</span>
        <span>{formatDate(new Date(activity.to), siteConfig.language)}</span>
      </div>
    </div>
  );
}

function EntryLink({ entry }: Readonly<{ entry: TimelineEditionEntry }>) {
  if (entry.href === undefined || entry.label === undefined) {
    return null;
  }

  const external = entry.href.startsWith("http");
  return (
    <a
      className="group/link mt-3 inline-flex items-center gap-1 rounded-sm font-ui text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand-hover hover:decoration-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      href={entry.href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {entry.label}
      {external ? (
        <>
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight
            aria-hidden="true"
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
          />
        </>
      ) : null}
    </a>
  );
}

function VisibilityLabel({ entry }: Readonly<{ entry: TimelineEditionEntry }>) {
  if (entry.visibility === "public") {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 font-ui text-[0.6875rem] text-muted-foreground">
      <LockKeyhole aria-hidden="true" className="h-3 w-3" />
      {entry.visibility === "mixed"
        ? "partly anonymized"
        : entry.visibility === "anonymous"
          ? "anonymized totals"
          : "anonymized"}
    </span>
  );
}

function MajorEntry({ entry }: Readonly<{ entry: TimelineEditionEntry }>) {
  const editorialLabel =
    entry.cadence === "streak"
      ? "streak"
      : entry.kind === "activity"
        ? "trend"
        : entry.importance;

  return (
    <li
      className="sacred-timeline-item group"
      data-cadence={entry.cadence}
      data-importance={entry.importance}
      data-kind={entry.kind}
      data-private={entry.visibility === "public" ? undefined : "true"}
    >
      <time className="sacred-timeline-date" dateTime={entry.endDate}>
        {formatTimelineRange(entry.startDate, entry.endDate)}
      </time>
      <span aria-hidden="true" className="sacred-timeline-node" />
      <article className="sacred-timeline-content">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ui text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
            {editorialLabel} · {entry.bucket}
          </span>
          <VisibilityLabel entry={entry} />
        </div>
        <h3 className="sacred-timeline-title">{entry.title}</h3>
        <p className="sacred-timeline-summary">{entry.description}</p>
        {entry.metrics.length === 0 ? null : (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted-foreground">
            {entry.metrics.map((metric) => (
              <li key={metric}>{metric}</li>
            ))}
          </ul>
        )}
        <EntryLink entry={entry} />
      </article>
    </li>
  );
}

const dispatchKindLabels = {
  activity: "Activity",
  issue: "Issue",
  project: "Project",
  "pull-request": "PR",
} as const satisfies Record<TimelineEditionEntry["kind"], string>;

const repositoryLabelFrom = (entry: TimelineEditionEntry) => {
  if (
    (entry.kind !== "issue" && entry.kind !== "pull-request") ||
    entry.href === undefined
  ) {
    return null;
  }
  try {
    const url = new URL(entry.href);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.hostname === "github.com" && segments.length >= 2
      ? `${segments[0]}/${segments[1]}`
      : null;
  } catch {
    return null;
  }
};

function DispatchTitle({ entry }: Readonly<{ entry: TimelineEditionEntry }>) {
  if (entry.href === undefined) {
    return <>{entry.title}</>;
  }

  const external = entry.href.startsWith("http");
  return (
    <a
      className="sacred-timeline-dispatch-link group/dispatch-link"
      href={entry.href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {entry.title}
      {external ? (
        <>
          <span className="sr-only"> (opens in a new tab)</span>
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </>
      ) : null}
    </a>
  );
}

function DispatchGroup({
  block,
}: Readonly<{
  block: Extract<TimelineBlock, { type: "dispatches" }>;
}>) {
  const hasProtectedEntry = block.entries.some(
    (entry) => entry.visibility !== "public"
  );
  const label = monthFormatter.format(asUtcDate(`${block.month}-01`));
  return (
    <li
      className="sacred-timeline-item"
      data-importance="compact"
      data-private={hasProtectedEntry ? "true" : undefined}
    >
      <time className="sacred-timeline-date" dateTime={`${block.month}-01`}>
        {label}
      </time>
      <span aria-hidden="true" className="sacred-timeline-node" />
      <div className="sacred-timeline-content">
        <p className="font-ui text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
          Dispatches
        </p>
        <ol
          aria-label={`Activity from ${label}`}
          className="sacred-timeline-dispatches mt-2"
        >
          {block.entries.map((entry) => {
            const isPublicEvent =
              entry.kind === "issue" || entry.kind === "pull-request";
            const dispatchDate =
              entry.visibility === "public"
                ? dayFormatter.format(asUtcDate(entry.endDate))
                : monthOnlyFormatter.format(asUtcDate(entry.endDate));
            const repositoryLabel = repositoryLabelFrom(entry);

            return (
              <li
                className="sacred-timeline-dispatch"
                data-kind={entry.kind}
                key={entry.id}
              >
                <time
                  className="sacred-timeline-dispatch-date"
                  dateTime={entry.endDate}
                >
                  {dispatchDate}
                </time>
                <span className="sacred-timeline-dispatch-kind">
                  {dispatchKindLabels[entry.kind]}
                </span>
                <article className="sacred-timeline-dispatch-body">
                  <div className="flex flex-wrap items-center gap-2 font-ui text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{entry.bucket}</span>
                    {repositoryLabel === null ? null : (
                      <span aria-label={`Repository ${repositoryLabel}`}>
                        · {repositoryLabel}
                      </span>
                    )}
                    <VisibilityLabel entry={entry} />
                  </div>
                  <h3 className="sacred-timeline-dispatch-title">
                    <DispatchTitle entry={entry} />
                  </h3>
                  {isPublicEvent ? null : (
                    <p className="sacred-timeline-dispatch-summary">
                      {entry.description}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </li>
  );
}

export function GitHubTimeline({
  activity,
  edition,
}: Readonly<{
  activity: GitHubActivity;
  edition: TimelineEdition | null;
}>) {
  const blocks = edition === null ? [] : timelineBlocksFrom(edition.entries);
  const sectionTitle = edition?.headline ?? "The work, along one line.";

  return (
    <section
      aria-labelledby="timeline-title"
      className="home-section"
      id="timeline"
    >
      <div className="max-w-2xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
          Rolling edition
          {edition === null
            ? null
            : ` · ${formatTimelineRange(
                edition.windowStart,
                edition.windowEnd
              )}`}
        </p>
        <h2
          className="mt-2 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          id="timeline-title"
        >
          {sectionTitle}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          {edition?.standfirst ??
            "The live edition is rebuilding; public projects and writing remain available below."}
        </p>
        {edition === null ? null : (
          <p className="mt-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
            Updated{" "}
            <time dateTime={edition.generatedAt}>
              {monthFormatter.format(new Date(edition.generatedAt))}
            </time>
          </p>
        )}
      </div>
      <ActivitySignal activity={activity} />
      {edition === null ? null : (
        <ol className="sacred-timeline mt-10 sm:mt-12">
          {blocks.map((block) =>
            block.type === "major" ? (
              <MajorEntry entry={block.entry} key={block.entry.id} />
            ) : (
              <DispatchGroup block={block} key={block.key} />
            )
          )}
        </ol>
      )}
    </section>
  );
}
