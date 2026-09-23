import { closeDatabase } from "../src/db/client";
import { backfillCodexAccounts } from "../src/lib/codex/sync";

try {
  const [since, ...extra] = process.argv.slice(2);
  if (!since || extra.length) {
    throw new Error("Usage: bun run codex:backfill YYYY-MM-DD");
  }
  await backfillCodexAccounts(since, (message) => {
    process.stdout.write(`${message}\n`);
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Codex backfill failed"}\n`
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
