import { and, eq, inArray, isNull } from "drizzle-orm";

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
  paused: boolean;
}

export const isGitHubAccountPaused = (
  checkpoint: GitHubAccountCheckpoint | null
) => checkpoint?.paused === true;

export const readGitHubAccountCheckpoint = async (
  account: TrackedGitHubAccount
): Promise<GitHubAccountCheckpoint | null> => {
  const [checkpoint] = await getDatabase()
    .select({
      latestEventId: githubAccountCheckpoints.latestEventId,
      paused: githubAccountCheckpoints.paused,
    })
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
  const uniqueCommits = new Map<string, GitHubCommit>();
  for (const commit of commits) {
    const key = `${commit.repositoryId}:${commit.sha}`;
    const existing = uniqueCommits.get(key);
    if (existing !== undefined && existing.author !== commit.author) {
      throw new Error("A GitHub commit has conflicting author provenance.");
    }
    uniqueCommits.set(key, commit);
  }
  const values = [...uniqueCommits.values()];
  if (values.length === 0) {
    return 0;
  }

  const persisted = await transaction
    .insert(githubCommits)
    .values(
      values.map((commit) => ({
        author: commit.author,
        committedAt: new Date(commit.committedAt),
        message: commit.message,
        repository: commit.repository,
        repositoryId: commit.repositoryId,
        sha: commit.sha,
      }))
    )
    .onConflictDoNothing({
      target: [githubCommits.repositoryId, githubCommits.sha],
    })
    .returning({
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    });

  const inserted = new Set(
    persisted.map(({ repositoryId, sha }) => `${repositoryId}:${sha}`)
  );
  const conflicts = values.filter(
    (commit) => !inserted.has(`${commit.repositoryId}:${commit.sha}`)
  );
  if (conflicts.length > 0) {
    const existingRows = await transaction
      .select({
        author: githubCommits.author,
        repositoryId: githubCommits.repositoryId,
        sha: githubCommits.sha,
      })
      .from(githubCommits)
      .where(
        inArray(
          githubCommits.sha,
          conflicts.map(({ sha }) => sha)
        )
      );
    const existingAuthors = new Map(
      existingRows.map((row) => [`${row.repositoryId}:${row.sha}`, row.author])
    );
    for (const commit of conflicts) {
      if (
        existingAuthors.get(`${commit.repositoryId}:${commit.sha}`) !==
        commit.author
      ) {
        throw new Error("A GitHub commit has conflicting author provenance.");
      }
    }
  }
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

    if (input.expectedCheckpoint === null) {
      const inserted = await transaction
        .insert(githubAccountCheckpoints)
        .values({
          account: input.account,
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
      .set({ latestEventId: input.latestEventId })
      .where(
        and(
          eq(githubAccountCheckpoints.account, input.account),
          checkpointCondition,
          eq(githubAccountCheckpoints.paused, input.expectedCheckpoint.paused)
        )
      )
      .returning({ account: githubAccountCheckpoints.account });
    if (updated.length !== 1) {
      throw new CheckpointConflictError();
    }

    return persisted;
  });
