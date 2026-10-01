import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { env } from "@/env";
import { getInitialGitHubActivity } from "@/lib/github-activity-feed";
import { runGitHubActivityWorker } from "@/lib/github-activity-worker";
import { workerBatchSizeFrom } from "@/lib/github-activity-worker-core";
import { GITHUB_WORKER_EXECUTION_DURATION_MS } from "@/lib/github-cron-config";
import type { GITHUB_WORKER_MAX_DURATION_SECONDS } from "@/lib/github-cron-config";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";
import { warmPublicPages } from "@/lib/warm-public-pages";

export const dynamic = "force-dynamic";
export const maxDuration =
  60 satisfies typeof GITHUB_WORKER_MAX_DURATION_SECONDS;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!hasBearerSecret(authorization, env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const batchSize = workerBatchSizeFrom(params.get("batch"));
  if (batchSize === null) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const activity = await runGitHubActivityWorker({
      includeProjection: true,
      maximumDurationMs: GITHUB_WORKER_EXECUTION_DURATION_MS,
      ...(batchSize === undefined
        ? {}
        : {
            commitLimit: batchSize,
            observationLimit: batchSize,
            pullRequestDiscoveryLimit: batchSize,
            pullRequestLimit: batchSize,
            pullRequestSignalLimit: batchSize,
            refLimit: 1,
          }),
    });
    if (activity.projection?.feedRevisionChanged === true) {
      revalidatePath("/");
      revalidatePath("/work");

      after(async () => {
        if ((await getInitialGitHubActivity()) !== null) {
          await warmPublicPages(["/", "/work"]);
        }
      });
    }
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
