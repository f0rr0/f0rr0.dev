import { revalidateTag } from "next/cache";

import { env } from "@/env";
import { runGitHubActivityWorker } from "@/lib/github-activity-worker";
import { workerBatchSizeFrom } from "@/lib/github-activity-worker-core";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (
    !hasBearerSecret(authorization, env.CRON_SECRET) &&
    !hasBearerSecret(authorization, env.GITHUB_BACKFILL_SECRET)
  ) {
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
        ? {}
        : {
            commitLimit: batchSize,
            observationLimit: batchSize,
            pullRequestDiscoveryLimit: batchSize,
            summaryLimit: batchSize,
          }
    );
    if (
      activity.summaries.completed > 0 ||
      activity.pullRequests.completed > 0 ||
      activity.aliases > 0
    ) {
      revalidateTag("github-activity", "max");
    }
    return Response.json({ activity, ok: true });
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
