import { env } from "@/env";
import { GITHUB_WORKER_EXECUTION_DURATION_MS } from "@/lib/github-cron-config";
import type { GITHUB_WORKER_MAX_DURATION_SECONDS } from "@/lib/github-cron-config";
import { runGitHubWorkUnitSummaryWorker } from "@/lib/github-work-unit-summary-worker";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration =
  60 satisfies typeof GITHUB_WORKER_MAX_DURATION_SECONDS;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const summary = await runGitHubWorkUnitSummaryWorker(
      GITHUB_WORKER_EXECUTION_DURATION_MS
    );
    return Response.json({ ok: true, summary });
  } catch (error) {
    const errorName = reportOperationalError("github_summary", error);
    return Response.json({ error: errorName, ok: false }, { status: 503 });
  }
}
