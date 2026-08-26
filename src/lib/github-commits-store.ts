import { and, desc, eq, isNull } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { githubAccountCheckpoints, githubCommits } from "@/db/schema";
import type {
  GitHubCommit,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";

export class CheckpointConflictError extends Error {
  constructor() {
    super("The GitHub event checkpoint changed during synchronization.");
    this.name = "CheckpointConflictError";
  }
}

export interface GitHubAccountCheckpoint {
  latestEventId: string | null;
}

export const readGitHubAccountCheckpoint = async (
  account: TrackedGitHubAccount
): Promise<GitHubAccountCheckpoint | null> => {
  const [checkpoint] = await getDatabase()
    .select({ latestEventId: githubAccountCheckpoints.latestEventId })
    .from(githubAccountCheckpoints)
    .where(eq(githubAccountCheckpoints.account, account))
    .limit(1);
  return checkpoint ?? null;
};

const insertCommits = async (
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
  >[0],
  commits: readonly GitHubCommit[]
) => {
  if (commits.length === 0) {
    return 0;
  }

  const persisted = await transaction
    .insert(githubCommits)
    .values(
      commits.map((commit) => ({
        committedAt: new Date(commit.committedAt),
        message: commit.message,
        pushedBy: commit.pushedBy,
        repository: commit.repository,
        repositoryId: commit.repositoryId,
        sha: commit.sha,
        url: commit.url,
      }))
    )
    .onConflictDoNothing()
    .returning({ sha: githubCommits.sha });
  return persisted.length;
};

export const persistGitHubCommits = async (commits: readonly GitHubCommit[]) =>
  await getDatabase().transaction(
    async (transaction) => await insertCommits(transaction, commits)
  );

export const persistAccountSync = async (input: {
  account: TrackedGitHubAccount;
  commits: readonly GitHubCommit[];
  expectedCheckpoint: GitHubAccountCheckpoint | null;
  latestEventId: string | null;
}) =>
  await getDatabase().transaction(async (transaction) => {
    const persisted = await insertCommits(transaction, input.commits);
    const now = new Date();

    if (input.expectedCheckpoint === null) {
      const inserted = await transaction
        .insert(githubAccountCheckpoints)
        .values({
          account: input.account,
          lastPolledAt: now,
          latestEventId: input.latestEventId,
        })
        .onConflictDoNothing()
        .returning({ account: githubAccountCheckpoints.account });
      if (inserted.length !== 1) {
        throw new CheckpointConflictError();
      }
      return persisted;
    }

    const checkpointCondition =
      input.expectedCheckpoint.latestEventId === null
        ? isNull(githubAccountCheckpoints.latestEventId)
        : eq(
            githubAccountCheckpoints.latestEventId,
            input.expectedCheckpoint.latestEventId
          );
    const updated = await transaction
      .update(githubAccountCheckpoints)
      .set({ lastPolledAt: now, latestEventId: input.latestEventId })
      .where(
        and(
          eq(githubAccountCheckpoints.account, input.account),
          checkpointCondition
        )
      )
      .returning({ account: githubAccountCheckpoints.account });
    if (updated.length !== 1) {
      throw new CheckpointConflictError();
    }

    return persisted;
  });

export const readRecentGitHubCommits = async (limit = 24) => {
  const rows = await getDatabase()
    .select({
      committedAt: githubCommits.committedAt,
      message: githubCommits.message,
      pushedBy: githubCommits.pushedBy,
      repository: githubCommits.repository,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
      url: githubCommits.url,
    })
    .from(githubCommits)
    .orderBy(desc(githubCommits.committedAt), desc(githubCommits.sha))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    committedAt: row.committedAt.toISOString(),
    pushedBy: row.pushedBy as TrackedGitHubAccount,
  }));
};
