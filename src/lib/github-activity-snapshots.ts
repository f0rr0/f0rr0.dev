import { isDeepStrictEqual } from "node:util";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubActivitySnapshots,
  githubPublicFeedHead,
  githubWorkUnits,
  githubWorkUnitSummaryAttempts,
} from "@/db/schema";
import { dateKey } from "@/lib/date";
import { readCurrentPublicGitHubRows } from "@/lib/github-activity-store";
import { acquireGitHubWorkUnitProjectionLock } from "@/lib/github-work-unit-projection-state";
import { decodeGitHubWorkUnitSummary } from "@/lib/github-work-unit-summary";

type Saved = typeof githubActivitySnapshots.$inferInsert;
type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

// oxlint-disable-next-line eslint/complexity -- Compare status and code independently so metadata cannot masquerade as another day of work.
export const githubSnapshotChanged = (previous: Saved, next: Saved) => {
  if (!("facts" in previous.payload) && !("facts" in next.payload)) {
    return (
      (previous.payload.status ?? "open") !== (next.payload.status ?? "open")
    );
  }
  const previousStatus =
    "facts" in previous.payload
      ? previous.payload.pullRequest?.status
      : undefined;
  const nextPullRequest =
    "facts" in next.payload ? next.payload.pullRequest : undefined;
  if (
    nextPullRequest &&
    previousStatus !== nextPullRequest.status &&
    (previousStatus !== undefined ||
      Date.parse(nextPullRequest.statusChangedAt) >
        Date.parse(previous.payload.activityAt))
  ) {
    return true;
  }
  if (previous.attributionMode !== next.attributionMode) {
    return true;
  }
  if (
    typeof previous.outcomeDigest === "string" &&
    typeof next.outcomeDigest === "string"
  ) {
    return previous.outcomeDigest !== next.outcomeDigest;
  }
  // Incomplete evidence must not replace a previously known outcome. Acquiring a
  // digest for existing facts is bookkeeping, not another day's work.
  if (
    typeof previous.outcomeDigest === "string" &&
    typeof next.outcomeDigest !== "string"
  ) {
    return false;
  }
  if (
    typeof previous.outcomeDigest !== "string" &&
    typeof next.outcomeDigest !== "string" &&
    typeof previous.factsDigest === "string" &&
    typeof next.factsDigest === "string" &&
    previous.factsDigest !== next.factsDigest
  ) {
    return true;
  }
  return (
    "facts" in previous.payload &&
    "facts" in next.payload &&
    !isDeepStrictEqual(previous.payload.facts, next.payload.facts)
  );
};

// Today and yesterday can change; older source activity stays frozen.
export const mutableGitHubDay = (now: Date) =>
  dateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

export const fillSavedGitHubSummaries = async (transaction: Transaction) => {
  // The queue owns the exact immutable input. Fill empty prose once, never use
  // an older same-identity summary to describe a newer snapshot.
  const rows = await transaction
    .select({
      day: githubActivitySnapshots.day,
      identityKey: githubActivitySnapshots.identityKey,
      payload: githubActivitySnapshots.payload,
      outcome: githubWorkUnitSummaryAttempts.outcome,
    })
    .from(githubActivitySnapshots)
    .innerJoin(
      githubWorkUnitSummaryAttempts,
      and(
        eq(
          githubActivitySnapshots.workUnitId,
          githubWorkUnitSummaryAttempts.workUnitId
        ),
        eq(
          githubActivitySnapshots.summaryInputDigest,
          githubWorkUnitSummaryAttempts.summaryInputDigest
        ),
        eq(
          githubActivitySnapshots.outcomeDigest,
          githubWorkUnitSummaryAttempts.outcomeDigest
        ),
        eq(
          githubActivitySnapshots.attributionMode,
          githubWorkUnitSummaryAttempts.attributionMode
        )
      )
    )
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.state, "accepted"),
        sql`${githubActivitySnapshots.payload}->>'headline' is null`
      )
    );
  let changed = false;
  for (const row of rows) {
    const summary =
      row.outcome === null ? null : decodeGitHubWorkUnitSummary(row.outcome);
    if (!summary || !("facts" in row.payload)) {
      continue;
    }
    const updated = await transaction
      .update(githubActivitySnapshots)
      .set({ payload: { ...row.payload, ...summary, summarizing: false } })
      .where(
        and(
          eq(githubActivitySnapshots.day, row.day),
          eq(githubActivitySnapshots.identityKey, row.identityKey),
          sql`${githubActivitySnapshots.payload}->>'headline' is null`
        )
      )
      .returning({ day: githubActivitySnapshots.day });
    changed ||= updated.length > 0;
  }
  return changed;
};

