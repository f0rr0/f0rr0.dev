import { timelineEntries } from "@/content/home";
import {
  activityDigestSchema,
  digestTimelineValue,
  TIMELINE_WINDOW_DAYS,
} from "@/lib/timeline-core";
import type {
  ActivityCluster,
  ActivityDigest,
  TimelineImportance,
  WorkBucket,
} from "@/lib/timeline-core";
import {
  normalizeTimelinePrivacyKey,
  parsePrivateTimelineTaxonomy,
  timelinePrivacyPolicyVersion,
} from "@/lib/timeline-privacy";
import {
  readLastCompleteAnonymousTimelineSync,
  readLastCompleteTimelineBackfill,
  readLatestTimelineSync,
  readTimelineActivityDays,
  readTimelineContributionTotals,
  readTimelinePublicEvents,
} from "@/lib/timeline-store";
import type {
  StoredTimelineActivityDay,
  StoredTimelineContributionTotal,
  StoredTimelinePublicEvent,
} from "@/lib/timeline-store";

const GITHUB_LOGIN = "f0rr0";
const DAY_IN_MILLISECONDS = 86_400_000;
const PUBLIC_RUN_GAP_DAYS = 10;
const PUBLIC_EVENTS_PER_MONTH = 3;

interface PublicRun {
  rows: StoredTimelineActivityDay[];
}

interface PrivateMonth {
  bucket: WorkBucket;
  month: string;
  rows: StoredTimelineActivityDay[];
}

export interface AnonymousContributionDay {
  contributionCount: number;
  day: string;
}

type ContributionTotal = Pick<
  StoredTimelineContributionTotal,
  "contributionCount" | "day"
>;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days
    )
  );

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

const daysBetween = (left: string, right: string) =>
  Math.round(
    (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) /
      DAY_IN_MILLISECONDS
  );

const startOfActivityWeek = (activityDay: string) => {
  const date = new Date(`${activityDay}T00:00:00Z`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return dateOnly(addUtcDays(date, mondayOffset));
};

export const calculateAnonymousContributionDays = (input: {
  events?: readonly Pick<StoredTimelinePublicEvent, "day" | "id">[];
  rows: readonly Pick<StoredTimelineActivityDay, "commitCount" | "day">[];
  totals: readonly ContributionTotal[];
}): AnonymousContributionDay[] => {
  const knownByDay = new Map<string, number>();
  for (const row of input.rows) {
    knownByDay.set(row.day, (knownByDay.get(row.day) ?? 0) + row.commitCount);
  }
  const seenEvents = new Set<string>();
  for (const event of input.events ?? []) {
    if (seenEvents.has(event.id)) {
      continue;
    }
    seenEvents.add(event.id);
    knownByDay.set(event.day, (knownByDay.get(event.day) ?? 0) + 1);
  }

  return input.totals.flatMap(({ contributionCount, day }) => {
    const anonymousCount = Math.max(
      0,
      contributionCount - (knownByDay.get(day) ?? 0)
    );
    return anonymousCount === 0
      ? []
      : [{ contributionCount: anonymousCount, day }];
  });
};

const indefiniteArticle = (value: string) =>
  /^[aeiou]/i.test(value) ? "An" : "A";

const incrementMonth = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7);
};

const mode = <T extends string>(values: readonly T[], fallback: T) => {
  const counts = new Map<T, number>();
  let selected = fallback;
  let selectedCount = -1;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > selectedCount) {
      selected = value;
      selectedCount = count;
    }
  }
  return selected;
};

const magnitudeFor = (commitCount: number, activeDays: number) => {
  if (commitCount >= 80 || activeDays >= 16) {
    return "intense" as const;
  }
  if (commitCount >= 36 || activeDays >= 9) {
    return "sustained" as const;
  }
  if (commitCount >= 12 || activeDays >= 4) {
    return "steady" as const;
  }
  return "light" as const;
};

const cadenceFor = (activeDays: number, spanDays: number) => {
  if (activeDays >= 8 && spanDays >= 21) {
    return "streak" as const;
  }
  if (activeDays >= 3) {
    return "clustered" as const;
  }
  return "isolated" as const;
};

const importanceFor = (
  magnitude: ReturnType<typeof magnitudeFor>,
  cadence: ReturnType<typeof cadenceFor>
): TimelineImportance => {
  if (magnitude === "intense" && cadence === "streak") {
    return "lead";
  }
  if (magnitude === "sustained" || cadence === "streak") {
    return "story";
  }
  if (magnitude === "steady") {
    return "brief";
  }
  return "pulse";
};

