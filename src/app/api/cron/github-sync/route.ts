import { revalidateTag } from "next/cache";

import { syncGitHubAccounts } from "@/lib/github-commits";
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
    const result = await syncGitHubAccounts();
    if (result.commits > 0) {
      revalidateTag("github-commits", "max");
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.name : "UnknownError",
        ok: false,
      },
      { status: 503 }
    );
  }
}
