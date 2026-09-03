import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDatabase, isDatabaseConfigured } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import { buildPublicCodexStats } from "@/lib/codex/stats";

const readPublicCodexStats = async () => {
  const rows = await getDatabase()
    .select({
      id: codexAccounts.id,
      label: codexAccounts.publicLabel,
      snapshot: codexAccounts.snapshot,
      snapshotAt: codexAccounts.snapshotAt,
    })
    .from(codexAccounts)
    .where(eq(codexAccounts.enabled, true));

  const records = rows.flatMap((row) =>
    row.snapshot === null || row.snapshotAt === null
      ? []
      : [
          {
            id: row.id,
            label: row.label,
            snapshot: row.snapshot,
            snapshotAt: row.snapshotAt,
          },
        ]
  );
  return buildPublicCodexStats(records, new Date(), rows.length);
};

const readCachedPublicCodexStats = unstable_cache(
  readPublicCodexStats,
  ["public-codex-stats-v1"],
  { revalidate: 900 }
);

export const getPublicCodexStats = async () =>
  isDatabaseConfigured() ? await readCachedPublicCodexStats() : null;
