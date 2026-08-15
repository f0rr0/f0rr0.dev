import { timelineEntries } from "@/content/home";
import type { GitHubActivity } from "@/lib/github-profile-core";
import {
  digestTimelineValue,
  TIMELINE_PROMPT_VERSION,
  TIMELINE_SCHEMA_VERSION,
  TIMELINE_WINDOW_DAYS,
  timelineEditionSchema,
  timelinePlanSchema,
} from "@/lib/timeline-core";
import type {
  TimelineEdition,
  TimelineEditionEntry,
} from "@/lib/timeline-core";

const DAY_IN_MILLISECONDS = 86_400_000;

const slug = (value: string) =>
  value
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 70);

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_IN_MILLISECONDS);

const incrementMonth = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7);
};

const githubRepositoryUrlFrom = (href: string) => {
  try {
    const url = new URL(href);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      segments.length >= 2
      ? `https://github.com/${segments[0]}/${segments[1]}`.toLocaleLowerCase(
          "en-US"
        )
      : null;
  } catch {
    return null;
  }
};

const fallbackActivityEntries = (
  activity: GitHubActivity,
  windowStart: string
): TimelineEditionEntry[] => {
  if (activity.status === "unavailable") {
    return [];
  }

  const countByMonth = new Map<string, number>();
  for (const week of activity.weeks) {
    if (week.weekStart < windowStart) {
      continue;
    }
    const month = week.weekStart.slice(0, 7);
    countByMonth.set(
      month,
      (countByMonth.get(month) ?? 0) + week.contributionCount
    );
  }

  const months = [...countByMonth.entries()]
    .filter(([, count]) => count > 0)
    .toSorted((left, right) => right[0].localeCompare(left[0]))
    .slice(0, 10);
  const rankedCounts = months
    .map(([, count]) => count)
    .toSorted((left, right) => left - right);
  const highThreshold =
    rankedCounts.at(Math.floor(rankedCounts.length * 0.7)) ?? 0;

  const activeWeeks = activity.weeks
    .filter(
      (week) =>
        week.contributionCount > 0 && week.weekStart >= windowStart.slice(0, 7)
    )
    .toSorted((left, right) => left.weekStart.localeCompare(right.weekStart));
  let longest: typeof activeWeeks = [];
  let current: typeof activeWeeks = [];
  for (const week of activeWeeks) {
    const previous = current.at(-1);
    if (
      previous !== undefined &&
      Date.parse(`${week.weekStart}T00:00:00Z`) -
        Date.parse(`${previous.weekStart}T00:00:00Z`) !==
        7 * DAY_IN_MILLISECONDS
    ) {
      if (current.length > longest.length) {
        longest = current;
      }
      current = [];
    }
    current.push(week);
  }
  if (current.length > longest.length) {
    longest = current;
  }

  const [firstStreakWeek] = longest;
  const lastStreakWeek = longest.at(-1);
  const firstPublishableMonth = windowStart.endsWith("-01")
    ? windowStart
    : `${incrementMonth(windowStart.slice(0, 7))}-01`;
  const streakEntry =
    longest.length >= 5 &&
    firstStreakWeek !== undefined &&
    lastStreakWeek !== undefined
      ? [
          {
            bucket: "Across the work",
            cadence: "streak",
            description:
              "An anonymized, account-wide contribution signal formed a sustained rhythm; repository identity and activity type remain unavailable.",
            endDate: `${lastStreakWeek.weekStart.slice(0, 7)}-01`,
            id: `activity-streak-${firstStreakWeek.weekStart.slice(0, 7)}-${lastStreakWeek.weekStart.slice(0, 7)}`,
            importance: "story",
            kind: "activity",
            metrics: [],
            sourceKeys: [
              `streak:${digestTimelineValue({ end: lastStreakWeek.weekStart, scope: "account-wide", start: firstStreakWeek.weekStart }).slice(0, 24)}`,
            ],
            startDate:
              `${firstStreakWeek.weekStart.slice(0, 7)}-01` <
              firstPublishableMonth
                ? firstPublishableMonth
                : `${firstStreakWeek.weekStart.slice(0, 7)}-01`,
            title: "A sustained account-wide cadence",
            visibility: "anonymous",
          } satisfies TimelineEditionEntry,
        ]
      : [];

  return [
    ...streakEntry,
    ...months
      .filter(
        ([month]) =>
          lastStreakWeek === undefined ||
          month !== lastStreakWeek.weekStart.slice(0, 7)
      )
      .map(([month, count], index) => {
        const sourceKey = `pulse:${digestTimelineValue({ count, month }).slice(0, 24)}`;
        const cadence = count >= highThreshold ? "concentrated" : "steady";
        return {
          bucket: "Across the work",
          cadence: "clustered",
          description: `A ${cadence} contribution-calendar rhythm appeared across the month; identities and exact volume remain withheld.`,
          endDate: `${month}-01`,
          id: `activity-${month}-${index}`,
          importance: count >= highThreshold ? "brief" : "pulse",
          kind: "activity",
          metrics: [],
          sourceKeys: [sourceKey],
          startDate: `${month}-01`,
          title: `${cadence === "concentrated" ? "A concentrated" : "A steady"} month in the work`,
          visibility: "anonymous",
        } satisfies TimelineEditionEntry;
      }),
  ];
};

