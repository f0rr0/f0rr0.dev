import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubIssues,
  githubPublicFeedHead,
  githubPullRequests,
  githubRepositories,
  githubWorkUnitAcceptedSummaries,
  githubWorkUnitSummaryAttempts,
  githubWorkUnits,
} from "@/db/schema";
import { encodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import { buildPublicGitHubActivityDays } from "@/lib/github-activity-feed-core";
import type {
  PublicGitHubIssueRow,
  PublicGitHubWorkUnitRow,
} from "@/lib/github-activity-feed-core";
import type {
  PublicActivityHead,
  PublicGitHubActivityPage,
  PublicGitHubActivityRepository,
  PublicGitHubWorkUnitKind,
} from "@/lib/github-activity-types";
import {
  decodeGitHubWorkUnitSummary,
  GITHUB_WORK_UNIT_SUMMARY_RECIPE,
} from "@/lib/github-work-unit-summary";

export const PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE = 5;
const MAXIMUM_PUBLIC_DAY_PAGE_SIZE = 14;
const MAXIMUM_PUBLIC_ROWS_PER_DAY = 1000;
const SHA = /^[a-f0-9]{40}$/u;
const REPOSITORY_OWNER = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/u;
const ACTIVE_SUMMARY_STATES = new Set(["pending", "processing", "retryable"]);

type GitHubActivityDatabase = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type GitHubActivityReadDatabase = Pick<GitHubActivityDatabase, "select">;

export class GitHubActivityOrderingChangedError extends Error {
  constructor() {
    super("The GitHub activity ordering changed.");
    this.name = "GitHubActivityOrderingChangedError";
  }
}

interface PublicGitHubActivityHeadRead {
  etag: string;
  head: PublicActivityHead;
}

const checkedPageSize = (limit: number) => {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAXIMUM_PUBLIC_DAY_PAGE_SIZE
  ) {
    throw new RangeError("The GitHub activity day-page size is invalid.");
  }
  return limit;
};

const checkedRevision = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("A GitHub activity revision is outside its safe range.");
  }
  return String(value);
};

const publicHeadSelection = {
  feedRevision: githubPublicFeedHead.feedRevision,
  headContentRevision: githubPublicFeedHead.headContentRevision,
  lastPublishedAt: githubPublicFeedHead.lastPublishedAt,
  orderingRevision: githubPublicFeedHead.orderingRevision,
  summarizing: githubPublicFeedHead.summarizing,
};

interface PublicHeadRow {
  feedRevision: number;
  headContentRevision: number;
  lastPublishedAt: Date | null;
  orderingRevision: number;
  summarizing: boolean;
}

const publicHeadFromRow = (
  row: PublicHeadRow
): PublicGitHubActivityHeadRead => {
  const headContentRevision = checkedRevision(row.headContentRevision);
  const head: PublicActivityHead = {
    feedRevision: checkedRevision(row.feedRevision),
    lastPublishedAt: row.lastPublishedAt?.toISOString() ?? null,
    revision: headContentRevision,
    summarizing: row.summarizing,
  };
  return {
    etag: `"github-activity-head-${headContentRevision}"`,
    head,
  };
};

const readPublicHead = async (
  database: GitHubActivityReadDatabase
): Promise<PublicGitHubActivityHeadRead & { orderingRevision: string }> => {
  const [row] = await database
    .select(publicHeadSelection)
    .from(githubPublicFeedHead)
    .where(eq(githubPublicFeedHead.id, true))
    .limit(1);
  if (row === undefined) {
    throw new Error("The public GitHub activity head is missing.");
  }
  return {
    ...publicHeadFromRow(row),
    orderingRevision: checkedRevision(row.orderingRevision),
  };
};

export const readPublicGitHubActivityHead = async () => {
  const { etag, head } = await readPublicHead(getDatabase());
  return { etag, head };
};

