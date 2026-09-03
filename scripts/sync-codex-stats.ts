import { closeDatabase } from "@/db/client";
import { syncCodexAccounts } from "@/lib/codex/sync";

try {
  const result = await syncCodexAccounts();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Codex stats sync failed: ${name}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
