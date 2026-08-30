import { env } from "@/env";
import { reconcileGitHubRefs } from "@/lib/github-commits";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  githubCronStatusFromFailedAccounts,
  githubRefKindFrom,
  githubRefRepositoryLimitFrom,
} from "@/lib/github-cron-config";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const kind = githubRefKindFrom(searchParams.get("kind"));
  const repositoryLimit = githubRefRepositoryLimitFrom(
    searchParams.get("repositories")
  );
  if (kind === null || repositoryLimit === null) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const deadlineAt = Date.now() + GITHUB_CRON_EXECUTION_DURATION_MS;
  try {
    const result = await reconcileGitHubRefs({
      deadlineAt,
      kind,
      repositoryLimit,
    });
    const status = githubCronStatusFromFailedAccounts(result.failedAccounts);
    if (status === 503) {
      for (const failure of result.failedAccounts) {
        const error = new Error("GitHub ref reconciliation failed.");
        error.name = failure.error;
        reportOperationalError(`github_refs_${failure.account}`, error);
      }
      return Response.json({ ok: false, ...result }, { status });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const errorName = reportOperationalError("github_refs", error);
    return Response.json({ error: errorName, ok: false }, { status: 503 });
  }
}
