import { eq } from "drizzle-orm";

import { codexAccounts, codexUsageDays } from "../src/db/codex-schema";
import {
  liveCodexSnapshot,
  partitionCodexHistory,
} from "../src/lib/codex/daily-history";

// Match drizzle.config.ts before the database module captures its environment.
if (
  import.meta.main &&
  (process.env.DATABASE_URL_UNPOOLED?.trim().length ?? 0) > 0
) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}
const { closeDatabase, getDatabase } = await import("../src/db/client");
const { publishGitHubActivitySnapshots } =
  await import("../src/lib/github-activity-snapshots");

// Restartable import: move historical rows before compacting the live snapshot.
export const migrateDailyHistory = async () => {
  const accounts = await getDatabase()
    .select({ id: codexAccounts.id })
    .from(codexAccounts);
  let imported = 0;
  for (const { id } of accounts) {
    const added = await getDatabase().transaction(async (transaction) => {
      let count = 0;
      const [account] = await transaction
        .select({ snapshot: codexAccounts.snapshot })
        .from(codexAccounts)
        .where(eq(codexAccounts.id, id))
        .for("update");
      if (account?.snapshot === undefined || account.snapshot === null) {
        return 0;
      }
      const rows = [...partitionCodexHistory(account.snapshot)].map(
        ([day, payload]) => ({ accountId: id, day, payload })
      );
      for (let offset = 0; offset < rows.length; offset += 100) {
        const saved = await transaction
          .insert(codexUsageDays)
          .values(rows.slice(offset, offset + 100))
          .onConflictDoNothing()
          .returning({ day: codexUsageDays.day });
        count += saved.length;
      }
      if (rows.length > 0) {
        await transaction
          .update(codexAccounts)
          .set({ snapshot: liveCodexSnapshot(account.snapshot) })
          .where(eq(codexAccounts.id, id));
      }
      return count;
    });
    imported += added;
  }
  const github = await publishGitHubActivitySnapshots(undefined, true);
  return { tokenDays: imported, github };
};

if (import.meta.main) {
  try {
    process.stdout.write(`${JSON.stringify(await migrateDailyHistory())}\n`);
  } finally {
    await closeDatabase();
  }
}
