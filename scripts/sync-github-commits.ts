import { closeDatabase } from "../src/db/client";
import { runGitHubActivityWorker } from "../src/lib/github-activity-worker";
import { syncGitHubAccounts } from "../src/lib/github-commits";

try {
  const sync = await syncGitHubAccounts();
  const activity = await runGitHubActivityWorker();
  process.stdout.write(`${JSON.stringify({ activity, sync })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`GitHub commit sync failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
