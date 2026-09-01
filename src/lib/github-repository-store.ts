import { lte, sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import { githubRepositories } from "@/db/schema";
import type {
  GitHubRepository,
  GitHubRepositoryFacts,
} from "@/lib/github-commits-core";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const githubRepositoryValuesFrom = (
  repository: GitHubRepository,
  observedAt: Date
) => {
  const facts =
    "ownerLogin" in repository ? (repository as GitHubRepositoryFacts) : null;
  return {
    defaultBranch: facts?.defaultBranch ?? null,
    factsVerifiedAt:
      facts === null || facts.visibility === null ? null : observedAt,
    firstObservedAt: observedAt,
    fullName: repository.fullName,
    htmlUrl: facts?.htmlUrl ?? null,
    id: repository.id,
    lastObservedAt: observedAt,
    ownerAvatarUrl: facts?.ownerAvatarUrl ?? null,
    ownerId: facts?.ownerId ?? null,
    ownerLogin: facts?.ownerLogin ?? null,
    ownerType: facts?.ownerType ?? null,
    pushedAt:
      facts === null || facts.pushedAt === null
        ? null
        : new Date(facts.pushedAt),
    visibility: facts?.visibility ?? null,
  };
};

export const upsertGitHubRepositories = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepository[],
  observedAt: Date
) => {
  if (repositories.length === 0) {
    return;
  }
  await transaction
    .insert(githubRepositories)
    .values(
      repositories.map((repository) =>
        githubRepositoryValuesFrom(repository, observedAt)
      )
    )
    .onConflictDoUpdate({
      set: {
        defaultBranch: sql`coalesce(excluded.default_branch, ${githubRepositories.defaultBranch})`,
        factsVerifiedAt: sql`coalesce(excluded.facts_verified_at, ${githubRepositories.factsVerifiedAt})`,
        fullName: sql`excluded.full_name`,
        htmlUrl: sql`coalesce(excluded.html_url, ${githubRepositories.htmlUrl})`,
        lastObservedAt: sql`excluded.last_observed_at`,
        ownerAvatarUrl: sql`coalesce(excluded.owner_avatar_url, ${githubRepositories.ownerAvatarUrl})`,
        ownerId: sql`coalesce(excluded.owner_id, ${githubRepositories.ownerId})`,
        ownerLogin: sql`coalesce(excluded.owner_login, ${githubRepositories.ownerLogin})`,
        ownerType: sql`coalesce(excluded.owner_type, ${githubRepositories.ownerType})`,
        pushedAt: sql`coalesce(excluded.pushed_at, ${githubRepositories.pushedAt})`,
        visibility: sql`coalesce(excluded.visibility, ${githubRepositories.visibility})`,
      },
      setWhere: lte(githubRepositories.lastObservedAt, observedAt),
      target: githubRepositories.id,
    });
};

export const upsertGitHubRepository = async (
  transaction: DatabaseTransaction,
  repository: GitHubRepository,
  observedAt: Date
) => {
  await upsertGitHubRepositories(transaction, [repository], observedAt);
};
