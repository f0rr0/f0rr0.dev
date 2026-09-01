import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import { githubRepositories, githubWorkUnits } from "@/db/schema";
import type {
  GitHubRepository,
  GitHubRepositoryFacts,
  GitHubRepositoryInventoryFacts,
} from "@/lib/github-commits-core";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const hasRepositoryFacts = (
  repository: GitHubRepository
): repository is GitHubRepositoryFacts => "ownerLogin" in repository;

const hasInventoryFacts = (
  repository: GitHubRepository
): repository is GitHubRepositoryInventoryFacts => "topics" in repository;

const githubRepositoryFactValuesFrom = (
  repository: GitHubRepository,
  observedAt: Date
) => {
  if (!hasRepositoryFacts(repository)) {
    return {
      defaultBranch: null,
      factsVerifiedAt: null,
      htmlUrl: null,
      ownerAvatarUrl: null,
      ownerId: null,
      ownerLogin: null,
      ownerType: null,
      pushedAt: null,
      visibility: null,
    };
  }
  return {
    defaultBranch: repository.defaultBranch,
    factsVerifiedAt: repository.visibility === null ? null : observedAt,
    htmlUrl: repository.htmlUrl,
    ownerAvatarUrl: repository.ownerAvatarUrl,
    ownerId: repository.ownerId,
    ownerLogin: repository.ownerLogin,
    ownerType: repository.ownerType,
    pushedAt:
      repository.pushedAt === null ? null : new Date(repository.pushedAt),
    visibility: repository.visibility,
  };
};

const githubRepositoryInventoryValuesFrom = (
  repository: GitHubRepository,
  observedAt: Date
) =>
  hasInventoryFacts(repository)
    ? {
        description: repository.description,
        homepageUrl: repository.homepageUrl,
        inventoryVerifiedAt: observedAt,
        topics: repository.topics,
      }
    : {
        description: null,
        homepageUrl: null,
        inventoryVerifiedAt: null,
        topics: null,
      };

const githubRepositoryValuesFrom = (
  repository: GitHubRepository,
  observedAt: Date
) => ({
  firstObservedAt: observedAt,
  fullName: repository.fullName,
  id: repository.id,
  lastObservedAt: observedAt,
  ...githubRepositoryFactValuesFrom(repository, observedAt),
  ...githubRepositoryInventoryValuesFrom(repository, observedAt),
});

const normalizedOptionalText = (value: string | null) => {
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 ? null : normalized;
};

const normalizedTopics = (topics: readonly string[] | null) =>
  JSON.stringify(
    [
      ...new Set((topics ?? []).map((topic) => topic.trim()).filter(Boolean)),
    ].toSorted()
  );

const summaryContextChanged = (
  existing: {
    description: string | null;
    fullName: string;
    homepageUrl: string | null;
    inventoryVerifiedAt: Date | null;
    lastObservedAt: Date;
    topics: readonly string[] | null;
  },
  repository: GitHubRepository,
  observedAt: Date,
  includeMetadata: boolean
) => {
  const identityChanged =
    existing.lastObservedAt <= observedAt &&
    existing.fullName !== repository.fullName;
  const metadataChanged =
    includeMetadata &&
    hasInventoryFacts(repository) &&
    (existing.inventoryVerifiedAt === null ||
      existing.inventoryVerifiedAt <= observedAt) &&
    (normalizedOptionalText(existing.description) !==
      normalizedOptionalText(repository.description) ||
      normalizedOptionalText(existing.homepageUrl) !==
        normalizedOptionalText(repository.homepageUrl) ||
      normalizedTopics(existing.topics) !==
        normalizedTopics(repository.topics));
  return identityChanged || metadataChanged;
};

const changedSummaryContextRepositoryIds = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepository[],
  observedAt: Date,
  includeMetadata: boolean
) => {
  const repositoryIds = [...new Set(repositories.map(({ id }) => id))];
  const existingRows = await transaction
    .select({
      description: githubRepositories.description,
      fullName: githubRepositories.fullName,
      homepageUrl: githubRepositories.homepageUrl,
      id: githubRepositories.id,
      inventoryVerifiedAt: githubRepositories.inventoryVerifiedAt,
      lastObservedAt: githubRepositories.lastObservedAt,
      topics: githubRepositories.topics,
    })
    .from(githubRepositories)
    .where(inArray(githubRepositories.id, repositoryIds))
    .orderBy(githubRepositories.id)
    .for("update");
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  return [
    ...new Set(
      repositories.flatMap((repository) => {
        const existing = existingById.get(repository.id);
        return existing !== undefined &&
          summaryContextChanged(
            existing,
            repository,
            observedAt,
            includeMetadata
          )
          ? [repository.id]
          : [];
      })
    ),
  ];
};

const invalidateChangedRepositorySummaries = async (
  transaction: DatabaseTransaction,
  repositoryIds: readonly string[]
) => {
  if (repositoryIds.length === 0) {
    return;
  }
  await transaction
    .update(githubWorkUnits)
    .set({ summaryInputDigest: null })
    .where(
      and(
        inArray(githubWorkUnits.repositoryId, repositoryIds),
        eq(githubWorkUnits.visibility, "public"),
        isNotNull(githubWorkUnits.summaryInputDigest)
      )
    );
};

