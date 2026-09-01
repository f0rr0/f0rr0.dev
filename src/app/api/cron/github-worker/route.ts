import { env } from "@/env";
import { runGitHubActivityWorker } from "@/lib/github-activity-worker";
import { workerBatchSizeFrom } from "@/lib/github-activity-worker-core";
import { GITHUB_CRON_EXECUTION_DURATION_MS } from "@/lib/github-cron-config";
import type { GITHUB_ROUTINE_MAX_DURATION_SECONDS } from "@/lib/github-cron-config";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration =
  15 satisfies typeof GITHUB_ROUTINE_MAX_DURATION_SECONDS;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!hasBearerSecret(authorization, env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const batchSize = workerBatchSizeFrom(
    new URL(request.url).searchParams.get("batch")
  );
  if (batchSize === null) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const activity = await runGitHubActivityWorker(
      batchSize === undefined
        ? { maximumDurationMs: GITHUB_CRON_EXECUTION_DURATION_MS }
        : {
            commitLimit: batchSize,
            maximumDurationMs: GITHUB_CRON_EXECUTION_DURATION_MS,
            observationLimit: batchSize,
            pullRequestDiscoveryLimit: batchSize,
            pullRequestLimit: batchSize,
            pullRequestSignalLimit: batchSize,
            refLimit: 1,
          }
    );
    return Response.json({
      activity,
      ok: true,
    });
  } catch (error) {
    const errorName = reportOperationalError("github_worker", error);
    return Response.json(
      {
        error: errorName,
        ok: false,
      },
      { status: 503 }
    );
  }
}
