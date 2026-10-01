import "server-only";
import { and, eq, gte, lt, or, sql } from "drizzle-orm";

import { tokenPreferences } from "@/content/tokens";
import { getDatabase } from "@/db/client";
import {
  codexAccounts,
  codexPublicRevisions,
  codexUsageDays,
} from "@/db/codex-schema";
import { buildTokenDetails, utcOffset } from "@/lib/codex/analytics";
import { restoreCodexHistory } from "@/lib/codex/daily-history";
import { buildPublicCodexStats } from "@/lib/codex/stats";

type ReadDatabase = Pick<
  Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  "select"
>;

export const readCodexPublicRevision = async (
  today: string,
  database: ReadDatabase = getDatabase()
) => {
  const start = utcOffset(today, -364);
  const end = utcOffset(today, -1);
  const [revision] = await database
    .select({
      historyRevision: sql<string>`coalesce(sum(${codexPublicRevisions.revision}) filter (where ${codexPublicRevisions.scope} >= ${start} and ${codexPublicRevisions.scope} < ${end}), 0)::text`,
      viewsRevision: sql<
        string | null
      >`max(${codexPublicRevisions.revision}) filter (where ${codexPublicRevisions.scope} = 'views')::text`,
    })
    .from(codexPublicRevisions)
    .where(
      or(
        eq(codexPublicRevisions.scope, "views"),
        and(
          gte(codexPublicRevisions.scope, start),
          lt(codexPublicRevisions.scope, end)
        )
      )
    );
  if (revision === undefined || revision.viewsRevision === null) {
    throw new Error("The Codex public revision is missing.");
  }
  return { ...revision, viewsRevision: revision.viewsRevision };
};

const readClosedDays = async (database: ReadDatabase, today: string) =>
  await database
    .select({
      accountId: codexUsageDays.accountId,
      payload: codexUsageDays.payload,
    })
    .from(codexUsageDays)
    .where(
      and(
        gte(codexUsageDays.day, utcOffset(today, -364)),
        lt(codexUsageDays.day, utcOffset(today, -1))
      )
    );

export const readClosedCodexHistory = async (today: string) =>
  await getDatabase().transaction(
    async (transaction) => ({
      ...(await readCodexPublicRevision(today, transaction)),
      today,
      rows: await readClosedDays(transaction, today),
    }),
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );

export type ClosedCodexHistory = Awaited<
  ReturnType<typeof readClosedCodexHistory>
>;

export const readCodexPublicViews = async (
  today: string,
  closedHint?: ClosedCodexHistory
) => {
  const { accounts, closed, recent, revision } =
    await getDatabase().transaction(
      async (transaction) => {
        const revision = await readCodexPublicRevision(today, transaction);
        // A backfill may commit between the prefetched history and this snapshot.
        const closed =
          closedHint?.today === today &&
          closedHint.historyRevision === revision.historyRevision
            ? closedHint.rows
            : await readClosedDays(transaction, today);
        const [accounts, recent] = await Promise.all([
          transaction
            .select({
              id: codexAccounts.id,
              enabled: codexAccounts.enabled,
              snapshot: codexAccounts.snapshot,
            })
            .from(codexAccounts)
            .orderBy(codexAccounts.id),
          transaction
            .select({
              accountId: codexUsageDays.accountId,
              payload: codexUsageDays.payload,
            })
            .from(codexUsageDays)
            .where(
              and(
                gte(codexUsageDays.day, utcOffset(today, -1)),
                lt(codexUsageDays.day, utcOffset(today, 1))
              )
            ),
        ]);
        return { accounts, closed, recent, revision };
      },
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );
  const days = Map.groupBy([...closed, ...recent], (row) => row.accountId);
  const records = accounts.flatMap((account, index) =>
    account.snapshot
      ? [
          {
            snapshot: restoreCodexHistory(
              account.enabled
                ? account.snapshot
                : { ...account.snapshot, limits: [], primaryLimit: null },
              (days.get(account.id) ?? []).map((row) => row.payload)
            ),
            label:
              tokenPreferences.accountLabels[account.id] ??
              `Account ${index + 1}`,
          },
        ]
      : []
  );
  const now = new Date(`${today}T12:00:00Z`);
  return {
    ...revision,
    views: {
      stats: buildPublicCodexStats(records, now, accounts.length),
      details: Object.fromEntries(
        [7, 30, 365].map((range) => [
          range,
          buildTokenDetails(
            records.map((record) => record.snapshot.analytics),
            range,
            now,
            tokenPreferences,
            records.map((record) => record.label),
            records.map((record) => record.snapshot.primaryLimit?.planType)
          ),
        ])
      ),
    },
  };
};
