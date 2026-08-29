import { revalidateTag } from "next/cache";

import { env } from "@/env";
import { syncGitHubAccounts } from "@/lib/github-commits";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasBearerSecret(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await syncGitHubAccounts();
    if (result.issues > 0) {
      revalidateTag("github-activity", "max");
    }
    return Response.json(
      { ok: result.failedAccounts.length === 0, ...result },
      { status: result.failedAccounts.length === 0 ? 200 : 207 }
    );
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
