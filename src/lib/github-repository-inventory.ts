import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountRepositoryCatalogs,
  githubRepositories,
  githubRepositoryInventoryHeads,
  githubRepositoryRefs,
} from "@/db/schema";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import type {
  GitHubRepositoryInventoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import { collectAccessibleGitHubRepositories } from "@/lib/github-reconciliation";
import { upsertGitHubRepositoryInventory } from "@/lib/github-repository-store";
import { requestGitHubWorkUnitProjection } from "@/lib/github-work-unit-projection-state";

const INVENTORY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INVENTORY_RETRY_INTERVAL_MS = 15 * 60 * 1000;
const INITIAL_INVENTORY_UPDATED_AT = new Date(0);

interface GitHubRepositoryInventoryClaim {
  account: TrackedGitHubAccount;
  accountUserId: string;
  expectedGeneration: number;
  startedAt: Date;
}

const inventoryError = (name: string, message: string) => {
  const error = new Error(message);
  error.name = name;
  return error;
};

const validatedInventoryTime = (now: Date) => {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("The GitHub repository inventory time is invalid.");
  }
  return now;
};

const claimGitHubRepositoryInventoryRefresh = async (input: {
  account: TrackedGitHubAccount;
  force: boolean;
  now: Date;
}): Promise<GitHubRepositoryInventoryClaim | null> => {
  const accountUserId = TRACKED_GITHUB_USER_IDS[input.account];
  const staleBefore = new Date(
    input.now.getTime() - INVENTORY_REFRESH_INTERVAL_MS
  );
  const retryBefore = new Date(
    input.now.getTime() - INVENTORY_RETRY_INTERVAL_MS
  );

  return await getDatabase().transaction(async (transaction) => {
    await transaction
      .insert(githubRepositoryInventoryHeads)
      .values({
        accountLogin: input.account,
        accountUserId,
        updatedAt: INITIAL_INVENTORY_UPDATED_AT,
      })
      .onConflictDoNothing({
        target: githubRepositoryInventoryHeads.accountUserId,
      });

    const refreshIsDue = input.force
      ? lt(githubRepositoryInventoryHeads.updatedAt, input.now)
      : and(
          or(
            isNull(githubRepositoryInventoryHeads.completedAt),
            lte(githubRepositoryInventoryHeads.completedAt, staleBefore)
          ),
          lte(githubRepositoryInventoryHeads.updatedAt, retryBefore)
        );
    const [claimed] = await transaction
      .update(githubRepositoryInventoryHeads)
      .set({ accountLogin: input.account, updatedAt: input.now })
      .where(
        and(
          eq(githubRepositoryInventoryHeads.accountUserId, accountUserId),
          refreshIsDue
        )
      )
      .returning({ generation: githubRepositoryInventoryHeads.generation });

    return claimed === undefined
      ? null
      : {
          account: input.account,
          accountUserId,
          expectedGeneration: claimed.generation,
          startedAt: input.now,
        };
  });
};

const releaseGitHubRepositoryInventoryRefresh = async (
  claim: GitHubRepositoryInventoryClaim
) => {
  await getDatabase()
    .update(githubRepositoryInventoryHeads)
    .set({
      updatedAt: sql`coalesce(${githubRepositoryInventoryHeads.completedAt}, ${sql.param(INITIAL_INVENTORY_UPDATED_AT, githubRepositoryInventoryHeads.updatedAt)})`,
    })
    .where(
      and(
        eq(githubRepositoryInventoryHeads.accountUserId, claim.accountUserId),
        eq(githubRepositoryInventoryHeads.generation, claim.expectedGeneration),
        eq(githubRepositoryInventoryHeads.updatedAt, claim.startedAt)
      )
    );
};

const publishGitHubRepositoryInventory = async (
  claim: GitHubRepositoryInventoryClaim,
  repositories: readonly GitHubRepositoryInventoryFacts[]
) => {
  const repositoriesById = new Map<string, GitHubRepositoryInventoryFacts>();
  for (const repository of repositories) {
    const existing = repositoriesById.get(repository.id);
    if (existing !== undefined && existing.fullName !== repository.fullName) {
      throw new TypeError(
        "The GitHub repository inventory contains conflicting identities."
      );
    }
    repositoriesById.set(repository.id, repository);
  }
  const generation = claim.expectedGeneration + 1;
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new RangeError(
      "The GitHub repository inventory generation is invalid."
    );
  }

  await getDatabase().transaction(async (transaction) => {
    const [published] = await transaction
      .update(githubRepositoryInventoryHeads)
      .set({
        accountLogin: claim.account,
        completedAt: claim.startedAt,
        generation,
        updatedAt: claim.startedAt,
      })
      .where(
        and(
          eq(githubRepositoryInventoryHeads.accountUserId, claim.accountUserId),
          eq(
            githubRepositoryInventoryHeads.generation,
            claim.expectedGeneration
          ),
          eq(githubRepositoryInventoryHeads.updatedAt, claim.startedAt)
        )
      )
      .returning({
        accountUserId: githubRepositoryInventoryHeads.accountUserId,
      });
    if (published === undefined) {
      throw inventoryError(
        "GitHubRepositoryInventoryClaimLostError",
        "The GitHub repository inventory refresh was superseded."
      );
    }

    const currentRepositories = [...repositoriesById.values()];
    await upsertGitHubRepositoryInventory(
      transaction,
      currentRepositories,
      claim.startedAt
    );
    await transaction
      .update(githubAccountRepositoryCatalogs)
      .set({
        activeAccess: false,
        inventoryGeneration: generation,
        observedAt: claim.startedAt,
      })
      .where(
        eq(githubAccountRepositoryCatalogs.accountUserId, claim.accountUserId)
      );
    if (currentRepositories.length > 0) {
      await transaction
        .insert(githubAccountRepositoryCatalogs)
        .values(
          currentRepositories.map((repository) => ({
            accountUserId: claim.accountUserId,
            activeAccess: true,
            inventoryGeneration: generation,
            observedAt: claim.startedAt,
            repositoryId: repository.id,
          }))
        )
        .onConflictDoUpdate({
          set: {
            activeAccess: true,
            inventoryGeneration: generation,
            observedAt: claim.startedAt,
          },
          target: [
            githubAccountRepositoryCatalogs.accountUserId,
            githubAccountRepositoryCatalogs.repositoryId,
          ],
        });
      await transaction
        .update(githubRepositoryRefs)
        .set({ projectionRelevant: true })
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositoryRefs.repositoryId, githubRepositories.id),
            inArray(
              githubRepositoryRefs.repositoryId,
              currentRepositories.map(({ id }) => id)
            ),
            eq(githubRepositoryRefs.kind, "head"),
            isNotNull(githubRepositories.defaultBranch),
            sql`${githubRepositoryRefs.refName} = 'refs/heads/' || ${githubRepositories.defaultBranch}`
          )
        );
    }
    await requestGitHubWorkUnitProjection(transaction);
  });
};