export const createFallbackTimelineEdition = (
  activity: GitHubActivity,
  allowedPublicRepositories: ReadonlySet<string>,
  now = new Date()
): TimelineEdition | null => {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const windowEnd = dateOnly(end);
  const windowStart = dateOnly(addUtcDays(end, -(TIMELINE_WINDOW_DAYS - 1)));
  const curated = timelineEntries.flatMap((entry) => {
    if (entry.date < windowStart || entry.date > windowEnd) {
      return [];
    }
    const githubRepositoryUrl = githubRepositoryUrlFrom(entry.href);
    if (
      githubRepositoryUrl !== null &&
      !allowedPublicRepositories.has(githubRepositoryUrl)
    ) {
      return [];
    }

    const sourceKey = `curated:${digestTimelineValue({ date: entry.date, title: entry.title }).slice(0, 24)}`;
    const isPrivate = "private" in entry && entry.private;
    const importance = entry.importance ?? "story";
    return [
      {
        bucket: entry.bucket,
        cadence: importance === "lead" ? "clustered" : "isolated",
        description: entry.description,
        endDate: isPrivate ? `${entry.date.slice(0, 7)}-01` : entry.date,
        ...(isPrivate ? {} : { href: entry.href, label: entry.label }),
        id: `${slug(entry.title)}-${entry.date}`,
        importance,
        kind: "project",
        metrics: [],
        sourceKeys: [sourceKey],
        startDate: isPrivate ? `${entry.date.slice(0, 7)}-01` : entry.date,
        title: entry.title,
        visibility: isPrivate ? "private" : "public",
      } satisfies TimelineEditionEntry,
    ];
  });
  const activityEntries = fallbackActivityEntries(activity, windowStart);
  const planResult = timelinePlanSchema.safeParse({
    entries: [...curated, ...activityEntries].toSorted((left, right) =>
      right.startDate.localeCompare(left.startDate)
    ),
    headline: "The work, along one line.",
    standfirst:
      "A rolling edition of public milestones, sustained runs, and the smaller acts of collaboration between them.",
    windowEnd,
    windowStart,
  });
  if (!planResult.success) {
    return null;
  }
  const plan = planResult.data;
  const sourceDigest = digestTimelineValue({
    activity,
    sources: plan.entries.flatMap((entry) => entry.sourceKeys),
  });
  const editionKey = digestTimelineValue({ plan, sourceDigest });

  return timelineEditionSchema.parse({
    ...plan,
    editionKey,
    generatedAt: now.toISOString(),
    promptVersion: TIMELINE_PROMPT_VERSION,
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    sourceDigest,
  });
};
