import { closeTimelineDatabase } from "../src/db/client";
import { syncGitHubTimeline } from "../src/lib/timeline-github";

const forceBackfill = process.argv.includes("--backfill");

try {
  const result = await syncGitHubTimeline({
    forceBackfill,
    kind: forceBackfill ? "backfill" : "manual",
  });
  process.stdout.write(
    `${JSON.stringify({
      anonymousCoverage: result.anonymousCoverage,
      anonymousDays: result.anonymousDays,
      coverage: result.coverage,
      events: result.events,
      kind: result.kind,
      privateActivity: result.privateActivity,
      rows: result.rows,
      windowEnd: result.windowEnd,
      windowStart: result.windowStart,
    })}\n`
  );
} catch {
  process.stderr.write(
    "Timeline sync failed. Check configuration and sync_runs.\n"
  );
  process.exitCode = 1;
} finally {
  await closeTimelineDatabase();
}