const readCurrentGitHubRepositoryInventory = async (
  account: TrackedGitHubAccount
): Promise<readonly GitHubRepositoryInventoryFacts[] | null> => {
  const accountUserId = TRACKED_GITHUB_USER_IDS[account];
  return await getDatabase().transaction(
    async (transaction) => {
      const [head] = await transaction
        .select({
          accountLogin: githubRepositoryInventoryHeads.accountLogin,
          generation: githubRepositoryInventoryHeads.generation,
        })
        .from(githubRepositoryInventoryHeads)
        .where(eq(githubRepositoryInventoryHeads.accountUserId, accountUserId))
        .limit(1);
      if (head === undefined || head.generation === 0) {
        return null;
      }
      if (head.accountLogin !== account) {
        throw new TypeError(
          "The GitHub repository inventory account is inconsistent."
        );
      }

      const rows = await transaction
        .select({
          defaultBranch: githubRepositories.defaultBranch,
          description: githubRepositories.description,
          fullName: githubRepositories.fullName,
          homepageUrl: githubRepositories.homepageUrl,
          htmlUrl: githubRepositories.htmlUrl,
          id: githubRepositories.id,
          inventoryVerifiedAt: githubRepositories.inventoryVerifiedAt,
          ownerAvatarUrl: githubRepositories.ownerAvatarUrl,
          ownerId: githubRepositories.ownerId,
          ownerLogin: githubRepositories.ownerLogin,
          ownerType: githubRepositories.ownerType,
          pushedAt: githubRepositories.pushedAt,
          topics: githubRepositories.topics,
          visibility: githubRepositories.visibility,
        })
        .from(githubAccountRepositoryCatalogs)
        .innerJoin(
          githubRepositories,
          eq(
            githubRepositories.id,
            githubAccountRepositoryCatalogs.repositoryId
          )
        )
        .where(
          and(
            eq(githubAccountRepositoryCatalogs.accountUserId, accountUserId),
            eq(githubAccountRepositoryCatalogs.activeAccess, true),
            eq(
              githubAccountRepositoryCatalogs.inventoryGeneration,
              head.generation
            )
          )
        );

      const repositories: GitHubRepositoryInventoryFacts[] = [];
      for (const row of rows) {
        if (row.inventoryVerifiedAt === null || row.topics === null) {
          return null;
        }
        if (
          row.ownerLogin === null ||
          (row.ownerType !== null &&
            row.ownerType !== "Organization" &&
            row.ownerType !== "User") ||
          (row.visibility !== null &&
            row.visibility !== "internal" &&
            row.visibility !== "private" &&
            row.visibility !== "public")
        ) {
          throw new TypeError(
            "The current GitHub repository inventory is inconsistent."
          );
        }
        repositories.push({
          defaultBranch: row.defaultBranch,
          description: row.description,
          fullName: row.fullName,
          homepageUrl: row.homepageUrl,
          htmlUrl: row.htmlUrl,
          id: row.id,
          ownerAvatarUrl: row.ownerAvatarUrl,
          ownerId: row.ownerId,
          ownerLogin: row.ownerLogin,
          ownerType: row.ownerType,
          pushedAt: row.pushedAt?.toISOString() ?? null,
          topics: row.topics,
          visibility: row.visibility,
        });
      }
      return repositories;
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
};

/**
 * Returns only a completely published repository generation. The provider is
 * traversed at most daily unless a caller explicitly forces a refresh.
 */
export const loadGitHubRepositoryInventory = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt?: number;
  forceRefresh?: boolean;
  now?: Date;
  token: string;
}): Promise<readonly GitHubRepositoryInventoryFacts[]> => {
  const now = validatedInventoryTime(input.now ?? new Date());
  const claim = await claimGitHubRepositoryInventoryRefresh({
    account: input.account,
    force: input.forceRefresh === true,
    now,
  });
  if (claim !== null) {
    try {
      const repositories = await collectAccessibleGitHubRepositories(
        input.token,
        null,
        { deadlineAt: input.deadlineAt }
      );
      await publishGitHubRepositoryInventory(claim, repositories);
    } catch (error) {
      await releaseGitHubRepositoryInventoryRefresh(claim);
      throw error;
    }
  }

  const repositories = await readCurrentGitHubRepositoryInventory(
    input.account
  );
  if (repositories === null) {
    throw inventoryError(
      "GitHubRepositoryInventoryUnavailableError",
      "A complete GitHub repository inventory is not available."
    );
  }
  return repositories;
};