const upsertGitHubRepositoryIdentity = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepository[],
  observedAt: Date
) => {
  await transaction
    .insert(githubRepositories)
    .values(
      repositories.map((repository) =>
        githubRepositoryValuesFrom(repository, observedAt)
      )
    )
    .onConflictDoUpdate({
      set: {
        fullName: sql`excluded.full_name`,
        lastObservedAt: sql`excluded.last_observed_at`,
      },
      setWhere: lte(githubRepositories.lastObservedAt, observedAt),
      target: githubRepositories.id,
    });
};

const upsertGitHubRepositoryFacts = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepository[],
  observedAt: Date,
  authoritative: boolean
) => {
  const verifiedFacts = repositories.filter(
    (repository): repository is GitHubRepositoryFacts =>
      hasRepositoryFacts(repository) && repository.visibility !== null
  );
  if (verifiedFacts.length === 0) {
    return;
  }
  await transaction
    .insert(githubRepositories)
    .values(
      verifiedFacts.map((repository) =>
        githubRepositoryValuesFrom(repository, observedAt)
      )
    )
    .onConflictDoUpdate({
      set: {
        defaultBranch: authoritative
          ? sql`excluded.default_branch`
          : sql`coalesce(excluded.default_branch, ${githubRepositories.defaultBranch})`,
        factsVerifiedAt: sql`excluded.facts_verified_at`,
        htmlUrl: authoritative
          ? sql`excluded.html_url`
          : sql`coalesce(excluded.html_url, ${githubRepositories.htmlUrl})`,
        ownerAvatarUrl: authoritative
          ? sql`excluded.owner_avatar_url`
          : sql`coalesce(excluded.owner_avatar_url, ${githubRepositories.ownerAvatarUrl})`,
        ownerId: authoritative
          ? sql`excluded.owner_id`
          : sql`coalesce(excluded.owner_id, ${githubRepositories.ownerId})`,
        ownerLogin: authoritative
          ? sql`excluded.owner_login`
          : sql`coalesce(excluded.owner_login, ${githubRepositories.ownerLogin})`,
        ownerType: authoritative
          ? sql`excluded.owner_type`
          : sql`coalesce(excluded.owner_type, ${githubRepositories.ownerType})`,
        pushedAt: authoritative
          ? sql`excluded.pushed_at`
          : sql`coalesce(excluded.pushed_at, ${githubRepositories.pushedAt})`,
        visibility: sql`excluded.visibility`,
      },
      setWhere: or(
        isNull(githubRepositories.factsVerifiedAt),
        lte(githubRepositories.factsVerifiedAt, observedAt)
      ),
      target: githubRepositories.id,
    });
};

const upsertGitHubRepositoryInventoryMetadata = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepositoryInventoryFacts[],
  observedAt: Date
) => {
  const values = repositories.map((repository) =>
    githubRepositoryValuesFrom(repository, observedAt)
  );
  await transaction
    .insert(githubRepositories)
    .values(values)
    .onConflictDoUpdate({
      set: {
        description: sql`excluded.description`,
        homepageUrl: sql`excluded.homepage_url`,
        inventoryVerifiedAt: sql`excluded.inventory_verified_at`,
        topics: sql`excluded.topics`,
      },
      setWhere: or(
        isNull(githubRepositories.inventoryVerifiedAt),
        lte(githubRepositories.inventoryVerifiedAt, observedAt)
      ),
      target: githubRepositories.id,
    });
};

export const upsertGitHubRepositories = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepository[],
  observedAt: Date
) => {
  if (repositories.length === 0) {
    return;
  }
  const changedRepositoryIds = await changedSummaryContextRepositoryIds(
    transaction,
    repositories,
    observedAt,
    false
  );
  await upsertGitHubRepositoryIdentity(transaction, repositories, observedAt);
  await upsertGitHubRepositoryFacts(
    transaction,
    repositories,
    observedAt,
    false
  );
  await invalidateChangedRepositorySummaries(transaction, changedRepositoryIds);
};

export const upsertGitHubRepositoryInventory = async (
  transaction: DatabaseTransaction,
  repositories: readonly GitHubRepositoryInventoryFacts[],
  observedAt: Date
) => {
  if (repositories.length === 0) {
    return;
  }
  const changedRepositoryIds = await changedSummaryContextRepositoryIds(
    transaction,
    repositories,
    observedAt,
    true
  );
  await upsertGitHubRepositoryIdentity(transaction, repositories, observedAt);
  await upsertGitHubRepositoryFacts(
    transaction,
    repositories,
    observedAt,
    true
  );
  await upsertGitHubRepositoryInventoryMetadata(
    transaction,
    repositories,
    observedAt
  );
  await invalidateChangedRepositorySummaries(transaction, changedRepositoryIds);
};

export const upsertGitHubRepository = async (
  transaction: DatabaseTransaction,
  repository: GitHubRepository,
  observedAt: Date
) => {
  await upsertGitHubRepositories(transaction, [repository], observedAt);
};
