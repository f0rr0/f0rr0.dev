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
      id: codexAccounts.id,
      snapshot: codexAccounts.snapshot,
    })
    .from(codexAccounts)
    .where(eq(codexAccounts.enabled, true))
    .orderBy(codexAccounts.id);

  const records = rows.flatMap((row, index) =>
    row.snapshot === null
      ? []
      : [
          {
            snapshot: row.snapshot,
            label:
              tokenPreferences.accountLabels[row.id] ?? `Account ${index + 1}`,
          },
        ]
  );
  return buildPublicCodexStats(records, new Date(), rows.length);
};

const readCachedPublicCodexStats = unstable_cache(
  readPublicCodexStats,
  ["public-codex-stats-v9", JSON.stringify(tokenPreferences)],
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
  async (days: number) => {
    const rows = await getDatabase()
      .select({ id: codexAccounts.id, snapshot: codexAccounts.snapshot })
      .from(codexAccounts)
      .where(eq(codexAccounts.enabled, true))
      .orderBy(codexAccounts.id);
    return buildTokenDetails(
      rows.map((row) => row.snapshot?.analytics),
      days,
      new Date(),
      tokenPreferences,
      rows.map(
        (row, index) =>
          tokenPreferences.accountLabels[row.id] ?? `Account ${index + 1}`
      )
    );
  },
  ["public-token-details-v3", JSON.stringify(tokenPreferences)],
  { revalidate: 900, tags: ["public-codex-stats"] }
);

export async function getPublicTokenDetails(days: number) {
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
