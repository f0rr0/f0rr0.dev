import { closeDatabase } from "../src/db/client";
import {
  fetchGitHubActivityCommitSource,
  generateValidatedGitHubActivitySummary,
  GITHUB_ACTIVITY_SUMMARY_MODEL,
} from "../src/lib/github-activity-processor";
import { PUBLIC_COMMIT_SUMMARY_RECIPE } from "../src/lib/github-activity-public-summary";
import {
  readGitHubActivityCommitsWithStaleSummary,
  updateGitHubActivitySummary,
} from "../src/lib/github-activity-store";

let completed = 0;
let failed = 0;

try {
  if ((process.env.OPENAI_API_KEY?.trim().length ?? 0) === 0) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const commits = await readGitHubActivityCommitsWithStaleSummary(
    PUBLIC_COMMIT_SUMMARY_RECIPE
  );
  for (const commit of commits) {
    try {
      const source = await fetchGitHubActivityCommitSource(commit);
      const generated = await generateValidatedGitHubActivitySummary(source);
      await updateGitHubActivitySummary(commit, {
        summaryHeadline: generated.summary.headline,
        summaryInputHash: generated.inputHash,
        summaryModel: GITHUB_ACTIVITY_SUMMARY_MODEL,
        summaryRecipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
        summaryShort: generated.summary.short,
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
