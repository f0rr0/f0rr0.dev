import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import { getTimelineDatabase, isTimelineDatabaseConfigured } from "@/db/client";
import {
  timelineActivityDays,
  timelineContributionTotals,
  timelineEditions,
  timelinePublicEvents,
  timelineSyncRuns,
  timelineWebhookReceipts,
} from "@/db/schema";
import type { TimelinePublicEventKind } from "@/db/schema";
import {
  editionMatchesTimelinePrivacyPolicy,
  timelineEditionSchema,
} from "@/lib/timeline-core";
import type { TimelineEdition, WorkBucket } from "@/lib/timeline-core";
import { currentTimelinePrivacyPolicyVersion } from "@/lib/timeline-privacy";

export interface TimelineActivityDayRecord {
  bucket: WorkBucket;
  commitCount: number;
  day: string;
  id: string;
  languageFamily: string;
  privacyDomainKey: string | null;
  privacyPolicyVersion: string | null;
  publicRepoName: string | null;
  publicRepoUrl: string | null;
  reachedDefaultBranch: boolean;
  repoKey: string;
  source: string;
  subject: string;
  visibility: "private" | "public";
}

export type StoredTimelineActivityDay =
  typeof timelineActivityDays.$inferSelect;

export interface TimelineContributionTotalRecord {
  contributionCount: number;
  day: string;
  id: string;
  source: "github-public-calendar";
  subject: string;
}

export type StoredTimelineContributionTotal =
  typeof timelineContributionTotals.$inferSelect;

type PublicWorkBucket = Exclude<
  WorkBucket,
  "Across the work" | "Private product work"
>;

export interface TimelinePublicEventRecord {
  bucket: PublicWorkBucket;
  day: string;
  eventKind: TimelinePublicEventKind;
  id: string;
  publicRepoName: string;
  publicRepoUrl: string;
  publicTitle: string;
  publicUrl: string;
  repoKey: string;
  source: "github-profile";
  subject: string;
}

export type StoredTimelinePublicEvent =
  typeof timelinePublicEvents.$inferSelect;

const chunk = <T>(values: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

export const readTimelineActivityDays = async (
  subject: string,
  windowStart: string,
  windowEnd: string
): Promise<StoredTimelineActivityDay[]> => {
  if (!isTimelineDatabaseConfigured()) {
    return [];
  }

  return await getTimelineDatabase()
    .select()
    .from(timelineActivityDays)
    .where(
      and(
        eq(timelineActivityDays.subject, subject),
        gte(timelineActivityDays.day, windowStart),
        lte(timelineActivityDays.day, windowEnd)
      )
    )
    .orderBy(timelineActivityDays.day);
};

export const upsertTimelineActivityDays = async (
  records: readonly TimelineActivityDayRecord[]
) => {
  if (records.length === 0) {
    return 0;
  }

  const database = getTimelineDatabase();
  for (const recordChunk of chunk(records, 250)) {
    await database
      .insert(timelineActivityDays)
      .values(recordChunk)
      .onConflictDoUpdate({
        set: {
          bucket: sql`excluded.bucket`,
          commitCount: sql`excluded.commit_count`,
          languageFamily: sql`excluded.language_family`,
          privacyDomainKey: sql`excluded.privacy_domain_key`,
          privacyPolicyVersion: sql`excluded.privacy_policy_version`,
          publicRepoName: sql`excluded.public_repo_name`,
          publicRepoUrl: sql`excluded.public_repo_url`,
          reachedDefaultBranch: sql`excluded.reached_default_branch`,
          updatedAt: new Date(),
          visibility: sql`excluded.visibility`,
        },
        target: timelineActivityDays.id,
      });
  }

  return records.length;
};

export const readTimelineContributionTotals = async (
  subject: string,
  windowStart: string,
  windowEnd: string
): Promise<StoredTimelineContributionTotal[]> => {
  if (!isTimelineDatabaseConfigured()) {
    return [];
  }

  return await getTimelineDatabase()
    .select()
    .from(timelineContributionTotals)
    .where(
      and(
        eq(timelineContributionTotals.subject, subject),
        gte(timelineContributionTotals.day, windowStart),
        lte(timelineContributionTotals.day, windowEnd)
      )
    )
    .orderBy(timelineContributionTotals.day);
};

export const upsertTimelineContributionTotals = async (
  records: readonly TimelineContributionTotalRecord[]
) => {
  if (records.length === 0) {
    return 0;
  }

  const database = getTimelineDatabase();
  for (const recordChunk of chunk(records, 250)) {
    await database
      .insert(timelineContributionTotals)
      .values(recordChunk)
      .onConflictDoUpdate({
        set: {
          contributionCount: sql`excluded.contribution_count`,
          updatedAt: new Date(),
        },
        target: timelineContributionTotals.id,
      });
  }

  return records.length;
};

export const pruneTimelineActivityBefore = async (
  subject: string,
  cutoff: string
) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelineActivityDays)
    .where(
      and(
        eq(timelineActivityDays.subject, subject),
        lt(timelineActivityDays.day, cutoff)
      )
    );
};

