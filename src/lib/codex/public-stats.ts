import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { getDatabase, isDatabaseConfigured } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import { buildPublicCodexStats } from "@/lib/codex/stats";
import { reportOperationalError } from "@/lib/operational-error";

const readPublicCodexStats = async () => {
  const rows = await getDatabase()
    .select({
      snapshot: codexAccounts.snapshot,
    })
    .from(codexAccounts)
    .where(eq(codexAccounts.enabled, true));

  const records = rows.flatMap((row) =>
    row.snapshot === null ? [] : [{ snapshot: row.snapshot }]
  );
  return buildPublicCodexStats(records, new Date(), rows.length);
};

const readCachedPublicCodexStats = unstable_cache(
  readPublicCodexStats,
  ["public-codex-stats-v6"],
  { revalidate: 900, tags: ["public-codex-stats"] }
);

export const getPublicCodexStats = async () => {
  try {
    return isDatabaseConfigured() ? await readCachedPublicCodexStats() : null;
  } catch (error) {
    reportOperationalError("public_codex_stats", error);
    return null;
  }
};
