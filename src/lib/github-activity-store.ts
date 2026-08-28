import { createHash } from "node:crypto";

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubCommits,
  githubIssues,
  githubPublicActivities,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestVersions,
  githubRepositories,
  githubSummaryAttempts,
} from "@/db/schema";
import { encodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  publicLanguageIconUrl,
  publicRepositoryDisplay,
  publicRepositoryEntityDisplay,
} from "@/lib/github-activity-display";
import { DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD } from "@/lib/github-activity-public-summary";
import type { PublicCommitLanguage } from "@/lib/github-activity-public-summary";
import type {
  PublicGitHubActivityCommit,
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityPage,
  PublicGitHubActivityRepository,
} from "@/lib/github-activity-types";

export const PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE = 5;
const MAXIMUM_PUBLIC_DAY_PAGE_SIZE = 14;
const MAXIMUM_PUBLIC_ACTIVITIES_PER_DAY = 1000;

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

const activityDay = sql<string>`to_char(${githubPublicActivities.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

const commitKey = (repositoryId: string, sha: string) =>
  `${repositoryId}:${sha}`;

const publicPullRequestSliceId = (nodeId: string, day: string) =>
  `pr-${createHash("sha256")
    .update(nodeId)
    .update("\0")
    .update(day)
    .digest("base64url")
    .slice(0, 22)}`;

const checkedTotal = (left: number, right: number) => {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new TypeError("The public GitHub activity total is outside range.");
  }
  return total;
};

interface RepositoryProjection {
  fullName: string;
  id: string;
  ownerAvatarUrl: string | null;
  ownerLogin: string | null;
  visibility: string | null;
}

const publicRepository = (
  repository: RepositoryProjection | undefined,
  destination: { sha: string } | { url: string }
): PublicGitHubActivityRepository => {
  if (
    repository === undefined ||
    repository.ownerLogin === null ||
    repository.visibility === null
  ) {
    return { avatarUrl: null, label: null, url: null };
  }
  const privateRepository = repository.visibility !== "public";
  const display =
    "sha" in destination
      ? publicRepositoryDisplay({
          ownerLogin: repository.ownerLogin,
          private: privateRepository,
          repository: repository.fullName,
          sha: destination.sha,
        })
      : publicRepositoryEntityDisplay({
          ownerLogin: repository.ownerLogin,
          private: privateRepository,
          repository: repository.fullName,
          url: destination.url,
        });
  return {
    avatarUrl: safeAvatarUrl(repository.ownerAvatarUrl),
    label: display.repositoryLabel,
    url: display.url,
  };
};

interface CommitSummaryProjection {
  headline: string;
  short: string;
}

interface CommitProjection {
  additions: number | null;
  changedFiles: number | null;
  committedAt: Date;
  committerAt: Date | null;
  deletions: number | null;
  languages: readonly PublicCommitLanguage[] | null;
  providerFileCapReached: boolean;
  repositoryId: string;
  sha: string;
  substantiveLoc: number | null;
}

const publicCommit = (
  activityPublicId: string,
  commit: CommitProjection,
  summaries: ReadonlyMap<string, CommitSummaryProjection>
): PublicGitHubActivityCommit => {
  const summary = summaries.get(activityPublicId);
  if (
    commit.additions === null ||
    commit.changedFiles === null ||
    commit.deletions === null ||
    commit.substantiveLoc === null ||
    summary === undefined
  ) {
    throw new Error("A published GitHub commit is incomplete.");
  }
  const showDetail =
    commit.providerFileCapReached ||
    commit.substantiveLoc > DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD;
  return {
    additions: commit.additions,
    changedFiles: commit.changedFiles,
    committedAt: (commit.committerAt ?? commit.committedAt).toISOString(),
    deletions: commit.deletions,
    headline: summary.headline,
    id: activityPublicId,
    languages: (commit.languages ?? []).map((language) => ({
      ...language,
      iconUrl: publicLanguageIconUrl(language.id),
    })),
    providerFileCapReached: commit.providerFileCapReached,
    summary: showDetail ? summary.short : null,
  };
};

interface PullRequestAssociation {
  nodeId: string;
  position: number;
  repositoryId: string;
  title: string;
  url: string;
}

interface PullRequestProjection {
  mergedAt: Date | null;
  nodeId: string;
  repositoryId: string;
  state: string;
  title: string;
  url: string;
}

interface IssueProjection {
  nodeId: string;
  repositoryId: string;
  title: string;
  url: string;
}

interface PullRequestGroup {
  commits: {
    commit: PublicGitHubActivityCommit;
    position: number;
  }[];
  nodeId: string;
  occurredAt: string;
  repositoryId: string;
  title: string;
  url: string;
}

interface DayAccumulator {
  additions: number;
  deletions: number;
  issuesOpened: number;
  items: PublicGitHubActivityItem[];
  pullRequestGroups: Map<string, PullRequestGroup>;
  pullRequestsMerged: number;
  repositories: Set<string>;
}

const emptyDay = (): DayAccumulator => ({
  additions: 0,
  deletions: 0,
  issuesOpened: 0,
  items: [],
  pullRequestGroups: new Map(),
  pullRequestsMerged: 0,
  repositories: new Set(),
});

const orderedItems = (items: readonly PublicGitHubActivityItem[]) =>
  [...items].toSorted((left, right) => {
    const byTime = right.occurredAt.localeCompare(left.occurredAt);
    return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
  });

type PublicActivityKind = "commit" | "issue" | "pull_request";

const isPublicActivityKind = (value: unknown): value is PublicActivityKind =>
  value === "commit" || value === "issue" || value === "pull_request";

interface CheckedActivityRow {
  kind: PublicActivityKind;
  occurredAt: Date;
  publicId: string;
  repositoryId: string;
  revision: number;
  sourceNodeId: string;
}

type GitHubActivityDatabase = ReturnType<typeof getDatabase>;

const readCheckedActivityRows = async (
  database: GitHubActivityDatabase,
  stableActivity: SQL | undefined,
  selectedDays: readonly string[],
  pageSize: number
): Promise<readonly CheckedActivityRow[]> => {
  const rawActivityRows = await database
    .select({
      kind: githubPublicActivities.kind,
      occurredAt: githubPublicActivities.occurredAt,
      publicId: githubPublicActivities.publicId,
      repositoryId: githubPublicActivities.repositoryId,
      revision: githubPublicActivities.revision,
      sourceNodeId: githubPublicActivities.sourceNodeId,
    })
    .from(githubPublicActivities)
    .where(and(stableActivity, inArray(activityDay, selectedDays)))
    .orderBy(
      desc(githubPublicActivities.occurredAt),
      desc(githubPublicActivities.publicId)
    )
    .limit(pageSize * MAXIMUM_PUBLIC_ACTIVITIES_PER_DAY + 1);
  if (rawActivityRows.length === 0) {
    throw new Error("A published GitHub activity day has no activities.");
  }
  if (rawActivityRows.length > pageSize * MAXIMUM_PUBLIC_ACTIVITIES_PER_DAY) {
    throw new Error("The public GitHub activity page exceeds its safe bound.");
  }

  const activityRows: CheckedActivityRow[] = rawActivityRows.map((row) => {
    if (!isPublicActivityKind(row.kind)) {
      throw new Error("A published GitHub activity has an invalid kind.");
    }
    return { ...row, kind: row.kind };
  });
  const activitiesPerDay = new Map<string, number>();
  for (const activity of activityRows) {
    const day = activity.occurredAt.toISOString().slice(0, 10);
    const count = (activitiesPerDay.get(day) ?? 0) + 1;
    if (count > MAXIMUM_PUBLIC_ACTIVITIES_PER_DAY) {
      throw new Error("A public GitHub activity day exceeds its safe bound.");
    }
    activitiesPerDay.set(day, count);
  }
  return activityRows;
};

interface ActivityProjectionSources {
  commits: ReadonlyMap<string, CommitProjection>;
  issues: ReadonlyMap<string, IssueProjection>;
  primaryAssociations: ReadonlyMap<string, PullRequestAssociation>;
  pullRequests: ReadonlyMap<string, PullRequestProjection>;
  repositories: ReadonlyMap<string, RepositoryProjection>;
  summaries: ReadonlyMap<string, CommitSummaryProjection>;
}

const addCommitActivity = (
  accumulator: DayAccumulator,
  activity: CheckedActivityRow,
  sources: ActivityProjectionSources
) => {
  const key = commitKey(activity.repositoryId, activity.sourceNodeId);
  const commit = sources.commits.get(key);
  if (commit === undefined) {
    throw new Error("A published GitHub commit source is missing.");
  }
  const projected = publicCommit(activity.publicId, commit, sources.summaries);
  accumulator.additions = checkedTotal(
    accumulator.additions,
    projected.additions
  );
  accumulator.deletions = checkedTotal(
    accumulator.deletions,
    projected.deletions
  );
  const association = sources.primaryAssociations.get(key);
  if (association === undefined) {
    accumulator.repositories.add(activity.repositoryId);
    accumulator.items.push({
      commit: projected,
      id: activity.publicId,
      kind: "commit",
      occurredAt: activity.occurredAt.toISOString(),
      repository: publicRepository(
        sources.repositories.get(activity.repositoryId),
        { sha: commit.sha }
      ),
    });
    return;
  }
  accumulator.repositories.add(association.repositoryId);
  const existing = accumulator.pullRequestGroups.get(association.nodeId);
  if (existing === undefined) {
    accumulator.pullRequestGroups.set(association.nodeId, {
      commits: [{ commit: projected, position: association.position }],
      nodeId: association.nodeId,
      occurredAt: activity.occurredAt.toISOString(),
      repositoryId: association.repositoryId,
      title: association.title,
      url: association.url,
    });
    return;
  }
  existing.commits.push({
    commit: projected,
    position: association.position,
  });
  if (activity.occurredAt.toISOString() > existing.occurredAt) {
    existing.occurredAt = activity.occurredAt.toISOString();
  }
};

const addPullRequestActivity = (
  accumulator: DayAccumulator,
  activity: CheckedActivityRow,
  sources: ActivityProjectionSources
) => {
  const pullRequest = sources.pullRequests.get(activity.sourceNodeId);
  if (
    pullRequest === undefined ||
    pullRequest.state !== "merged" ||
    pullRequest.mergedAt === null
  ) {
    throw new Error("A published pull-request milestone is incomplete.");
  }
  accumulator.pullRequestsMerged += 1;
  accumulator.repositories.add(pullRequest.repositoryId);
  accumulator.items.push({
    id: activity.publicId,
    kind: "pull-request-merged",
    occurredAt: activity.occurredAt.toISOString(),
    repository: publicRepository(
      sources.repositories.get(pullRequest.repositoryId),
      { url: pullRequest.url }
    ),
    title: pullRequest.title,
  });
};

const addIssueActivity = (
  accumulator: DayAccumulator,
  activity: CheckedActivityRow,
  sources: ActivityProjectionSources
) => {
  const issue = sources.issues.get(activity.sourceNodeId);
  if (issue === undefined) {
    throw new Error("A published issue milestone is incomplete.");
  }
  accumulator.issuesOpened += 1;
  accumulator.repositories.add(issue.repositoryId);
  accumulator.items.push({
    id: activity.publicId,
    kind: "issue-opened",
    occurredAt: activity.occurredAt.toISOString(),
    repository: publicRepository(sources.repositories.get(issue.repositoryId), {
      url: issue.url,
    }),
    title: issue.title,
  });
};

const buildPublicActivityDays = (
  selectedDays: readonly string[],
  activityRows: readonly CheckedActivityRow[],
  sources: ActivityProjectionSources
): readonly PublicGitHubActivityDay[] => {
  const accumulators = new Map(
    selectedDays.map((day) => [day, emptyDay()] as const)
  );
  for (const activity of activityRows) {
    const day = activity.occurredAt.toISOString().slice(0, 10);
    const accumulator = accumulators.get(day);
    if (accumulator === undefined) {
      throw new Error("A GitHub activity escaped its selected UTC day.");
    }
    if (activity.kind === "commit") {
      addCommitActivity(accumulator, activity, sources);
    } else if (activity.kind === "pull_request") {
      addPullRequestActivity(accumulator, activity, sources);
    } else {
      addIssueActivity(accumulator, activity, sources);
    }
  }

  return selectedDays.map((day) => {
    const accumulator = accumulators.get(day);
    if (accumulator === undefined) {
      throw new Error("The public GitHub activity day is missing.");
    }
    for (const group of accumulator.pullRequestGroups.values()) {
      const commits = group.commits
        .toSorted((left, right) => {
          const byPosition = left.position - right.position;
          return byPosition === 0
            ? left.commit.committedAt.localeCompare(right.commit.committedAt)
            : byPosition;
        })
        .map(({ commit }) => commit);
      accumulator.items.push({
        commits,
        id: publicPullRequestSliceId(group.nodeId, day),
        kind: "pull-request-commits",
        occurredAt: group.occurredAt,
        repository: publicRepository(
          sources.repositories.get(group.repositoryId),
          { url: group.url }
        ),
        title: group.title,
      });
    }
    return {
      day,
      items: orderedItems(accumulator.items),
      totals: {
        additions: accumulator.additions,
        deletions: accumulator.deletions,
        issuesOpened: accumulator.issuesOpened,
        pullRequestsMerged: accumulator.pullRequestsMerged,
        repositories: accumulator.repositories.size,
      },
    };
  });
};

interface ActivitySourceIds {
  commitActivityPublicIds: readonly string[];
  issueNodeIds: readonly string[];
  pullRequestNodeIds: readonly string[];
}

const readActivitySourceRows = async (
  database: GitHubActivityDatabase,
  ids: ActivitySourceIds
) =>
  await Promise.all([
    ids.commitActivityPublicIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            additions: githubCommits.additions,
            changedFiles: githubCommits.changedFiles,
            committedAt: githubCommits.committedAt,
            committerAt: githubCommits.committerAt,
            deletions: githubCommits.deletions,
            languages: githubCommits.languages,
            providerFileCapReached: githubCommits.providerFileCapReached,
            repositoryId: githubCommits.repositoryId,
            sha: githubCommits.sha,
            substantiveLoc: githubCommits.substantiveLoc,
          })
          .from(githubCommits)
          .innerJoin(
            githubPublicActivities,
            and(
              eq(githubPublicActivities.kind, "commit"),
              eq(
                githubPublicActivities.publicId,
                githubCommits.activityPublicId
              ),
              eq(
                githubPublicActivities.repositoryId,
                githubCommits.repositoryId
              ),
              eq(githubPublicActivities.sourceNodeId, githubCommits.sha)
            )
          )
          .where(
            inArray(
              githubPublicActivities.publicId,
              ids.commitActivityPublicIds
            )
          ),
    ids.pullRequestNodeIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            mergedAt: githubPullRequests.mergedAt,
            nodeId: githubPullRequests.nodeId,
            repositoryId: githubPullRequests.repositoryId,
            state: githubPullRequests.state,
            title: githubPullRequests.title,
            url: githubPullRequests.url,
          })
          .from(githubPullRequests)
          .where(inArray(githubPullRequests.nodeId, ids.pullRequestNodeIds)),
    ids.issueNodeIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            nodeId: githubIssues.nodeId,
            repositoryId: githubIssues.repositoryId,
            title: githubIssues.titleSnapshot,
            url: githubIssues.urlSnapshot,
          })
          .from(githubIssues)
          .where(inArray(githubIssues.nodeId, ids.issueNodeIds)),
    ids.commitActivityPublicIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            activityPublicId: githubSummaryAttempts.activityPublicId,
            headline: githubSummaryAttempts.summaryHeadline,
            revision: githubSummaryAttempts.revision,
            short: githubSummaryAttempts.summaryShort,
          })
          .from(githubSummaryAttempts)
          .where(
            and(
              inArray(
                githubSummaryAttempts.activityPublicId,
                ids.commitActivityPublicIds
              ),
              eq(githubSummaryAttempts.state, "complete")
            )
          )
          .orderBy(
            githubSummaryAttempts.activityPublicId,
            desc(githubSummaryAttempts.revision)
          ),
  ]);

// oxlint-disable-next-line complexity -- Projection validation keeps every activity kind fail-closed.
export const readPublicGitHubActivityPage = async (
  cursor: GitHubActivityCursor | null,
  limit = PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
): Promise<PublicGitHubActivityPage> => {
  const pageSize = checkedPageSize(limit);
  const snapshotAt = cursor?.snapshotAt ?? new Date().toISOString();
  const snapshotDate = new Date(snapshotAt);
  const beforeDate =
    cursor === null ? null : new Date(`${cursor.beforeDay}T00:00:00.000Z`);
  const stableActivity = and(
    isNotNull(githubPublicActivities.publishedAt),
    lte(githubPublicActivities.publishedAt, snapshotDate),
    isNull(githubPublicActivities.hiddenAt),
    isNull(githubPublicActivities.canonicalPublicId),
    sql<boolean>`(
      ${githubPublicActivities.kind} <> 'commit'
      OR EXISTS (
        SELECT 1
        FROM ${githubCommits}
        WHERE ${githubCommits.activityPublicId} = ${githubPublicActivities.publicId}
          AND ${githubCommits.repositoryId} = ${githubPublicActivities.repositoryId}
          AND ${githubCommits.sha} = ${githubPublicActivities.sourceNodeId}
          AND ${githubCommits.parentShas} IS NOT NULL
          AND jsonb_array_length(${githubCommits.parentShas}) <= 1
      )
    )`,
    beforeDate === null
      ? undefined
      : lt(githubPublicActivities.occurredAt, beforeDate)
  );
  const database = getDatabase();
  const availableDays = await database
    .selectDistinct({ day: activityDay })
    .from(githubPublicActivities)
    .where(stableActivity)
    .orderBy(desc(activityDay))
    .limit(pageSize + 1);
  const hasNextPage = availableDays.length > pageSize;
  const selectedDays = availableDays.slice(0, pageSize).map(({ day }) => day);
  if (selectedDays.length === 0) {
    return { days: [], nextCursor: null, snapshotAt };
  }

  const activityRows = await readCheckedActivityRows(
    database,
    stableActivity,
    selectedDays,
    pageSize
  );

  const commitActivityRows = activityRows.filter(
    (row) => row.kind === "commit"
  );
  const pullRequestActivityRows = activityRows.filter(
    (row) => row.kind === "pull_request"
  );
  const issueActivityRows = activityRows.filter((row) => row.kind === "issue");

  const pullRequestNodeIds = [
    ...new Set(pullRequestActivityRows.map((row) => row.sourceNodeId)),
  ];
  const issueNodeIds = [
    ...new Set(issueActivityRows.map((row) => row.sourceNodeId)),
  ];
  const commitActivityPublicIds = commitActivityRows.map((row) => row.publicId);

  const [commitRows, pullRequestRows, issueRows, summaryRows] =
    await readActivitySourceRows(database, {
      commitActivityPublicIds,
      issueNodeIds,
      pullRequestNodeIds,
    });

  const commits = new Map(
    commitRows.map((commit) => [
      commitKey(commit.repositoryId, commit.sha),
      commit,
    ])
  );
  const pullRequests = new Map(
    pullRequestRows.map((pullRequest) => [pullRequest.nodeId, pullRequest])
  );
  const issues = new Map(issueRows.map((issue) => [issue.nodeId, issue]));
  const publishedRevisions = new Map(
    activityRows.map((activity) => [activity.publicId, activity.revision])
  );
  const summaries = new Map<string, CommitSummaryProjection>();
  for (const summary of summaryRows) {
    const publishedRevision = publishedRevisions.get(summary.activityPublicId);
    if (
      publishedRevision !== undefined &&
      summary.revision <= publishedRevision &&
      !summaries.has(summary.activityPublicId) &&
      summary.headline !== null &&
      summary.short !== null
    ) {
      summaries.set(summary.activityPublicId, {
        headline: summary.headline,
        short: summary.short,
      });
    }
  }

  const primaryAssociations = new Map<string, PullRequestAssociation>();
  if (commitActivityPublicIds.length > 0) {
    const selectedCommitKeys = new Map(
      commitActivityRows.map((activity) => [
        activity.publicId,
        commitKey(activity.repositoryId, activity.sourceNodeId),
      ])
    );
    const associationSelection = {
      activityPublicId: githubPublicActivities.publicId,
      createdAt: githubPullRequests.createdAt,
      nodeId: githubPullRequests.nodeId,
      position: githubPullRequestMemberships.position,
      repositoryId: githubPullRequests.repositoryId,
      title: githubPullRequests.title,
      url: githubPullRequests.url,
    };
    const currentCompleteMembership = and(
      eq(githubPullRequestMemberships.versionId, githubPullRequestVersions.id),
      eq(githubPullRequestVersions.isCurrent, true),
      eq(githubPullRequestVersions.membershipComplete, true)
    );
    const [directAssociations, aliasAssociations] = await Promise.all([
      database
        .select(associationSelection)
        .from(githubPullRequestMemberships)
        .innerJoin(githubPullRequestVersions, currentCompleteMembership)
        .innerJoin(
          githubPullRequests,
          eq(
            githubPullRequestVersions.pullRequestNodeId,
            githubPullRequests.nodeId
          )
        )
        .innerJoin(
          githubPublicActivities,
          and(
            eq(githubPublicActivities.kind, "commit"),
            eq(
              githubPublicActivities.repositoryId,
              githubPullRequestMemberships.commitRepositoryId
            ),
            eq(
              githubPublicActivities.sourceNodeId,
              githubPullRequestMemberships.commitSha
            )
          )
        )
        .where(
          inArray(githubPublicActivities.publicId, commitActivityPublicIds)
        ),
      database
        .select({
          ...associationSelection,
          activityPublicId: githubPublicActivities.canonicalPublicId,
        })
        .from(githubPullRequestMemberships)
        .innerJoin(githubPullRequestVersions, currentCompleteMembership)
        .innerJoin(
          githubPullRequests,
          eq(
            githubPullRequestVersions.pullRequestNodeId,
            githubPullRequests.nodeId
          )
        )
        .innerJoin(
          githubPublicActivities,
          and(
            eq(githubPublicActivities.kind, "commit"),
            eq(
              githubPublicActivities.repositoryId,
              githubPullRequestMemberships.commitRepositoryId
            ),
            eq(
              githubPublicActivities.sourceNodeId,
              githubPullRequestMemberships.commitSha
            )
          )
        )
        .where(
          inArray(
            githubPublicActivities.canonicalPublicId,
            commitActivityPublicIds
          )
        ),
    ]);
    const associationRows = [
      ...directAssociations,
      ...aliasAssociations,
    ].toSorted((left, right) => {
      const byCreatedAt = left.createdAt.getTime() - right.createdAt.getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }
      const byNodeId = left.nodeId.localeCompare(right.nodeId);
      return byNodeId === 0 ? left.position - right.position : byNodeId;
    });
    for (const association of associationRows) {
      if (association.activityPublicId === null) {
        continue;
      }
      const key = selectedCommitKeys.get(association.activityPublicId);
      if (key === undefined || primaryAssociations.has(key)) {
        continue;
      }
      primaryAssociations.set(key, association);
    }
  }

  const repositoryIds = new Set(activityRows.map((row) => row.repositoryId));
  for (const association of primaryAssociations.values()) {
    repositoryIds.add(association.repositoryId);
  }
  const repositoryRows = await database
    .select({
      fullName: githubRepositories.fullName,
      id: githubRepositories.id,
      ownerAvatarUrl: githubRepositories.ownerAvatarUrl,
      ownerLogin: githubRepositories.ownerLogin,
      visibility: githubRepositories.visibility,
    })
    .from(githubRepositories)
    .where(inArray(githubRepositories.id, [...repositoryIds]));
  const repositories = new Map(
    repositoryRows.map((repository) => [repository.id, repository])
  );

  const days = buildPublicActivityDays(selectedDays, activityRows, {
    commits,
    issues,
    primaryAssociations,
    pullRequests,
    repositories,
    summaries,
  });
  const lastDay = selectedDays.at(-1);
  const nextCursor =
    hasNextPage && lastDay !== undefined
      ? encodeGitHubActivityCursor({
          beforeDay: lastDay,
          snapshotAt,
          version: 1,
        })
      : null;
  return { days, nextCursor, snapshotAt };
};