const languagePhrase = (languageFamily: string) => {
  switch (languageFamily) {
    case "data": {
      return "data systems";
    }
    case "documentation": {
      return "documentation";
    }
    case "infrastructure": {
      return "infrastructure";
    }
    case "mobile": {
      return "mobile systems";
    }
    case "systems": {
      return "systems work";
    }
    case "web": {
      return "web product work";
    }
    default: {
      return "product engineering";
    }
  }
};

const splitPublicRuns = (
  rows: readonly StoredTimelineActivityDay[]
): PublicRun[] => {
  const byRepo = new Map<string, StoredTimelineActivityDay[]>();
  for (const row of rows) {
    if (row.visibility !== "public") {
      continue;
    }
    const repoRows = byRepo.get(row.repoKey) ?? [];
    repoRows.push(row);
    byRepo.set(row.repoKey, repoRows);
  }

  const runs: PublicRun[] = [];
  for (const repoRows of byRepo.values()) {
    const sorted = repoRows.toSorted((left, right) =>
      left.day.localeCompare(right.day)
    );
    let current: StoredTimelineActivityDay[] = [];
    for (const row of sorted) {
      const previous = current.at(-1);
      if (
        previous !== undefined &&
        daysBetween(previous.day, row.day) > PUBLIC_RUN_GAP_DAYS
      ) {
        runs.push({ rows: current });
        current = [];
      }
      current.push(row);
    }
    if (current.length > 0) {
      runs.push({ rows: current });
    }
  }

  return runs;
};

const publicClusterFrom = (run: PublicRun): ActivityCluster | null => {
  const [first] = run.rows;
  const last = run.rows.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    first.publicRepoName === null ||
    first.publicRepoUrl === null
  ) {
    return null;
  }

  const commitCount = run.rows.reduce((sum, row) => sum + row.commitCount, 0);
  const activeDays = new Set(run.rows.map((row) => row.day)).size;
  const spanDays = daysBetween(first.day, last.day) + 1;
  const magnitude = magnitudeFor(commitCount, activeDays);
  const cadence = cadenceFor(activeDays, spanDays);
  const languageFamily = mode(
    run.rows.map((row) => row.languageFamily),
    "other"
  );
  const bucket = mode(
    run.rows.map((row) => row.bucket as WorkBucket),
    "Open source" as WorkBucket
  );
  const repositoryLabel = first.publicRepoName.split("/").at(-1) ?? "project";

  return {
    bucket,
    cadence,
    endDate: last.day,
    facts: [
      `Public work appeared across ${activeDays} active days during a ${spanDays}-day span.`,
      `The run centered on ${languagePhrase(languageFamily)}.`,
    ],
    key: `public:${digestTimelineValue({ end: last.day, repo: first.repoKey, start: first.day }).slice(0, 24)}`,
    kind: "commit-run",
    magnitude,
    maxImportance:
      importanceFor(magnitude, cadence) === "lead"
        ? "story"
        : importanceFor(magnitude, cadence),
    publicHref: first.publicRepoUrl,
    publicLabel: `View ${repositoryLabel}`,
    publicTitle: `${repositoryLabel}, in motion`,
    publishable: cadence !== "isolated",
    rollupOf: [],
    seriesKey: `series:${first.repoKey}`,
    startDate: first.day,
    visibility: "public",
  };
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

const canonicalPublicHref = (href: string | undefined) => {
  if (href === undefined) {
    return null;
  }
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.search = "";
    const path = url.pathname.replace(/\/+$/, "").toLocaleLowerCase("en-US");
    return `${url.origin.toLocaleLowerCase("en-US")}${path}`;
  } catch {
    return null;
  }
};

