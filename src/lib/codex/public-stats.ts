import "server-only";
import { and, gte, lt } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { tokenPreferences } from "@/content/tokens";
import { getDatabase, isDatabaseConfigured } from "@/db/client";
import { codexAccounts, codexUsageDays } from "@/db/codex-schema";
import { buildTokenDetails, utcOffset } from "@/lib/codex/analytics";
import { restoreCodexHistory } from "@/lib/codex/daily-history";
import { buildPublicCodexStats } from "@/lib/codex/stats";
import { reportOperationalError } from "@/lib/operational-error";

// Closed history is shared by all views and survives the live sync invalidation.
const readClosedDays = unstable_cache(
  async (today: string) =>
    await getDatabase()
      .select()
      .from(codexUsageDays)
      .where(
        and(
          gte(codexUsageDays.day, utcOffset(today, -364)),
          lt(codexUsageDays.day, utcOffset(today, -1))
        )
      ),
  ["codex-closed-days-v1"],
  { revalidate: 3600, tags: ["codex-history"] }
);

const readPublicViews = unstable_cache(
  async (today: string, closed: Awaited<ReturnType<typeof readClosedDays>>) => {
    const [accounts, recent] = await Promise.all([
      getDatabase().select().from(codexAccounts).orderBy(codexAccounts.id),
      getDatabase()
        .select()
        .from(codexUsageDays)
        .where(
          and(
            gte(codexUsageDays.day, utcOffset(today, -1)),
            lt(codexUsageDays.day, utcOffset(today, 1))
          )
        ),
    ]);
    const days = Map.groupBy([...closed, ...recent], (row) => row.accountId);
    const records = accounts.flatMap((account, index) =>
      account.snapshot
        ? [
            {
              snapshot: restoreCodexHistory(
                account.enabled
                  ? account.snapshot
                  : {
                      ...account.snapshot,
                      limits: [],
                      primaryLimit: null,
                    },
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
    };
  },
  ["public-codex-views-v1", JSON.stringify(tokenPreferences)],
  { revalidate: 900, tags: ["public-codex-stats"] }
);

const getViews = cache(async () => {
  if (!tokenPreferences.enabled || !isDatabaseConfigured()) {
    return null;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Next bypasses nested unstable_cache reads. Read history outside the views cache.
    const closed = await readClosedDays(today);
    return await readPublicViews(today, closed);
  } catch (error) {
    reportOperationalError("public_codex_stats", error);
    return null;
  }
});

export const getPublicCodexStats = async () =>
  (await getViews())?.stats ?? null;
export const getPublicTokenDetails = async (days: number) =>
  (await getViews())?.details[days] ?? null;