export const pruneTimelineContributionTotalsBefore = async (
  subject: string,
  cutoff: string
) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelineContributionTotals)
    .where(
      and(
        eq(timelineContributionTotals.subject, subject),
        lt(timelineContributionTotals.day, cutoff)
      )
    );
};

export const readTimelinePublicEvents = async (
  subject: string,
  windowStart: string,
  windowEnd: string
): Promise<StoredTimelinePublicEvent[]> => {
  if (!isTimelineDatabaseConfigured()) {
    return [];
  }

  return await getTimelineDatabase()
    .select()
    .from(timelinePublicEvents)
    .where(
      and(
        eq(timelinePublicEvents.subject, subject),
        gte(timelinePublicEvents.day, windowStart),
        lte(timelinePublicEvents.day, windowEnd)
      )
    )
    .orderBy(
      timelinePublicEvents.day,
      timelinePublicEvents.eventKind,
      timelinePublicEvents.id
    );
};

export const upsertTimelinePublicEvents = async (
  records: readonly TimelinePublicEventRecord[]
) => {
  if (records.length === 0) {
    return 0;
  }

  const uniqueRecords = [
    ...new Map(records.map((record) => [record.id, record])).values(),
  ];
  const database = getTimelineDatabase();
  for (const recordChunk of chunk(uniqueRecords, 250)) {
    await database
      .insert(timelinePublicEvents)
      .values(recordChunk)
      .onConflictDoUpdate({
        set: {
          bucket: sql`excluded.bucket`,
          day: sql`excluded.day`,
          publicRepoName: sql`excluded.public_repo_name`,
          publicRepoUrl: sql`excluded.public_repo_url`,
          publicTitle: sql`excluded.public_title`,
          publicUrl: sql`excluded.public_url`,
          repoKey: sql`excluded.repo_key`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
        target: timelinePublicEvents.id,
      });
  }

  return uniqueRecords.length;
};

export const pruneTimelinePublicEventsBefore = async (
  subject: string,
  cutoff: string
) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelinePublicEvents)
    .where(
      and(
        eq(timelinePublicEvents.subject, subject),
        lt(timelinePublicEvents.day, cutoff)
      )
    );
};

export const beginTimelineSyncRun = async (input: {
  fullWindow: boolean;
  kind: string;
  windowEnd: string;
  windowStart: string;
}) => {
  const [run] = await getTimelineDatabase()
    .insert(timelineSyncRuns)
    .values(input)
    .returning({ id: timelineSyncRuns.id });

  if (run === undefined) {
    throw new Error("Failed to create timeline sync run.");
  }

  return run.id;
};

export const completeTimelineSyncRun = async (
  id: string,
  rowCount: number,
  eventCount: number,
  publicEventCoverage: "complete" | "partial" | "unavailable",
  anonymousDayCount: number,
  anonymousCoverage: "complete" | "unavailable",
  coverage: "complete" | "partial"
) => {
  await getTimelineDatabase()
    .update(timelineSyncRuns)
    .set({
      completedAt: new Date(),
      coverage,
      errorCode: null,
      eventCount,
      anonymousCoverage,
      anonymousDayCount,
      publicEventCoverage,
      rowCount,
      status: "completed",
    })
    .where(eq(timelineSyncRuns.id, id));
};

