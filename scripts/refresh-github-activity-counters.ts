import { closeDatabase } from "../src/db/client";
import { fetchGitHubActivityCommitSource } from "../src/lib/github-activity-processor";
import {
  deriveCommitLanguages,
  substantiveCommitLoc,
} from "../src/lib/github-activity-public-summary";
import {
  readCompletedGitHubActivityCommits,
  updateGitHubActivityCounters,
} from "../src/lib/github-activity-store";

let completed = 0;
let failed = 0;

try {
  const commits = await readCompletedGitHubActivityCommits();
  for (const commit of commits) {
    try {
      const source = await fetchGitHubActivityCommitSource(commit);
      await updateGitHubActivityCounters(commit, {
        additions: source.commit.stats.additions,
        changedFiles: source.commit.files.length,
        deletions: source.commit.stats.deletions,
        languages: deriveCommitLanguages(source.commit.files),
        providerFileCapReached: source.commit.providerFileCapReached,
        substantiveLoc: substantiveCommitLoc(source.commit.files),
      });
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  process.stdout.write(
    `${JSON.stringify({ completed, failed, total: commits.length })}\n`
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await closeDatabase();
}
