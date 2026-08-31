import { revalidateTag } from "next/cache";

import { env } from "@/env";
import { runGitHubActivityWorker } from "@/lib/github-activity-worker";
import { workerBatchSizeFrom } from "@/lib/github-activity-worker-core";
import { ensureGitHubEvidenceIntegrity } from "@/lib/github-activity-worker-store";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
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

  let evidenceRecovery: Awaited<
    ReturnType<typeof ensureGitHubEvidenceIntegrity>
  >;
  try {
    evidenceRecovery = await ensureGitHubEvidenceIntegrity();
  } catch (error) {
    const errorName = reportOperationalError("github_evidence_recovery", error);
    return Response.json(
      {
        error: errorName,
        evidenceRecovery: "failed",
        ok: false,
      },
      { status: 503 }
    );
  }

  try {
    const activity = await runGitHubActivityWorker(
      batchSize === undefined
        ? {}
        : {
            commitLimit: batchSize,
            observationLimit: batchSize,
            pullRequestDiscoveryLimit: batchSize,
            pullRequestLimit: batchSize,
            pullRequestSignalLimit: batchSize,
            summaryLimit: batchSize,
          }
    );
    if (
      evidenceRecovery.status === "applied" ||
      activity.summaries.completed > 0 ||
      activity.pullRequests.completed > 0 ||
      activity.canonicalizationAttempts > 0 ||
      activity.aliases > 0
    ) {
      revalidateTag("github-activity", "max");
    }
    return Response.json({
      activity,
      evidenceRecovery: evidenceRecovery.status,
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
