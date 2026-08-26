import { closeDatabase } from "../src/db/client";
import { syncGitHubAccounts } from "../src/lib/github-commits";

try {
  const result = await syncGitHubAccounts();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`GitHub commit sync failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