const curatedPublicClusters = (
  rows: readonly StoredTimelineActivityDay[],
  windowStart: string,
  windowEnd: string
): ActivityCluster[] => {
  const publicRepositoryUrls = new Set(
    rows.flatMap((row) =>
      row.visibility === "public" && row.publicRepoUrl !== null
        ? [row.publicRepoUrl.toLocaleLowerCase("en-US")]
        : []
    )
  );
  const repoKeyByUrl = new Map(
    rows.flatMap((row) =>
      row.visibility === "public" && row.publicRepoUrl !== null
        ? [[row.publicRepoUrl.toLocaleLowerCase("en-US"), row.repoKey] as const]
        : []
    )
  );

  return timelineEntries.flatMap((entry) => {
    if (
      entry.date < windowStart ||
      entry.date > windowEnd ||
      ("private" in entry && entry.private)
    ) {
      return [];
    }
    const repositoryUrl = githubRepositoryUrlFrom(entry.href);
    if (repositoryUrl !== null && !publicRepositoryUrls.has(repositoryUrl)) {
      return [];
    }

    const importance = entry.importance ?? "story";
    return [
      {
        bucket: entry.bucket,
        cadence: importance === "lead" ? "clustered" : "isolated",
        endDate: entry.date,
        facts: [entry.description],
        key: `curated:${digestTimelineValue({ date: entry.date, title: entry.title }).slice(0, 24)}`,
        kind: "curated",
        magnitude:
          importance === "lead"
            ? "intense"
            : importance === "story"
              ? "sustained"
              : "steady",
        maxImportance: importance,
        publicHref: entry.href,
        publicLabel: entry.label,
        publicTitle: entry.title,
        publishable: true,
        rollupOf: [],
        seriesKey:
          repositoryUrl === null
            ? `series:${digestTimelineValue({ href: entry.href }).slice(0, 24)}`
            : `series:${repoKeyByUrl.get(repositoryUrl) ?? digestTimelineValue(repositoryUrl).slice(0, 24)}`,
        startDate: entry.date,
        visibility: "public",
      } satisfies ActivityCluster,
    ];
  });
};

