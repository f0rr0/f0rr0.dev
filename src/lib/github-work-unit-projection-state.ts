import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubPublicFeedHead,
  githubRepositories,
  githubRepositoryRefs,
  githubRefGenerations,
} from "@/db/schema";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import { GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST } from "@/lib/github-work-unit-summary";

type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const PROJECTION_LOCK = "github-work-unit-projection-v1";
// Bump whenever durable evidence maps to different work-unit ownership.
const PROJECTION_POLICY =
  "github-work-unit-projection-v4-merged-pr-file-equivalence";
const PIPELINE_POLICY_DIGEST = createHash("sha256")
  .update(
    JSON.stringify({
      authors: Object.values(TRACKED_GITHUB_USER_IDS).toSorted(),
      projection: PROJECTION_POLICY,
      summary: GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST,
    })
  )
  .digest("hex");

export const acquireGitHubWorkUnitProjectionLock = async (
  transaction: DatabaseTransaction
) => {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${PROJECTION_LOCK}))`
  );
};

export const requestGitHubWorkUnitProjection = async (
  executor: Database | DatabaseTransaction
) => {
  const token = randomUUID();
  const [requested] = await executor
    .update(githubPublicFeedHead)
    .set({ projectionRequestToken: token })
    .where(eq(githubPublicFeedHead.id, true))
    .returning({ token: githubPublicFeedHead.projectionRequestToken });
  if (requested?.token !== token) {
    throw new Error("The GitHub work-unit projection could not be requested.");
  }
  return token;
};

export const ensureGitHubWorkUnitProjectionRequest = async () =>
  await getDatabase().transaction(async (transaction) => {
    const [head] = await transaction
      .select({
        policyDigest: githubPublicFeedHead.summaryPolicyDigest,
        token: githubPublicFeedHead.projectionRequestToken,
      })
      .from(githubPublicFeedHead)
      .where(eq(githubPublicFeedHead.id, true))
      .for("update");
    if (head === undefined) {
      throw new Error("The GitHub public feed head is unavailable.");
    }
    if (head.token !== null || head.policyDigest === PIPELINE_POLICY_DIGEST) {
      return head.token;
    }
    return await requestGitHubWorkUnitProjection(transaction);
  });

export const completeGitHubWorkUnitProjectionRequest = async (
  token: string
) => {
  // Author changes can alter issue-only pages even when no work unit changes.
  const policyChanged = sql`${githubPublicFeedHead.summaryPolicyDigest} IS DISTINCT FROM ${PIPELINE_POLICY_DIGEST}`;
  const revisionIncrement = sql`CASE WHEN ${policyChanged} THEN 1 ELSE 0 END`;
  const [cleared] = await getDatabase()
    .update(githubPublicFeedHead)
    .set({
      projectionRequestToken: null,
      summaryPolicyDigest: PIPELINE_POLICY_DIGEST,
      feedRevision: sql`${githubPublicFeedHead.feedRevision} + ${revisionIncrement}`,
      headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + ${revisionIncrement}`,
      orderingRevision: sql`${githubPublicFeedHead.orderingRevision} + ${revisionIncrement}`,
      lastPublishedAt: sql`CASE WHEN ${policyChanged} THEN now() ELSE ${githubPublicFeedHead.lastPublishedAt} END`,
    })
    .where(
      and(
        eq(githubPublicFeedHead.id, true),
        eq(githubPublicFeedHead.projectionRequestToken, token)
      )
    )
    .returning({ id: githubPublicFeedHead.id });
  return cleared !== undefined;
};

// A repository's branch ownership is publishable only after every relevant head
// matches its complete generation. Share this predicate with the snapshot reader.
export const githubRepositoryHeadGenerationComplete = sql<boolean>`
  ${githubRepositories}.heads_last_reconciled_at is not null and not exists (
    select 1 from ${githubRepositoryRefs} as desired
    left join ${githubRefGenerations} as generation
      on generation.repository_id = desired.repository_id
      and generation.ref_name = desired.ref_name
    where desired.repository_id = ${githubRepositories}.id
      and desired.kind = 'head'
      and desired.projection_relevant = true
      and (
        (desired.active and (
          desired.branch_lineage_id is null
          or generation.head_sha is distinct from desired.head_sha
          or generation.branch_lineage_id is distinct from desired.branch_lineage_id
        ))
        or (not desired.active and generation.repository_id is not null)
      )
  )
`;

export const requestGitHubProjectionAfterRefRepair = async (
  transaction: DatabaseTransaction,
  repositoryId: string
) => {
  const [repository] = await transaction
    .select({ complete: githubRepositoryHeadGenerationComplete })
    .from(githubRepositories)
    .where(eq(githubRepositories.id, repositoryId));
  // Ref intake already invalidates stale ownership. Intermediate repairs cannot
  // publish branch work; the final repair requests one rebuild for the repository.
  if (repository?.complete) {
    await requestGitHubWorkUnitProjection(transaction);
  }
};
