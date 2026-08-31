import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import {
  githubCommits,
  githubPublicActivities,
  githubPullRequestMemberships,
  githubPullRequestVersions,
  githubSummaryAttempts,
} from "@/db/schema";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

/**
 * Invalidates public aliases derived from a PR whose head, state, or complete
 * membership changed. Reset aliases stay unpublished until conservative
 * canonicalization runs again against the refreshed evidence.
 */
export const invalidateGitHubPullRequestDerivedAliases = async (
  transaction: DatabaseTransaction,
  pullRequestNodeId: string
) => {
  const resetActivities = await transaction
    .update(githubPublicActivities)
    .set({
      aliasEvidence: null,
      aliasReason: null,
      canonicalPublicId: null,
      hiddenAt: null,
      publishedAt: null,
    })
    .where(
      and(
        eq(githubPublicActivities.kind, "commit"),
        isNotNull(githubPublicActivities.canonicalPublicId),
        sql`${githubPublicActivities.aliasEvidence} ->> 'pullRequestNodeId' = ${pullRequestNodeId}`
      )
    )
    .returning({ publicId: githubPublicActivities.publicId });
  if (resetActivities.length > 0) {
    await transaction
      .update(githubSummaryAttempts)
      .set({
        attemptCount: 0,
        attemptedAt: null,
        completedAt: null,
        errorCode: null,
        inputHash: null,
        leaseToken: null,
        leaseUntil: null,
        model: null,
        state: "pending",
        summaryHeadline: null,
        summaryShort: null,
      })
      .where(
        and(
          inArray(
            githubSummaryAttempts.activityPublicId,
            resetActivities.map(({ publicId }) => publicId)
          ),
          eq(githubSummaryAttempts.state, "indeterminate"),
          eq(githubSummaryAttempts.errorCode, "canonical_alias")
        )
      );
  }
  if (resetActivities.length > 0) {
    await transaction
      .update(githubCommits)
      .set({ canonicalizedAt: null })
      .where(
        inArray(
          githubCommits.activityPublicId,
          resetActivities.map(({ publicId }) => publicId)
        )
      );
  }
  await transaction.update(githubCommits).set({ canonicalizedAt: null })
    .where(sql<boolean>`EXISTS (
      SELECT 1
      FROM ${githubPullRequestMemberships}
      INNER JOIN ${githubPullRequestVersions}
        ON ${githubPullRequestVersions.id} = ${githubPullRequestMemberships.versionId}
      WHERE ${githubPullRequestVersions.pullRequestNodeId} = ${pullRequestNodeId}
        AND ${githubPullRequestVersions.membershipComplete} = true
        AND ${githubPullRequestMemberships.commitRepositoryId} = ${githubCommits.repositoryId}
        AND ${githubPullRequestMemberships.commitSha} = ${githubCommits.sha}
    )`);
  return resetActivities.length;
};