export const failTimelineSyncRun = async (id: string, errorCode: string) => {
  await getTimelineDatabase()
    .update(timelineSyncRuns)
    .set({
      completedAt: new Date(),
      errorCode: errorCode.slice(0, 64),
      status: "failed",
    })
    .where(eq(timelineSyncRuns.id, id));
};

export const readLastCompletedTimelineSync = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return null;
  }

  const [run] = await getTimelineDatabase()
    .select({
      completedAt: timelineSyncRuns.completedAt,
      windowEnd: timelineSyncRuns.windowEnd,
      windowStart: timelineSyncRuns.windowStart,
    })
    .from(timelineSyncRuns)
    .where(eq(timelineSyncRuns.status, "completed"))
    .orderBy(desc(timelineSyncRuns.completedAt))
    .limit(1);

  return run ?? null;
};

export const readLatestTimelineSync = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return null;
  }

  const [run] = await getTimelineDatabase()
    .select({
      anonymousCoverage: timelineSyncRuns.anonymousCoverage,
      completedAt: timelineSyncRuns.completedAt,
      coverage: timelineSyncRuns.coverage,
      startedAt: timelineSyncRuns.startedAt,
      status: timelineSyncRuns.status,
    })
    .from(timelineSyncRuns)
    .orderBy(desc(timelineSyncRuns.startedAt))
    .limit(1);

  return run ?? null;
};

export const readLastCompleteAnonymousTimelineSync = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return null;
  }

  const [run] = await getTimelineDatabase()
    .select({
      completedAt: timelineSyncRuns.completedAt,
      windowEnd: timelineSyncRuns.windowEnd,
      windowStart: timelineSyncRuns.windowStart,
    })
    .from(timelineSyncRuns)
    .where(
      and(
        eq(timelineSyncRuns.status, "completed"),
        eq(timelineSyncRuns.anonymousCoverage, "complete")
      )
    )
    .orderBy(desc(timelineSyncRuns.completedAt))
    .limit(1);

  return run ?? null;
};

export const readLastCompleteTimelineBackfill = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return null;
  }

  const [run] = await getTimelineDatabase()
    .select({
      completedAt: timelineSyncRuns.completedAt,
      windowEnd: timelineSyncRuns.windowEnd,
      windowStart: timelineSyncRuns.windowStart,
    })
    .from(timelineSyncRuns)
    .where(
      and(
        eq(timelineSyncRuns.status, "completed"),
        eq(timelineSyncRuns.coverage, "complete"),
        eq(timelineSyncRuns.fullWindow, true)
      )
    )
    .orderBy(desc(timelineSyncRuns.completedAt))
    .limit(1);

  return run ?? null;
};

export const publishTimelineEdition = async (
  edition: TimelineEdition,
  agentModel: string
) => {
  const validated = timelineEditionSchema.parse(edition);
  const hasProtectedEntries = validated.entries.some(
    (entry) => entry.visibility === "private" || entry.visibility === "mixed"
  );
  const privacyPolicyVersion = hasProtectedEntries
    ? currentTimelinePrivacyPolicyVersion()
    : null;
  if (hasProtectedEntries && privacyPolicyVersion === null) {
    throw new Error("timeline-privacy-policy-missing");
  }
  const now = new Date();

  await getTimelineDatabase()
    .insert(timelineEditions)
    .values({
      agentModel,
      edition: validated,
      editionKey: validated.editionKey,
      publishedAt: now,
      privacyPolicyVersion,
      status: "published",
      windowEnd: validated.windowEnd,
      windowStart: validated.windowStart,
    })
    .onConflictDoUpdate({
      set: {
        agentModel,
        edition: validated,
        publishedAt: now,
        privacyPolicyVersion,
        status: "published",
        updatedAt: now,
      },
      target: timelineEditions.editionKey,
    });

  return validated.editionKey;
};

