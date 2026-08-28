import { closeDatabase } from "../src/db/client";
import { processPendingGitHubActivity } from "../src/lib/github-activity-processor";
import { syncGitHubAccounts } from "../src/lib/github-commits";

try {
  const sync = await syncGitHubAccounts();
  const activity = await processPendingGitHubActivity();
  process.stdout.write(`${JSON.stringify({ activity, sync })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`GitHub commit sync failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
