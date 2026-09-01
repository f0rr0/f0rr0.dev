import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { githubPublicFeedHead } from "@/db/schema";
import { GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST } from "@/lib/github-work-unit-summary";

type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

const PROJECTION_LOCK = "github-work-unit-projection-v1";

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
        summaryPolicyDigest: githubPublicFeedHead.summaryPolicyDigest,
        token: githubPublicFeedHead.projectionRequestToken,
      })
      .from(githubPublicFeedHead)
      .where(eq(githubPublicFeedHead.id, true))
      .for("update");
    if (head === undefined) {
      throw new Error("The GitHub public feed head is unavailable.");
    }
    if (
      head.token !== null ||
      head.summaryPolicyDigest === GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST
    ) {
      return head.token;
    }
    return await requestGitHubWorkUnitProjection(transaction);
  });

export const completeGitHubWorkUnitProjectionRequest = async (
  token: string
) => {
  const [cleared] = await getDatabase()
    .update(githubPublicFeedHead)
    .set({
      projectionRequestToken: null,
      summaryPolicyDigest: GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST,
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