const groupPrivateMonths = (
  rows: readonly StoredTimelineActivityDay[]
): PrivateMonth[] => {
  const groups = new Map<string, PrivateMonth>();
  for (const row of rows) {
    if (row.visibility !== "private") {
      continue;
    }

    const month = row.day.slice(0, 7);
    const bucket = row.bucket as WorkBucket;
    const key = `${month}:${bucket}`;
    const group = groups.get(key) ?? { bucket, month, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].toSorted((left, right) =>
    left.month.localeCompare(right.month)
  );
};

const privateClusterFrom = (group: PrivateMonth): ActivityCluster | null => {
  const commitCount = group.rows.reduce((sum, row) => sum + row.commitCount, 0);
  const activeDays = new Set(group.rows.map((row) => row.day)).size;
  const repoCounts = new Map<string, number>();
  const domains = new Set<string>();
  for (const row of group.rows) {
    repoCounts.set(
      row.repoKey,
      (repoCounts.get(row.repoKey) ?? 0) + row.commitCount
    );
    if (row.privacyDomainKey !== null) {
      domains.add(row.privacyDomainKey);
    }
  }

  const dominantShare =
    Math.max(0, ...repoCounts.values()) / Math.max(1, commitCount);
  const themeIsDiverse =
    group.bucket !== "Private product work" &&
    repoCounts.size >= 3 &&
    domains.size >= 2 &&
    commitCount >= 20 &&
    activeDays >= 5 &&
    dominantShare <= 0.6;
  const bucket = themeIsDiverse ? group.bucket : "Private product work";
  const publishable = commitCount >= 10 && activeDays >= 3;
  if (!publishable) {
    return null;
  }

  const magnitude = magnitudeFor(commitCount, activeDays);
  const cadence = cadenceFor(activeDays, 31);
  const facts = themeIsDiverse
    ? [
        `${indefiniteArticle(magnitude)} ${magnitude} month across several independent private work streams.`,
        `The broad pattern was ${bucket.toLocaleLowerCase("en-US")}.`,
      ]
    : [
        `${indefiniteArticle(magnitude)} ${magnitude} month of private product work.`,
        "Repository identity and exact activity remain deliberately withheld.",
      ];

  return {
    bucket,
    cadence,
    endDate: `${group.month}-01`,
    facts,
    key: `private:${digestTimelineValue({ month: group.month, sourceBucket: group.bucket }).slice(0, 24)}`,
    kind: "private-month",
    magnitude,
    maxImportance:
      magnitude === "intense" || magnitude === "sustained" ? "story" : "brief",
    publishable: true,
    rollupOf: [],
    seriesKey: `private-series:${digestTimelineValue(group.bucket).slice(0, 24)}`,
    startDate: `${group.month}-01`,
    visibility: "private",
  };
};

const privateStreakClusters = (
  monthlyClusters: readonly ActivityCluster[]
): ActivityCluster[] => {
  const byBucket = new Map<WorkBucket, ActivityCluster[]>();
  for (const cluster of monthlyClusters) {
    const bucketClusters = byBucket.get(cluster.bucket) ?? [];
    bucketClusters.push(cluster);
    byBucket.set(cluster.bucket, bucketClusters);
  }

  const streaks: ActivityCluster[] = [];
  for (const [bucket, clusters] of byBucket) {
    const sorted = clusters.toSorted((left, right) =>
      left.startDate.localeCompare(right.startDate)
    );
    let current: ActivityCluster[] = [];

    const finish = () => {
      if (current.length < 3) {
        current = [];
        return;
      }
      const [first] = current;
      const last = current.at(-1);
      if (first === undefined || last === undefined) {
        current = [];
        return;
      }
      streaks.push({
        bucket,
        cadence: "streak",
        endDate: last.endDate,
        facts: [
          "A sustained private work pattern held across several months.",
          "Only the broad cadence survives the publication boundary.",
        ],
        key: `streak:${digestTimelineValue({ bucket, end: last.endDate, sources: current.map((cluster) => cluster.key), start: first.startDate }).slice(0, 24)}`,
        kind: "private-streak",
        magnitude: "sustained",
        maxImportance: current.length >= 6 ? "lead" : "story",
        publishable: true,
        rollupOf: current.map((cluster) => cluster.key),
        seriesKey: `private-series:${digestTimelineValue(bucket).slice(0, 24)}`,
        startDate: first.startDate,
        visibility: "private",
      });
      current = [];
    };

    for (const cluster of sorted) {
      const previous = current.at(-1);
      if (
        previous !== undefined &&
        incrementMonth(previous.startDate.slice(0, 7)) !==
          cluster.startDate.slice(0, 7)
      ) {
        finish();
      }
      current.push(cluster);
    }
    finish();
  }

  return streaks;
};

const publicStreakCluster = (
  rows: readonly StoredTimelineActivityDay[],
  events: readonly StoredTimelinePublicEvent[]
): ActivityCluster | null => {
  const publicRows = rows.filter((row) => row.visibility === "public");
  const activeWeekKeys = new Set(
    [
      ...publicRows.map((row) => row.day),
      ...events.map((event) => event.day),
    ].map(startOfActivityWeek)
  );
  const weeks = [...activeWeekKeys].toSorted();
  let longest: string[] = [];
  let current: string[] = [];
  for (const week of weeks) {
    const previous = current.at(-1);
    if (previous !== undefined && daysBetween(previous, week) !== 7) {
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
  if (longest.length < 5) {
    return null;
  }

  const [first] = longest;
  const last = longest.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  const repositories = new Set([
    ...publicRows
      .filter(
        (row) =>
          row.day >= first &&
          row.day <=
            addUtcDays(new Date(`${last}T00:00:00Z`), 6)
              .toISOString()
              .slice(0, 10)
      )
      .map((row) => row.repoKey),
    ...events
      .filter(
        (event) =>
          event.day >= first &&
          event.day <=
            addUtcDays(new Date(`${last}T00:00:00Z`), 6)
              .toISOString()
              .slice(0, 10)
      )
      .map((event) => event.repoKey),
  ]);
  return {
    bucket: "Product systems",
    cadence: "streak",
    endDate: last,
    facts: [
      `Public contributions appeared in ${longest.length} consecutive weeks across ${repositories.size} repositories.`,
      "Commit runs and discrete collaboration events count once within each active week.",
    ],
    key: `streak:${digestTimelineValue({ end: last, scope: "public", start: first }).slice(0, 24)}`,
    kind: "public-streak",
    magnitude: "intense",
    maxImportance: "lead",
    publicTitle: "A sustained public cadence",
    publishable: true,
    rollupOf: [],
    seriesKey: "series:public-cadence",
    startDate: first,
    visibility: "public",
  };
};

const longestActiveWeekRun = (totals: readonly ContributionTotal[]) => {
  const weeks = [
    ...new Set(
      totals
        .filter((total) => total.contributionCount > 0)
        .map((total) => startOfActivityWeek(total.day))
    ),
  ].toSorted();
  let longest: string[] = [];
  let current: string[] = [];
  for (const week of weeks) {
    const previous = current.at(-1);
    if (previous !== undefined && daysBetween(previous, week) !== 7) {
      if (current.length > longest.length) {
        longest = current;
      }
      current = [];
    }
    current.push(week);
  }
  return current.length > longest.length ? current : longest;
};

const accountWideStreakCluster = (
  totals: readonly ContributionTotal[]
): ActivityCluster | null => {
  const longest = longestActiveWeekRun(totals);
  const [first] = longest;
  const last = longest.at(-1);
  if (longest.length < 5 || first === undefined || last === undefined) {
    return null;
  }

  return {
    bucket: "Across the work",
    cadence: "streak",
    endDate: last,
    facts: [
      "The anonymized account-wide calendar shows a sustained run across consecutive active weeks.",
      "Repository identity and activity type remain unavailable, so no project theme is inferred.",
    ],
    key: `streak:${digestTimelineValue({ end: last, scope: "account-wide", start: first }).slice(0, 24)}`,
    kind: "account-wide-streak",
    magnitude: longest.length >= 12 ? "intense" : "sustained",
    maxImportance: longest.length >= 12 ? "lead" : "story",
    publishable: true,
    rollupOf: [],
    seriesKey: "anonymous-series:account-wide",
    startDate: first,
    visibility: "anonymous",
  };
};

const anonymousMonthlyClusters = (
  days: readonly AnonymousContributionDay[]
): ActivityCluster[] => {
  const byMonth = new Map<string, AnonymousContributionDay[]>();
  for (const day of days) {
    const month = day.day.slice(0, 7);
    const monthDays = byMonth.get(month) ?? [];
    monthDays.push(day);
    byMonth.set(month, monthDays);
  }

  return [...byMonth.entries()].flatMap(([month, monthDays]) => {
    const contributionCount = monthDays.reduce(
      (sum, day) => sum + day.contributionCount,
      0
    );
    const activeDays = monthDays.length;
    if (activeDays < 3 || contributionCount < 5) {
      return [];
    }
    const magnitude = magnitudeFor(contributionCount, activeDays);
    return [
      {
        bucket: "Across the work",
        cadence: "clustered",
        endDate: `${month}-01`,
        facts: [
          "An anonymized account-wide rhythm extended beyond repository-resolved activity.",
          "Repository identity and activity type are unavailable, so no project theme is inferred.",
        ],
        key: `anonymous:${digestTimelineValue({ month, source: "residual" }).slice(0, 24)}`,
        kind: "anonymous-month",
        magnitude,
        maxImportance:
          magnitude === "intense" || magnitude === "sustained"
            ? "brief"
            : "pulse",
        publishable: true,
        rollupOf: [],
        seriesKey: "anonymous-series:account-wide",
        startDate: `${month}-01`,
        visibility: "anonymous",
      } satisfies ActivityCluster,
    ];
  });
};

const publicEventClusterFrom = (
  event: StoredTimelinePublicEvent
): ActivityCluster | null => {
  if (event.eventKind === "pull_request_reviewed") {
    return null;
  }
  const repositoryLabel = event.publicRepoName.split("/").at(-1) ?? "project";
  const copy =
    event.eventKind === "issue_opened"
      ? {
          description: `Opened a public issue in ${event.publicRepoName}; the thread remains available on GitHub.`,
          kind: "issue-opened" as const,
          label: "View issue",
          maxImportance: "brief" as const,
          title: event.publicTitle,
        }
      : event.eventKind === "pull_request_opened"
        ? {
            description: `Opened a public pull request in ${event.publicRepoName}; the proposed change remains available on GitHub.`,
            kind: "pull-request-opened" as const,
            label: "View pull request",
            maxImportance: "brief" as const,
            title: event.publicTitle,
          }
        : {
            description: `Created ${event.publicRepoName} as a public repository.`,
            kind: "repository-created" as const,
            label: `View ${repositoryLabel}`,
            maxImportance: "brief" as const,
            title: `${repositoryLabel}, made public`,
          };

  return {
    bucket: event.bucket as WorkBucket,
    cadence: "isolated",
    endDate: event.day,
    facts: [copy.description],
    key: `event:${event.id.slice(0, 24)}`,
    kind: copy.kind,
    magnitude: "light",
    maxImportance: copy.maxImportance,
    publicHref: event.publicUrl,
    publicLabel: copy.label,
    publicTitle: copy.title,
    publishable: true,
    rollupOf: [],
    seriesKey: `series:${event.repoKey}`,
    startDate: event.day,
    visibility: "public",
  };
};

const representativePublicEventClusters = (
  clusters: readonly ActivityCluster[]
) => {
  const byMonth = new Map<string, ActivityCluster[]>();
  for (const cluster of clusters) {
    const month = cluster.startDate.slice(0, 7);
    const monthClusters = byMonth.get(month) ?? [];
    monthClusters.push(cluster);
    byMonth.set(month, monthClusters);
  }

  return [...byMonth.values()].flatMap((monthClusters) => {
    const sorted = monthClusters.toSorted(
      (left, right) =>
        right.startDate.localeCompare(left.startDate) ||
        left.key.localeCompare(right.key)
    );
    const selected: ActivityCluster[] = [];
    const selectedKeys = new Set<string>();
    const select = (cluster: ActivityCluster | undefined) => {
      if (
        cluster !== undefined &&
        selected.length < PUBLIC_EVENTS_PER_MONTH &&
        !selectedKeys.has(cluster.key)
      ) {
        selected.push(cluster);
        selectedKeys.add(cluster.key);
      }
    };

    for (const kind of [
      "repository-created",
      "issue-opened",
      "pull-request-opened",
    ] as const) {
      select(sorted.find((cluster) => cluster.kind === kind));
    }
    const selectedSeries = new Set(
      selected.map((cluster) => cluster.seriesKey)
    );
    for (const cluster of sorted) {
      if (!selectedSeries.has(cluster.seriesKey)) {
        select(cluster);
        selectedSeries.add(cluster.seriesKey);
      }
    }
    for (const cluster of sorted) {
      select(cluster);
    }
    return selected;
  });
};

const publicRecurrenceClusters = (
  clusters: readonly ActivityCluster[]
): ActivityCluster[] => {
  const bySeries = new Map<string, ActivityCluster[]>();
  for (const cluster of clusters) {
    const series = bySeries.get(cluster.seriesKey) ?? [];
    series.push(cluster);
    bySeries.set(cluster.seriesKey, series);
  }

  return [...bySeries.entries()].flatMap(([seriesKey, series]) => {
    const sorted = series.toSorted((left, right) =>
      left.startDate.localeCompare(right.startDate)
    );
    const [first] = sorted;
    const last = sorted.at(-1);
    if (
      sorted.length < 3 ||
      first === undefined ||
      last === undefined ||
      daysBetween(first.startDate, last.endDate) < 60 ||
      first.publicHref === undefined
    ) {
      return [];
    }
    const repositoryLabel =
      first.publicLabel?.replace(/^View /, "") ?? "A public project";
    return [
      {
        bucket: first.bucket,
        cadence: "clustered",
        endDate: last.endDate,
        facts: [
          `${repositoryLabel} returned in ${sorted.length} distinct public work runs across the year.`,
        ],
        key: `recurrence:${digestTimelineValue({ seriesKey, sources: sorted.map((cluster) => cluster.key) }).slice(0, 24)}`,
        kind: "recurrence",
        magnitude: "sustained",
        maxImportance: "story",
        publicHref: first.publicHref,
        publicLabel: first.publicLabel,
        publicTitle: `${repositoryLabel}, revisited`,
        publishable: true,
        rollupOf: sorted.map((cluster) => cluster.key),
        seriesKey,
        startDate: first.startDate,
        visibility: "public",
      } satisfies ActivityCluster,
    ];
  });
};

export const createTimelineActivityDigest = (input: {
  anonymousTotals?: readonly ContributionTotal[];
  coverage: "complete" | "partial";
  events?: readonly StoredTimelinePublicEvent[];
  generatedAt: Date;
  rows: readonly StoredTimelineActivityDay[];
  windowEnd: string;
  windowStart: string;
}): ActivityDigest => {
  const events = input.events ?? [];
  const anonymousTotals = input.anonymousTotals ?? [];
  const rawPublicClusters = splitPublicRuns(input.rows).flatMap((run) => {
    const cluster = publicClusterFrom(run);
    return cluster === null ? [] : [cluster];
  });
  const rawEventClusters = events.flatMap((event) => {
    const cluster = publicEventClusterFrom(event);
    return cluster === null ? [] : [cluster];
  });
  const curatedClusters = curatedPublicClusters(
    input.rows,
    input.windowStart,
    input.windowEnd
  );
  const curatedHrefs = new Set(
    curatedClusters.flatMap((cluster) => {
      const href = canonicalPublicHref(cluster.publicHref);
      return href === null ? [] : [href];
    })
  );
  const eventClusters = representativePublicEventClusters(
    rawEventClusters.filter((cluster) => {
      const eventHref = canonicalPublicHref(cluster.publicHref);
      if (eventHref !== null && curatedHrefs.has(eventHref)) {
        return false;
      }
      if (cluster.kind !== "repository-created") {
        return true;
      }
      return !curatedClusters.some(
        (curated) =>
          canonicalPublicHref(curated.publicHref) === eventHref &&
          Math.abs(daysBetween(curated.endDate, cluster.endDate)) <= 7
      );
    })
  );
  const recurrenceClusters = publicRecurrenceClusters(rawPublicClusters);
  const recurringSeries = new Set(
    recurrenceClusters.map((cluster) => cluster.seriesKey)
  );
  const publicClusters = rawPublicClusters.filter((cluster) => {
    if (recurringSeries.has(cluster.seriesKey)) {
      return false;
    }
    if (cluster.cadence === "streak") {
      return true;
    }
    const overlapsCuratedMarker = curatedClusters.some(
      (marker) =>
        marker.seriesKey === cluster.seriesKey &&
        marker.endDate >= cluster.startDate &&
        marker.endDate <= cluster.endDate
    );
    const overlapsCompactEvent =
      (cluster.maxImportance === "brief" ||
        cluster.maxImportance === "pulse") &&
      eventClusters.some(
        (marker) =>
          marker.seriesKey === cluster.seriesKey &&
          marker.endDate >= cluster.startDate &&
          marker.endDate <= cluster.endDate
      );
    return !(overlapsCuratedMarker || overlapsCompactEvent);
  });
  const privateGroups = groupPrivateMonths(input.rows);
  const genericRowsByMonth = new Map<string, StoredTimelineActivityDay[]>();
  const privateSpecificClusters = privateGroups.flatMap((group) => {
    const cluster = privateClusterFrom(group);
    if (cluster === null || cluster.bucket === "Private product work") {
      genericRowsByMonth.set(group.month, [
        ...(genericRowsByMonth.get(group.month) ?? []),
        ...group.rows,
      ]);
      return [];
    }
    return [cluster];
  });
  const privateGenericClusters = [...genericRowsByMonth.entries()].flatMap(
    ([month, rows]) => {
      const cluster = privateClusterFrom({
        bucket: "Private product work",
        month,
        rows,
      });
      return cluster === null ? [] : [cluster];
    }
  );
  const privateMonthlyClusters = [
    ...privateSpecificClusters,
    ...privateGenericClusters,
  ];
  const rawAnonymousClusters = anonymousMonthlyClusters(
    calculateAnonymousContributionDays({
      events,
      rows: input.rows,
      totals: anonymousTotals,
    })
  );
  const accountWideStreak = accountWideStreakCluster(anonymousTotals);
  const anonymousClusters =
    accountWideStreak === null
      ? rawAnonymousClusters
      : rawAnonymousClusters.filter(
          (cluster) =>
            cluster.startDate.slice(0, 7) !==
            accountWideStreak.endDate.slice(0, 7)
        );
  const publicStreak =
    accountWideStreak === null ? publicStreakCluster(input.rows, events) : null;
  const importanceRank: Record<TimelineImportance, number> = {
    brief: 1,
    lead: 3,
    pulse: 0,
    story: 2,
  };
  const clusters = [
    ...curatedClusters,
    ...eventClusters,
    ...recurrenceClusters,
    ...publicClusters,
    ...privateMonthlyClusters,
    ...privateStreakClusters(privateMonthlyClusters),
    ...anonymousClusters,
    ...(accountWideStreak === null ? [] : [accountWideStreak]),
    ...(publicStreak === null ? [] : [publicStreak]),
  ]
    .flatMap((cluster) => {
      if (cluster.visibility === "public") {
        return [
          {
            ...cluster,
            startDate:
              cluster.startDate < input.windowStart
                ? input.windowStart
                : cluster.startDate,
          },
        ];
      }
      let startDate = `${cluster.startDate.slice(0, 7)}-01`;
      if (startDate < input.windowStart) {
        startDate = `${incrementMonth(startDate.slice(0, 7))}-01`;
      }
      const endDate = `${cluster.endDate.slice(0, 7)}-01`;
      return startDate > endDate ? [] : [{ ...cluster, endDate, startDate }];
    })
    .toSorted(
      (left, right) =>
        importanceRank[right.maxImportance] -
          importanceRank[left.maxImportance] ||
        right.startDate.localeCompare(left.startDate) ||
        left.key.localeCompare(right.key)
    )
    .slice(0, 120)
    .toSorted((left, right) => right.startDate.localeCompare(left.startDate));

  return activityDigestSchema.parse({
    clusters,
    coverage: input.coverage,
    generatedAt: input.generatedAt.toISOString(),
    windowEnd: input.windowEnd,
    windowStart: input.windowStart,
  });
};

const syncAgeInDays = (completedAt: Date | null | undefined, now: Date) =>
  completedAt === null || completedAt === undefined
    ? Number.POSITIVE_INFINITY
    : Math.floor((now.getTime() - completedAt.getTime()) / DAY_IN_MILLISECONDS);

const eligibleActivityRows = (
  rows: readonly StoredTimelineActivityDay[],
  activePrivacyVersion: string | null
) =>
  rows.filter(
    (row) =>
      row.visibility === "public" ||
      (activePrivacyVersion !== null &&
        row.privacyPolicyVersion === activePrivacyVersion)
  );

const currentAnonymousTotals = (input: {
  lastSync: {
    completedAt: Date | null;
    windowEnd: string;
  } | null;
  now: Date;
  totals: readonly StoredTimelineContributionTotal[];
  windowEnd: string;
  windowStart: string;
}) => {
  const start = new Date(`${input.windowStart}T00:00:00Z`);
  const windowIsComplete =
    input.totals.length === TIMELINE_WINDOW_DAYS &&
    input.totals.every(
      (total, index) => total.day === dateOnly(addUtcDays(start, index))
    );
  const syncAge = syncAgeInDays(input.lastSync?.completedAt, input.now);
  return windowIsComplete &&
    input.lastSync?.windowEnd === input.windowEnd &&
    syncAge >= 0 &&
    syncAge <= 2
    ? input.totals
    : [];
};

const timelineCoverage = (input: {
  lastFullSync: {
    windowEnd: string;
    windowStart: string;
  } | null;
  latestSync: {
    completedAt: Date | null;
    coverage: string;
    status: string;
  } | null;
  now: Date;
  windowEnd: string;
  windowStart: string;
}): "complete" | "partial" => {
  if (input.lastFullSync === null) {
    return "partial";
  }
  const lastSyncSpan =
    daysBetween(input.lastFullSync.windowStart, input.lastFullSync.windowEnd) +
    1;
  const backfillAge = daysBetween(
    input.lastFullSync.windowEnd,
    input.windowEnd
  );
  const latestSyncAge = syncAgeInDays(input.latestSync?.completedAt, input.now);
  return lastSyncSpan >= 365 &&
    input.lastFullSync.windowStart <= input.windowStart &&
    backfillAge >= 0 &&
    backfillAge <= 8 &&
    input.latestSync?.status === "completed" &&
    input.latestSync.coverage === "complete" &&
    latestSyncAge >= 0 &&
    latestSyncAge <= 2
    ? "complete"
    : "partial";
};

export const loadTimelineActivityDigest = async (
  now = new Date()
): Promise<ActivityDigest> => {
  const end = startOfUtcDay(now);
  const windowEnd = dateOnly(end);
  const windowStart = dateOnly(addUtcDays(end, -(TIMELINE_WINDOW_DAYS - 1)));
  const [
    rows,
    events,
    anonymousTotals,
    lastAnonymousSync,
    lastFullSync,
    latestSync,
  ] = await Promise.all([
    readTimelineActivityDays(GITHUB_LOGIN, windowStart, windowEnd),
    readTimelinePublicEvents(GITHUB_LOGIN, windowStart, windowEnd),
    readTimelineContributionTotals(GITHUB_LOGIN, windowStart, windowEnd),
    readLastCompleteAnonymousTimelineSync(),
    readLastCompleteTimelineBackfill(),
    readLatestTimelineSync(),
  ]);
  const privacyKey = normalizeTimelinePrivacyKey(
    process.env.TIMELINE_PRIVACY_KEY
  );
  const activePrivacyVersion =
    privacyKey === null
      ? null
      : timelinePrivacyPolicyVersion(
          privacyKey,
          parsePrivateTimelineTaxonomy(process.env.TIMELINE_PRIVATE_TAXONOMY)
        );
  const eligibleRows = eligibleActivityRows(rows, activePrivacyVersion);

  return createTimelineActivityDigest({
    anonymousTotals: currentAnonymousTotals({
      lastSync: lastAnonymousSync,
      now,
      totals: anonymousTotals,
      windowEnd,
      windowStart,
    }),
    coverage: timelineCoverage({
      lastFullSync,
      latestSync,
      now,
      windowEnd,
      windowStart,
    }),
    generatedAt: now,
    events,
    rows: eligibleRows,
    windowEnd,
    windowStart,
  });
};
