import { and, desc, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { githubCommits } from "@/db/schema";
import { encodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  publicLanguageIconUrl,
  publicRepositoryDisplay,
} from "@/lib/github-activity-display";
import { DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD } from "@/lib/github-activity-public-summary";
import type { PublicCommitLanguage } from "@/lib/github-activity-public-summary";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";

export const PUBLIC_GITHUB_ACTIVITY_PAGE_SIZE = 18;
const MAXIMUM_PUBLIC_PAGE_SIZE = 50;

export interface ClaimedGitHubActivityCommit {
  author: TrackedGitHubAccount;
  committedAt: string;
  message: string;
  repository: string;
  repositoryId: string;
  sha: string;
}

export interface CompletedGitHubActivity {
  activityPublicId: string;
  additions: number;
  changedFiles: number;
  deletions: number;
  languages: readonly PublicCommitLanguage[];
  providerFileCapReached: boolean;
  repository: string;
  repositoryOwnerAvatarUrl: string | null;
  repositoryOwnerLogin: string;
  repositoryOwnerType: "Organization" | "User";
  repositoryPrivate: boolean;
  substantiveLoc: number;
  summaryHeadline: string;
  summaryInputHash: string;
  summaryModel: string;
  summaryRecipe: string;
  summaryShort: string;
}

export interface GitHubActivityCounters {
  additions: number;
  changedFiles: number;
  deletions: number;
  languages: readonly PublicCommitLanguage[];
  providerFileCapReached: boolean;
  substantiveLoc: number;
}

export interface GitHubActivitySummaryUpdate {
  summaryHeadline: string;
  summaryInputHash: string;
  summaryModel: string;
  summaryRecipe: string;
  summaryShort: string;
}

const commitIdentity = (commit: { repositoryId: string; sha: string }) =>
  and(
    eq(githubCommits.repositoryId, commit.repositoryId),
    eq(githubCommits.sha, commit.sha)
  );

export const claimPendingGitHubActivity = async (
  limit: number
): Promise<readonly ClaimedGitHubActivityCommit[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("The GitHub activity claim limit is invalid.");
  }

  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        author: githubCommits.author,
        committedAt: githubCommits.committedAt,
        message: githubCommits.message,
        repository: githubCommits.repository,
        repositoryId: githubCommits.repositoryId,
        sha: githubCommits.sha,
      })
      .from(githubCommits)
      .where(isNull(githubCommits.summaryAttemptedAt))
      .orderBy(desc(githubCommits.committedAt), desc(githubCommits.sha))
      .limit(limit);

    const claimed: ClaimedGitHubActivityCommit[] = [];
    for (const candidate of candidates) {
      const [updated] = await transaction
        .update(githubCommits)
        .set({ summaryAttemptedAt: new Date(), summaryError: "processing" })
        .where(
          and(
            commitIdentity(candidate),
            isNull(githubCommits.summaryAttemptedAt)
          )
        )
        .returning({ repositoryId: githubCommits.repositoryId });
      if (updated !== undefined) {
        claimed.push({
          ...candidate,
          author: candidate.author as TrackedGitHubAccount,
          committedAt: candidate.committedAt.toISOString(),
        });
      }
    }
    return claimed;
  });
};

export const completeGitHubActivity = async (
  commit: ClaimedGitHubActivityCommit,
  activity: CompletedGitHubActivity
) => {
  const [updated] = await getDatabase()
    .update(githubCommits)
    .set({
      activityPublicId: activity.activityPublicId,
      additions: activity.additions,
      changedFiles: activity.changedFiles,
      deletions: activity.deletions,
      languages: activity.languages,
      providerFileCapReached: activity.providerFileCapReached,
      repository: activity.repository,
      repositoryOwnerAvatarUrl: activity.repositoryOwnerAvatarUrl,
      repositoryOwnerLogin: activity.repositoryOwnerLogin,
      repositoryOwnerType: activity.repositoryOwnerType,
      repositoryPrivate: activity.repositoryPrivate,
      substantiveLoc: activity.substantiveLoc,
      summaryError: null,
      summaryHeadline: activity.summaryHeadline,
      summaryInputHash: activity.summaryInputHash,
      summaryModel: activity.summaryModel,
      summaryRecipe: activity.summaryRecipe,
      summaryShort: activity.summaryShort,
    })
    .where(
      and(
        commitIdentity(commit),
        isNotNull(githubCommits.summaryAttemptedAt),
        isNull(githubCommits.summaryHeadline)
      )
    )
    .returning({ repositoryId: githubCommits.repositoryId });
  if (updated === undefined) {
    throw new Error("The claimed GitHub activity commit changed.");
  }
};

