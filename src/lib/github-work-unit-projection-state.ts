import { createHash, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubPublicFeedHead,
  githubRepositories,
  githubRepositoryRefs,
  githubRefGenerations,
  githubWorkUnits,
} from "@/db/schema";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import { GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST } from "@/lib/github-work-unit-summary";

type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const PROJECTION_LOCK = "github-work-unit-projection-v1";
// Bump whenever durable evidence maps to different work-unit ownership.
const PROJECTION_POLICY = "github-work-unit-projection-v5-daily-pr-snapshots";
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
  executor: DatabaseTransaction,
  repositoryIds?: readonly string[]
) => {
  const token = randomUUID();
  // An omitted scope explicitly requests a full rebuild (policy changes/verifier).
  await executor
    .update(githubRepositories)
    .set({ projectionRequestToken: token })
    .where(
      repositoryIds === undefined
        ? undefined
        : inArray(githubRepositories.id, [...repositoryIds])
    );
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
    await acquireGitHubWorkUnitProjectionLock(transaction);
    const [head] = await transaction
      .select({
        policyDigest: githubPublicFeedHead.summaryPolicyDigest,
        token: githubPublicFeedHead.projectionRequestToken,
      })
      .from(githubPublicFeedHead)
      .where(eq(githubPublicFeedHead.id, true));
    if (head === undefined) {
      throw new Error("The GitHub public feed head is unavailable.");
    }
    if (head.policyDigest === PIPELINE_POLICY_DIGEST) {
      return head.token;
    }
    const token = await requestGitHubWorkUnitProjection(transaction);
    // Record the queued policy atomically so retries resume its remaining scopes.
    // Author changes can also alter issue-only pages without changing a work unit.
    await transaction
      .update(githubPublicFeedHead)
      .set({
        summaryPolicyDigest: PIPELINE_POLICY_DIGEST,
        feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
        headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
        orderingRevision: sql`${githubPublicFeedHead.orderingRevision} + 1`,
        lastPublishedAt: sql`now()`,
      })
      .where(eq(githubPublicFeedHead.id, true));
    return token;
  });

export const completeGitHubWorkUnitProjectionRequest = async (
  token: string,
  scopes: readonly { id: string; token: string | null }[]
) =>
  await getDatabase().transaction(async (transaction) => {
    await acquireGitHubWorkUnitProjectionLock(transaction);
    // Finish repositories independently. Connected forks with pending evaluations
    // need their own token even if only their neighbour originally requested work.
    await transaction.execute(sql`
      update ${githubRepositories} as repository
      set projection_request_token = case when exists (
        select 1 from ${githubWorkUnits} as unit
        where unit.repository_id = repository.id
          and unit.summary_evaluation_digest is distinct from unit.summary_evaluated_digest
      ) then ${token}::uuid else null end
      from jsonb_to_recordset(${JSON.stringify(scopes)}::jsonb) as scope(id text, token uuid)
      where repository.id = scope.id
        and repository.projection_request_token is not distinct from scope.token
    `);
    const [cleared] = await transaction
      .update(githubPublicFeedHead)
      .set({ projectionRequestToken: null })
      .where(
        and(
          eq(githubPublicFeedHead.id, true),
          eq(githubPublicFeedHead.projectionRequestToken, token),
          sql`not exists (select 1 from ${githubRepositories} where projection_request_token is not null)`
        )
      )
      .returning({ id: githubPublicFeedHead.id });
    return cleared !== undefined;
  });

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
    await requestGitHubWorkUnitProjection(transaction, [repositoryId]);
  }
};