export const readPublishedTimelineEdition = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return null;
  }

  const [row] = await getTimelineDatabase()
    .select({
      edition: timelineEditions.edition,
      privacyPolicyVersion: timelineEditions.privacyPolicyVersion,
    })
    .from(timelineEditions)
    .where(eq(timelineEditions.status, "published"))
    .orderBy(desc(timelineEditions.publishedAt))
    .limit(1);

  const result = timelineEditionSchema.safeParse(row?.edition);
  if (!result.success) {
    return null;
  }

  if (
    !editionMatchesTimelinePrivacyPolicy(
      result.data,
      row?.privacyPolicyVersion ?? null,
      currentTimelinePrivacyPolicyVersion()
    )
  ) {
    return null;
  }

  return result.data;
};

export const recordTimelineWebhookReceipt = async (input: {
  deliveryKey: string;
  eventType: string;
  expiresAt: Date;
}) => {
  const rows = await getTimelineDatabase()
    .insert(timelineWebhookReceipts)
    .values({
      ...input,
      status: "accepted",
    })
    .onConflictDoNothing()
    .returning({ deliveryKey: timelineWebhookReceipts.deliveryKey });

  return rows.length === 1;
};

export const markTimelineWebhookProcessed = async (deliveryKey: string) => {
  await getTimelineDatabase()
    .update(timelineWebhookReceipts)
    .set({ processedAt: new Date(), status: "processed" })
    .where(eq(timelineWebhookReceipts.deliveryKey, deliveryKey));
};

export const pruneTimelineWebhookReceipts = async (now = new Date()) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelineWebhookReceipts)
    .where(lt(timelineWebhookReceipts.expiresAt, now));
};

export const countStoredTimelineActivity = async (subject: string) => {
  if (!isTimelineDatabaseConfigured()) {
    return 0;
  }

  const [row] = await getTimelineDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(timelineActivityDays)
    .where(eq(timelineActivityDays.subject, subject));

  return row?.count ?? 0;
};

export const countStoredTimelinePublicEvents = async (subject: string) => {
  if (!isTimelineDatabaseConfigured()) {
    return 0;
  }

  const [row] = await getTimelineDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(timelinePublicEvents)
    .where(eq(timelinePublicEvents.subject, subject));

  return row?.count ?? 0;
};

export const deleteTimelineActivityByIds = async (ids: readonly string[]) => {
  if (ids.length === 0 || !isTimelineDatabaseConfigured()) {
    return;
  }

  for (const idChunk of chunk(ids, 500)) {
    await getTimelineDatabase()
      .delete(timelineActivityDays)
      .where(inArray(timelineActivityDays.id, idChunk));
  }
};

export const deleteTimelinePublicEventsByIds = async (
  ids: readonly string[]
) => {
  if (ids.length === 0 || !isTimelineDatabaseConfigured()) {
    return;
  }

  for (const idChunk of chunk(ids, 500)) {
    await getTimelineDatabase()
      .delete(timelinePublicEvents)
      .where(inArray(timelinePublicEvents.id, idChunk));
  }
};

export const deleteTimelineActivityByRepoKey = async (
  subject: string,
  repoKey: string
) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelineActivityDays)
    .where(
      and(
        eq(timelineActivityDays.subject, subject),
        eq(timelineActivityDays.repoKey, repoKey)
      )
    );
};

export const deleteTimelinePublicEventsByRepoKey = async (
  subject: string,
  repoKey: string
) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelinePublicEvents)
    .where(
      and(
        eq(timelinePublicEvents.subject, subject),
        eq(timelinePublicEvents.repoKey, repoKey)
      )
    );
};

export const deletePrivateTimelineActivity = async (subject: string) => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .delete(timelineActivityDays)
    .where(
      and(
        eq(timelineActivityDays.subject, subject),
        eq(timelineActivityDays.visibility, "private")
      )
    );
};

export const rejectPublishedTimelineEditions = async () => {
  if (!isTimelineDatabaseConfigured()) {
    return;
  }

  await getTimelineDatabase()
    .update(timelineEditions)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(timelineEditions.status, "published"));
};