export const failGitHubActivity = async (
  commit: ClaimedGitHubActivityCommit,
  errorCode: string
) => {
  await getDatabase()
    .update(githubCommits)
    .set({ summaryError: errorCode.slice(0, 80) })
    .where(
      and(
        commitIdentity(commit),
        isNotNull(githubCommits.summaryAttemptedAt),
        isNull(githubCommits.summaryHeadline)
      )
    );
};

export const readCompletedGitHubActivityCommits = async (): Promise<
  readonly ClaimedGitHubActivityCommit[]
> => {
  const rows = await getDatabase()
    .select({
      author: githubCommits.author,
      committedAt: githubCommits.committedAt,
      message: githubCommits.message,
      repository: githubCommits.repository,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .where(isNotNull(githubCommits.summaryHeadline))
    .orderBy(desc(githubCommits.committedAt), desc(githubCommits.sha));
  return rows.map((row) => ({
    ...row,
    author: row.author as TrackedGitHubAccount,
    committedAt: row.committedAt.toISOString(),
  }));
};

export const readGitHubActivityCommitsWithStaleSummary = async (
  currentRecipe: string
): Promise<readonly ClaimedGitHubActivityCommit[]> => {
  if (currentRecipe.trim().length === 0) {
    throw new Error("The current GitHub activity summary recipe is empty.");
  }
  const rows = await getDatabase()
    .select({
      author: githubCommits.author,
      committedAt: githubCommits.committedAt,
      message: githubCommits.message,
      repository: githubCommits.repository,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .where(
      and(
        isNotNull(githubCommits.summaryHeadline),
        isNotNull(githubCommits.summaryShort),
        or(
          isNull(githubCommits.summaryRecipe),
          ne(githubCommits.summaryRecipe, currentRecipe)
        )
      )
    )
    .orderBy(desc(githubCommits.committedAt), desc(githubCommits.sha));
  return rows.map((row) => ({
    ...row,
    author: row.author as TrackedGitHubAccount,
    committedAt: row.committedAt.toISOString(),
  }));
};

export const updateGitHubActivitySummary = async (
  commit: ClaimedGitHubActivityCommit,
  summary: GitHubActivitySummaryUpdate
) => {
  const [updated] = await getDatabase()
    .update(githubCommits)
    .set({
      ...summary,
      summaryAttemptedAt: new Date(),
      summaryError: null,
    })
    .where(
      and(
        commitIdentity(commit),
        isNotNull(githubCommits.summaryHeadline),
        isNotNull(githubCommits.summaryShort)
      )
    )
    .returning({ repositoryId: githubCommits.repositoryId });
  if (updated === undefined) {
    throw new Error("The completed GitHub activity summary changed.");
  }
};

export const updateGitHubActivityCounters = async (
  commit: ClaimedGitHubActivityCommit,
  counters: GitHubActivityCounters
) => {
  const [updated] = await getDatabase()
    .update(githubCommits)
    .set(counters)
    .where(
      and(
        commitIdentity(commit),
        isNotNull(githubCommits.summaryHeadline),
        isNotNull(githubCommits.summaryShort)
      )
    )
    .returning({ repositoryId: githubCommits.repositoryId });
  if (updated === undefined) {
    throw new Error("The completed GitHub activity commit changed.");
  }
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

const checkedPageSize = (limit: number) => {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAXIMUM_PUBLIC_PAGE_SIZE
  ) {
    throw new RangeError("The GitHub activity page size is invalid.");
  }
  return limit;
};

export const readPublicGitHubActivityPage = async (
  cursor: GitHubActivityCursor | null,
  limit = PUBLIC_GITHUB_ACTIVITY_PAGE_SIZE
): Promise<PublicGitHubActivityPage> => {
  const pageSize = checkedPageSize(limit);
  const cursorCondition =
    cursor === null
      ? undefined
      : or(
          lt(githubCommits.committedAt, new Date(cursor.committedAt)),
          and(
            eq(githubCommits.committedAt, new Date(cursor.committedAt)),
            lt(githubCommits.activityPublicId, cursor.publicId)
          )
        );
  const rows = await getDatabase()
    .select({
      activityPublicId: githubCommits.activityPublicId,
      additions: githubCommits.additions,
      changedFiles: githubCommits.changedFiles,
      committedAt: githubCommits.committedAt,
      deletions: githubCommits.deletions,
      languages: githubCommits.languages,
      providerFileCapReached: githubCommits.providerFileCapReached,
      repository: githubCommits.repository,
      repositoryOwnerAvatarUrl: githubCommits.repositoryOwnerAvatarUrl,
      repositoryOwnerLogin: githubCommits.repositoryOwnerLogin,
      repositoryPrivate: githubCommits.repositoryPrivate,
      sha: githubCommits.sha,
      substantiveLoc: githubCommits.substantiveLoc,
      summaryHeadline: githubCommits.summaryHeadline,
      summaryShort: githubCommits.summaryShort,
    })
    .from(githubCommits)
    .where(
      and(
        isNotNull(githubCommits.activityPublicId),
        isNotNull(githubCommits.summaryHeadline),
        isNotNull(githubCommits.summaryShort),
        isNotNull(githubCommits.repositoryOwnerLogin),
        isNotNull(githubCommits.repositoryPrivate),
        isNotNull(githubCommits.additions),
        isNotNull(githubCommits.deletions),
        isNotNull(githubCommits.changedFiles),
        isNotNull(githubCommits.substantiveLoc),
        cursorCondition
      )
    )
    .orderBy(
      desc(githubCommits.committedAt),
      desc(githubCommits.activityPublicId)
    )
    .limit(pageSize + 1);

  const hasNextPage = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const items = pageRows.map((row) => {
    if (
      row.activityPublicId === null ||
      row.additions === null ||
      row.changedFiles === null ||
      row.deletions === null ||
      row.repositoryOwnerLogin === null ||
      row.repositoryPrivate === null ||
      row.substantiveLoc === null ||
      row.summaryHeadline === null ||
      row.summaryShort === null
    ) {
      throw new Error("The public GitHub activity projection is incomplete.");
    }
    const repository = publicRepositoryDisplay({
      ownerLogin: row.repositoryOwnerLogin,
      private: row.repositoryPrivate,
      repository: row.repository,
      sha: row.sha,
    });
    const summaryKind =
      !row.providerFileCapReached &&
      row.substantiveLoc <= DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD
        ? "headline"
        : "short";
    return {
      additions: row.additions,
      avatarUrl: safeAvatarUrl(row.repositoryOwnerAvatarUrl),
      changedFiles: row.changedFiles,
      committedAt: row.committedAt.toISOString(),
      deletions: row.deletions,
      id: row.activityPublicId,
      languages: (row.languages ?? []).map((language) => ({
        ...language,
        iconUrl: publicLanguageIconUrl(language.id),
      })),
      providerFileCapReached: row.providerFileCapReached,
      repositoryLabel: repository.repositoryLabel,
      summary:
        summaryKind === "headline" ? row.summaryHeadline : row.summaryShort,
      summaryKind,
      url: repository.url,
    } as const;
  });
  const last = pageRows.at(-1);
  const nextCursor =
    hasNextPage && last?.activityPublicId !== null && last !== undefined
      ? encodeGitHubActivityCursor({
          committedAt: last.committedAt.toISOString(),
          publicId: last.activityPublicId,
        })
      : null;
  return { items, nextCursor };
};
