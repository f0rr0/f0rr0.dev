import "server-only";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { tokenPreferences } from "@/content/tokens";
import { getDatabase, isDatabaseConfigured } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import { buildTokenDetails } from "@/lib/codex/analytics";
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
  ["public-codex-stats-v8", JSON.stringify(tokenPreferences)],
  { revalidate: 900, tags: ["public-codex-stats"] }
);

export const getPublicCodexStats = async () => {
  try {
    return tokenPreferences.enabled && isDatabaseConfigured()
      ? await readCachedPublicCodexStats()
      : null;
  } catch (error) {
    reportOperationalError("public_codex_stats", error);
    return null;
  }
};

const readCachedTokenDetails = unstable_cache(
  async (days: 7 | 30) => {
    const rows = await getDatabase()
      .select({ snapshot: codexAccounts.snapshot })
      .from(codexAccounts)
      .where(eq(codexAccounts.enabled, true))
      .orderBy(codexAccounts.id);
    return buildTokenDetails(
      rows.map((row) => row.snapshot?.analytics),
      days
    );
  },
  ["public-token-details-v1", JSON.stringify(tokenPreferences)],
  { revalidate: 900, tags: ["public-codex-stats"] }
);

export async function getPublicTokenDetails(days: 7 | 30) {
  if (!tokenPreferences.enabled || !isDatabaseConfigured()) {
    return null;
  }
  try {
    return await readCachedTokenDetails(days);
  } catch (error) {
    reportOperationalError("public_token_details", error);
    return null;
  }
}
