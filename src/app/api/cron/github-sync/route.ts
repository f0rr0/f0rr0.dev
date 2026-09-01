import { env } from "@/env";
import { syncGitHubAccounts } from "@/lib/github-commits";
import type { GITHUB_ROUTINE_MAX_DURATION_SECONDS } from "@/lib/github-cron-config";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  githubCronStatusFromFailedAccounts,
} from "@/lib/github-cron-config";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration =
  15 satisfies typeof GITHUB_ROUTINE_MAX_DURATION_SECONDS;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const deadlineAt = Date.now() + GITHUB_CRON_EXECUTION_DURATION_MS;
  try {
    const result = await syncGitHubAccounts({ deadlineAt });
    const status = githubCronStatusFromFailedAccounts(result.failedAccounts);
    if (status === 503) {
      for (const failure of result.failedAccounts) {
        const error = new Error("GitHub Events intake failed.");
        error.name = failure.error;
        reportOperationalError(`github_sync_${failure.account}`, error);
      }
      return Response.json({ ok: false, ...result }, { status });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const errorName = reportOperationalError("github_sync", error);
    return Response.json(
      {
        error: errorName,
        ok: false,
      },
      { status: 503 }
    );
  }
}
