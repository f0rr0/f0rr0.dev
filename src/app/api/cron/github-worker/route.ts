import { revalidateTag } from "next/cache";

import { runGitHubActivityWorker } from "@/lib/github-activity-worker";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    !hasBearerSecret(
      request.headers.get("authorization"),
      process.env.CRON_SECRET
    )
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const activity = await runGitHubActivityWorker();
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