export const publishGitHubActivitySnapshots = async (
  repositoryIds?: readonly string[],
  preserveRepositories: readonly string[] = []
) =>
  // oxlint-disable-next-line eslint/complexity -- One locked publication transaction keeps bootstrap, immutable history and mutable-day replacement atomic.
  await getDatabase().transaction(async (transaction) => {
    await acquireGitHubWorkUnitProjectionLock(transaction);
    const [head] = await transaction
      .select({ initialized: githubPublicFeedHead.historyInitializedAt })
      .from(githubPublicFeedHead)
      .where(eq(githubPublicFeedHead.id, true));
    const bootstrap = !head?.initialized;
    const publicationRepositoryIds = bootstrap ? undefined : repositoryIds;
    const now = new Date();
    const today = dateKey(now);
    const mutableStart = mutableGitHubDay(now);
    const scope = publicationRepositoryIds
      ? inArray(githubWorkUnits.repositoryId, [...publicationRepositoryIds])
      : undefined;
    const units = await transaction
      .select({
        id: githubWorkUnits.id,
        identityKey: githubWorkUnits.identityKey,
        repositoryId: githubWorkUnits.repositoryId,
        revision: githubWorkUnits.revision,
        factsDigest: githubWorkUnits.factsDigest,
        outcomeDigest: githubWorkUnits.outcomeDigest,
        summaryInputDigest: githubWorkUnits.summaryInputDigest,
        attributionMode: githubWorkUnits.attributionMode,
      })
      .from(githubWorkUnits)
      .where(
        and(
          scope,
          bootstrap ? undefined : gte(githubWorkUnits.activityDay, mutableStart)
        )
      );
    const byIdentity = new Map(units.map((unit) => [unit.identityKey, unit]));
    const rows = await readCurrentPublicGitHubRows(transaction, {
      repositoryIds: publicationRepositoryIds,
      exactSummary: !bootstrap,
      sinceDay: bootstrap ? undefined : mutableStart,
    });
    const identities = [...rows.workUnits, ...rows.issues].map((row) => row.id);
    const latest = await transaction
      .selectDistinctOn([githubActivitySnapshots.identityKey])
      .from(githubActivitySnapshots)
      .where(inArray(githubActivitySnapshots.identityKey, identities))
      .orderBy(
        githubActivitySnapshots.identityKey,
        desc(githubActivitySnapshots.day)
      );
    const previous = new Map(latest.map((row) => [row.identityKey, row]));
    let changed = false;
    for (const row of [...rows.workUnits, ...rows.issues]) {
      const old = previous.get(row.id);
      const unit = byIdentity.get(row.id);
      const day = dateKey(row.activityAt);
      if (day > today || (!bootstrap && day < mutableStart)) {
        continue;
      }
      const next: Saved = {
        day,
        identityKey: row.id,
        repositoryId: row.repository.key,
        workUnitId: unit?.id,
        workUnitRevision: unit?.revision,
        attributionMode: unit?.attributionMode,
        factsDigest: unit?.factsDigest,
        outcomeDigest: unit?.outcomeDigest,
        summaryInputDigest: unit?.summaryInputDigest,
        payload: {
          ...row,
          day,
          id: `${day}:${row.id}`,
        },
        recordedAt: now,
      };
      if (
        typeof old?.outcomeDigest === "string" &&
        typeof next.outcomeDigest !== "string"
      ) {
        continue;
      }
      if (
        old &&
        !githubSnapshotChanged(old, next) &&
        !(
          old.day === day &&
          day >= mutableStart &&
          !isDeepStrictEqual(old.payload, next.payload)
        )
      ) {
        // Seed/advance the comparison digest without changing historical display.
        // Bind late prose only to the exact revision originally saved.
        const metadata = {
          ...(typeof old.outcomeDigest !== "string" &&
          typeof next.outcomeDigest === "string"
            ? { outcomeDigest: next.outcomeDigest }
            : {}),
          ...(old.workUnitRevision === next.workUnitRevision &&
          old.summaryInputDigest === null
            ? { summaryInputDigest: next.summaryInputDigest }
            : {}),
        };
        if (Object.keys(metadata).length) {
          await transaction
            .update(githubActivitySnapshots)
            .set(metadata)
            .where(
              and(
                eq(githubActivitySnapshots.day, old.day),
                eq(githubActivitySnapshots.identityKey, old.identityKey)
              )
            );
        }
        continue;
      }
      // A repeated bootstrap is an insert-only operation, including today's rows.
      const written = bootstrap
        ? await transaction
            .insert(githubActivitySnapshots)
            .values(next)
            .onConflictDoNothing()
            .returning({ day: githubActivitySnapshots.day })
        : await transaction
            .insert(githubActivitySnapshots)
            .values(next)
            .onConflictDoUpdate({
              target: [
                githubActivitySnapshots.day,
                githubActivitySnapshots.identityKey,
              ],
              set: next,
              setWhere: and(
                gte(githubActivitySnapshots.day, mutableStart),
                sql`(${githubActivitySnapshots.payload}->>'activityAt')::timestamptz <= ${row.activityAt}::timestamptz`
              ),
            })
            .returning({ day: githubActivitySnapshots.day });
      changed ||= written.length > 0;
    }
    if (!bootstrap && repositoryIds !== undefined && repositoryIds.length > 0) {
      const removed = await transaction.execute(sql`
      delete from ${githubActivitySnapshots} s where s.day between ${mutableStart}::date and ${today}::date and s.work_unit_id is not null
        and s.repository_id in (select jsonb_array_elements_text(${JSON.stringify(repositoryIds)}::jsonb))
        and not (s.repository_id in (select jsonb_array_elements_text(${JSON.stringify(preserveRepositories)}::jsonb)))
        and not exists (select 1 from ${githubWorkUnits} w where w.identity_key = s.identity_key)
      returning s.day
    `);
      changed ||= removed.rows.length > 0;
    }
    const filled = await fillSavedGitHubSummaries(transaction);
    if (changed || filled) {
      await transaction
        .update(githubPublicFeedHead)
        .set({
          feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
          headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
          lastPublishedAt: now,
        })
        .where(eq(githubPublicFeedHead.id, true));
    }
    if (bootstrap) {
      await transaction
        .update(githubPublicFeedHead)
        .set({ historyInitializedAt: now })
        .where(eq(githubPublicFeedHead.id, true));
    }
    return {
      changed: changed || filled,
      workUnits: rows.workUnits.length,
      issues: rows.issues.length,
    };
  });