const safeAvatarUrl = (value: string | null) => {
  if (value === null) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "avatars.githubusercontent.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

interface PublicRepositorySource {
  fullName: string;
  id: string;
  ownerAvatarUrl: string | null;
  visibility: string | null;
}

interface CheckedPublicRepository {
  baseUrl: string | null;
  projection: PublicGitHubActivityRepository;
}

const checkedPublicRepository = (
  repository: PublicRepositorySource
): CheckedPublicRepository => {
  if (
    repository.visibility !== "public" &&
    repository.visibility !== "private" &&
    repository.visibility !== "internal"
  ) {
    throw new Error("A GitHub repository visibility is invalid.");
  }
  if (repository.visibility !== "public") {
    return {
      baseUrl: null,
      projection: {
        avatarUrl: safeAvatarUrl(repository.ownerAvatarUrl),
        key: repository.id,
        label: "Private",
        url: null,
      },
    };
  }
  const [owner, name, extra] = repository.fullName.split("/");
  if (
    owner === undefined ||
    name === undefined ||
    extra !== undefined ||
    !REPOSITORY_OWNER.test(owner) ||
    !REPOSITORY_NAME.test(name)
  ) {
    throw new Error("A public GitHub repository identity is invalid.");
  }
  const baseUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return {
    baseUrl,
    projection: {
      avatarUrl: safeAvatarUrl(repository.ownerAvatarUrl),
      key: repository.id,
      label: repository.fullName,
      url: baseUrl,
    },
  };
};

const publicWorkUnitKind = (value: string): PublicGitHubWorkUnitKind => {
  if (value === "pull_request") {
    return "pull-request";
  }
  if (value === "canonical_day") {
    return "canonical-day";
  }
  if (value === "branch") {
    return value;
  }
  throw new Error("A public GitHub work-unit kind is invalid.");
};

const issueDay = sql<string>`to_char(${githubIssues.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

interface AvailableDays {
  hasNextPage: boolean;
  selectedDays: readonly string[];
}

const readAvailableDays = async (
  database: GitHubActivityDatabase,
  cursor: GitHubActivityCursor | null,
  pageSize: number
): Promise<AvailableDays> => {
  const beforeWorkUnit =
    cursor === null
      ? undefined
      : lt(githubWorkUnits.activityDay, cursor.beforeDay);
  const beforeIssue =
    cursor === null
      ? undefined
      : lt(
          githubIssues.createdAt,
          new Date(`${cursor.beforeDay}T00:00:00.000Z`)
        );
  const queryLimit = pageSize + 1;
  const [workDays, issueDays] = await Promise.all([
    database
      .selectDistinct({ day: githubWorkUnits.activityDay })
      .from(githubWorkUnits)
      .innerJoin(
        githubRepositories,
        eq(githubWorkUnits.repositoryId, githubRepositories.id)
      )
      .where(
        and(
          beforeWorkUnit,
          inArray(githubWorkUnits.visibility, ["public", "private"]),
          inArray(githubRepositories.visibility, [
            "public",
            "private",
            "internal",
          ])
        )
      )
      .orderBy(desc(githubWorkUnits.activityDay))
      .limit(queryLimit),
    database
      .selectDistinct({ day: issueDay })
      .from(githubIssues)
      .innerJoin(
        githubRepositories,
        eq(githubIssues.repositoryId, githubRepositories.id)
      )
      .where(
        and(
          beforeIssue,
          inArray(githubRepositories.visibility, [
            "public",
            "private",
            "internal",
          ])
        )
      )
      .orderBy(desc(issueDay))
      .limit(queryLimit),
  ]);

  const allDays = new Set([...workDays, ...issueDays].map(({ day }) => day));
  const orderedDays = [...allDays].toSorted((left, right) =>
    right.localeCompare(left)
  );
  const selectedDays = orderedDays.slice(0, pageSize);
  return {
    hasNextPage: orderedDays.length > pageSize,
    selectedDays,
  };
};

const readPublicRows = async (
  database: GitHubActivityDatabase,
  selectedDays: readonly string[],
  summariesAreRunning: boolean
): Promise<{
  issues: readonly PublicGitHubIssueRow[];
  workUnits: readonly PublicGitHubWorkUnitRow[];
}> => {
  if (selectedDays.length === 0) {
    return { issues: [], workUnits: [] };
  }
  const maximumRows = selectedDays.length * MAXIMUM_PUBLIC_ROWS_PER_DAY;
  const [unitRows, issueRows] = await Promise.all([
    database
      .select({
        activityAt: githubWorkUnits.activityAt,
        activityDay: githubWorkUnits.activityDay,
        additions: githubWorkUnits.additions,
        attributionMode: githubWorkUnits.attributionMode,
        deletions: githubWorkUnits.deletions,
        fileCount: githubWorkUnits.fileCount,
        firstActivityAt: githubWorkUnits.firstActivityAt,
        fullName: githubRepositories.fullName,
        id: githubWorkUnits.id,
        identityKey: githubWorkUnits.identityKey,
        kind: githubWorkUnits.kind,
        languages: githubWorkUnits.languages,
        lastActivityAt: githubWorkUnits.lastActivityAt,
        memberCount: githubWorkUnits.memberCount,
        newestCommitRepositoryId: githubWorkUnits.newestCommitRepositoryId,
        newestCommitSha: githubWorkUnits.newestCommitSha,
        outcomeDigest: githubWorkUnits.outcomeDigest,
        ownerAvatarUrl: githubRepositories.ownerAvatarUrl,
        pullRequestNumber: githubPullRequests.number,
        repositoryId: githubRepositories.id,
        summaryEvaluatedDigest: githubWorkUnits.summaryEvaluatedDigest,
        summaryEvaluationDigest: githubWorkUnits.summaryEvaluationDigest,
        summaryInputDigest: githubWorkUnits.summaryInputDigest,
        visibility: githubRepositories.visibility,
      })
      .from(githubWorkUnits)
      .innerJoin(
        githubRepositories,
        eq(githubWorkUnits.repositoryId, githubRepositories.id)
      )
      .leftJoin(
        githubPullRequests,
        and(
          eq(githubWorkUnits.pullRequestNodeId, githubPullRequests.nodeId),
          eq(githubWorkUnits.repositoryId, githubPullRequests.repositoryId)
        )
      )
      .where(
        and(
          inArray(githubWorkUnits.activityDay, selectedDays),
          inArray(githubWorkUnits.visibility, ["public", "private"]),
          inArray(githubRepositories.visibility, [
            "public",
            "private",
            "internal",
          ])
        )
      )
      .orderBy(desc(githubWorkUnits.activityAt), githubWorkUnits.id)
      .limit(maximumRows + 1),
    database
      .select({
        activityAt: githubIssues.createdAt,
        day: issueDay,
        fullName: githubRepositories.fullName,
        nodeId: githubIssues.nodeId,
        number: githubIssues.number,
        ownerAvatarUrl: githubRepositories.ownerAvatarUrl,
        repositoryId: githubRepositories.id,
        title: githubIssues.titleSnapshot,
        visibility: githubRepositories.visibility,
      })
      .from(githubIssues)
      .innerJoin(
        githubRepositories,
        eq(githubIssues.repositoryId, githubRepositories.id)
      )
      .where(
        and(
          inArray(issueDay, selectedDays),
          inArray(githubRepositories.visibility, [
            "public",
            "private",
            "internal",
          ])
        )
      )
      .orderBy(desc(githubIssues.createdAt), githubIssues.nodeId)
      .limit(maximumRows + 1),
  ]);
  if (unitRows.length > maximumRows || issueRows.length > maximumRows) {
    throw new Error("A public GitHub activity page exceeds its safe bound.");
  }
  const rowsPerDay = new Map<string, number>();
  for (const day of [
    ...unitRows.map(({ activityDay }) => activityDay),
    ...issueRows.map(({ day }) => day),
  ]) {
    const count = (rowsPerDay.get(day) ?? 0) + 1;
    if (count > MAXIMUM_PUBLIC_ROWS_PER_DAY) {
      throw new Error("A public GitHub activity day exceeds its safe bound.");
    }
    rowsPerDay.set(day, count);
  }

  const unitIds = unitRows.map(({ id }) => id);
  const [currentSummaryRows, fallbackSummaryRows, durableSummaryRows] =
    unitIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          database
            .select({
              outcome: githubWorkUnitSummaryAttempts.outcome,
              state: githubWorkUnitSummaryAttempts.state,
              workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
            })
            .from(githubWorkUnitSummaryAttempts)
            .innerJoin(
              githubWorkUnits,
              and(
                eq(
                  githubWorkUnitSummaryAttempts.workUnitId,
                  githubWorkUnits.id
                ),
                eq(
                  githubWorkUnitSummaryAttempts.outcomeDigest,
                  githubWorkUnits.outcomeDigest
                ),
                eq(
                  githubWorkUnitSummaryAttempts.summaryInputDigest,
                  githubWorkUnits.summaryInputDigest
                ),
                eq(
                  githubWorkUnitSummaryAttempts.attributionMode,
                  githubWorkUnits.attributionMode
                )
              )
            )
            .where(
              and(
                inArray(githubWorkUnitSummaryAttempts.workUnitId, unitIds),
                eq(
                  githubWorkUnitSummaryAttempts.recipe,
                  GITHUB_WORK_UNIT_SUMMARY_RECIPE
                )
              )
            )
            .orderBy(
              githubWorkUnitSummaryAttempts.workUnitId,
              desc(githubWorkUnitSummaryAttempts.revision)
            ),
          database
            .selectDistinctOn([githubWorkUnitSummaryAttempts.workUnitId], {
              outcome: githubWorkUnitSummaryAttempts.outcome,
              workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
            })
            .from(githubWorkUnitSummaryAttempts)
            .innerJoin(
              githubWorkUnits,
              and(
                eq(
                  githubWorkUnitSummaryAttempts.workUnitId,
                  githubWorkUnits.id
                ),
                eq(
                  githubWorkUnitSummaryAttempts.attributionMode,
                  githubWorkUnits.attributionMode
                )
              )
            )
            .where(
              and(
                inArray(githubWorkUnitSummaryAttempts.workUnitId, unitIds),
                eq(githubWorkUnitSummaryAttempts.state, "accepted"),
                isNotNull(githubWorkUnitSummaryAttempts.acceptedAt),
                isNotNull(githubWorkUnitSummaryAttempts.outcome)
              )
            )
            .orderBy(
              githubWorkUnitSummaryAttempts.workUnitId,
              desc(githubWorkUnitSummaryAttempts.revision)
            ),
          database
            .selectDistinctOn([githubWorkUnits.id], {
              outcome: githubWorkUnitAcceptedSummaries.outcome,
              workUnitId: githubWorkUnits.id,
            })
            .from(githubWorkUnitAcceptedSummaries)
            .innerJoin(
              githubWorkUnits,
              and(
                eq(
                  githubWorkUnitAcceptedSummaries.attributionMode,
                  githubWorkUnits.attributionMode
                ),
                or(
                  eq(
                    githubWorkUnitAcceptedSummaries.identityKey,
                    githubWorkUnits.identityKey
                  ),
                  and(
                    eq(
                      githubWorkUnits.attributionMode,
                      "branch_owned_composite"
                    ),
                    eq(
                      githubWorkUnitAcceptedSummaries.repositoryId,
                      githubWorkUnits.repositoryId
                    ),
                    eq(
                      githubWorkUnitAcceptedSummaries.outcomeDigest,
                      githubWorkUnits.outcomeDigest
                    )
                  )
                )
              )
            )
            .where(inArray(githubWorkUnits.id, unitIds))
            .orderBy(
              githubWorkUnits.id,
              sql`CASE WHEN ${githubWorkUnitAcceptedSummaries.identityKey} = ${githubWorkUnits.identityKey} THEN 0 ELSE 1 END`,
              desc(githubWorkUnitAcceptedSummaries.acceptedAt)
            ),
        ]);
  const currentSummaries = new Map<
    string,
    Readonly<{ headline: string; summary: string | null }>
  >();
  const summarizingUnits = new Set<string>();
  for (const summary of currentSummaryRows) {
    if (ACTIVE_SUMMARY_STATES.has(summary.state)) {
      summarizingUnits.add(summary.workUnitId);
    } else if (summary.outcome !== null) {
      const decoded = decodeGitHubWorkUnitSummary(summary.outcome);
      if (decoded !== null) {
        currentSummaries.set(summary.workUnitId, decoded);
      }
    }
  }
  const fallbackSummaries = new Map<
    string,
    Readonly<{ headline: string; summary: string | null }>
  >();
  for (const summary of fallbackSummaryRows) {
    if (summary.outcome !== null) {
      const decoded = decodeGitHubWorkUnitSummary(summary.outcome);
      if (decoded !== null) {
        fallbackSummaries.set(summary.workUnitId, decoded);
      }
    }
  }
  for (const summary of durableSummaryRows) {
    if (!fallbackSummaries.has(summary.workUnitId)) {
      const decoded = decodeGitHubWorkUnitSummary(summary.outcome);
      if (decoded !== null) {
        fallbackSummaries.set(summary.workUnitId, decoded);
      }
    }
  }

  const workUnits = unitRows.map((row): PublicGitHubWorkUnitRow => {
    const repository = checkedPublicRepository({
      fullName: row.fullName,
      id: row.repositoryId,
      ownerAvatarUrl: row.ownerAvatarUrl,
      visibility: row.visibility,
    });
    const kind = publicWorkUnitKind(row.kind);
    let destination;
    if (repository.baseUrl === null) {
      destination = null;
    } else if (kind === "pull-request") {
      if (
        row.pullRequestNumber === null ||
        !Number.isSafeInteger(row.pullRequestNumber) ||
        row.pullRequestNumber < 1
      ) {
        throw new Error("A public pull-request work unit has no destination.");
      }
      destination = {
        label: `Open pull request ${String(row.pullRequestNumber)} on GitHub`,
        url: `${repository.baseUrl}/pull/${String(row.pullRequestNumber)}`,
      };
    } else {
      if (
        row.newestCommitRepositoryId !== row.repositoryId ||
        !SHA.test(row.newestCommitSha)
      ) {
        throw new Error("A public commit work unit has no destination.");
      }
      destination = {
        label: `Open commit ${row.newestCommitSha.slice(0, 7)} on GitHub`,
        url: `${repository.baseUrl}/commit/${row.newestCommitSha}`,
      };
    }
    const firstDay = row.firstActivityAt.toISOString().slice(0, 10);
    const lastDay = row.lastActivityAt.toISOString().slice(0, 10);
    const summary =
      currentSummaries.get(row.id) ?? fallbackSummaries.get(row.id);
    return {
      activityAt: row.activityAt.toISOString(),
      day: row.activityDay,
      destination,
      facts: {
        additions: row.additions,
        dateRange:
          firstDay === lastDay ? null : { end: lastDay, start: firstDay },
        deletions: row.deletions,
        languages: row.languages?.map(({ label }) => label) ?? null,
        ownedCommitCount: row.memberCount,
        uniqueFileCount: row.fileCount,
      },
      id: row.identityKey,
      headline: summary?.headline ?? null,
      kind,
      repository: repository.projection,
      summarizing:
        summarizingUnits.has(row.id) ||
        (summariesAreRunning &&
          row.summaryEvaluationDigest !== null &&
          row.summaryEvaluationDigest !== row.summaryEvaluatedDigest),
      summary: summary?.summary ?? null,
    };
  });
  const issues = issueRows.map((row): PublicGitHubIssueRow => {
    const repository = checkedPublicRepository({
      fullName: row.fullName,
      id: row.repositoryId,
      ownerAvatarUrl: row.ownerAvatarUrl,
      visibility: row.visibility,
    });
    if (!Number.isSafeInteger(row.number) || row.number < 1) {
      throw new Error("A public GitHub issue has no destination.");
    }
    return {
      activityAt: row.activityAt.toISOString(),
      day: row.day,
      destination:
        repository.baseUrl === null
          ? null
          : {
              label: `Open issue ${String(row.number)} on GitHub`,
              url: `${repository.baseUrl}/issues/${String(row.number)}`,
            },
      id: `issue:${row.nodeId}`,
      repository: repository.projection,
      title: row.title,
    };
  });
  return { issues, workUnits };
};

const readPublicGitHubActivityPageInTransaction = async (
  database: GitHubActivityDatabase,
  cursor: GitHubActivityCursor | null,
  pageSize: number
): Promise<PublicGitHubActivityPage> => {
  const { head, orderingRevision } = await readPublicHead(database);
  if (cursor !== null && cursor.orderingRevision !== orderingRevision) {
    throw new GitHubActivityOrderingChangedError();
  }
  const { hasNextPage, selectedDays } = await readAvailableDays(
    database,
    cursor,
    pageSize
  );
  const { issues, workUnits } = await readPublicRows(
    database,
    selectedDays,
    head.summarizing
  );
  const days = buildPublicGitHubActivityDays({
    days: selectedDays,
    issues,
    workUnits,
  });
  const lastDay = selectedDays.at(-1);
  return {
    days,
    head,
    nextCursor:
      hasNextPage && lastDay !== undefined
        ? encodeGitHubActivityCursor({
            beforeDay: lastDay,
            orderingRevision,
            version: 2,
          })
        : null,
    orderingRevision,
  };
};

export const readPublicGitHubActivityPage = async (
  cursor: GitHubActivityCursor | null,
  limit = PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
): Promise<PublicGitHubActivityPage> => {
  const pageSize = checkedPageSize(limit);
  return await getDatabase().transaction(
    async (transaction) =>
      await readPublicGitHubActivityPageInTransaction(
        transaction,
        cursor,
        pageSize
      ),
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
};
