import { inArray, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import {
  githubAccountRepositoryCatalogs,
  githubRepositoryInventoryHeads,
} from "@/db/schema";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";

const trackedGitHubUserIds = Object.values(TRACKED_GITHUB_USER_IDS);

/** Current private/internal access requires a row from a completed inventory. */
export const hasCurrentTrackedGitHubRepositoryAccess = (
  repositoryId: SQLWrapper
) => sql<boolean>`EXISTS (
  SELECT 1
  FROM ${githubAccountRepositoryCatalogs}
  INNER JOIN ${githubRepositoryInventoryHeads}
    ON ${githubRepositoryInventoryHeads.accountUserId} = ${githubAccountRepositoryCatalogs.accountUserId}
  WHERE ${githubAccountRepositoryCatalogs.repositoryId} = ${repositoryId}
    AND ${githubAccountRepositoryCatalogs.activeAccess} = true
    AND ${githubAccountRepositoryCatalogs.inventoryGeneration} = ${githubRepositoryInventoryHeads.generation}
    AND ${githubRepositoryInventoryHeads.completedAt} IS NOT NULL
    AND ${githubRepositoryInventoryHeads.generation} > 0
    AND ${inArray(
      githubAccountRepositoryCatalogs.accountUserId,
      trackedGitHubUserIds
    )}
)`;
