import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { hasBearerSecret } from "@/lib/request-auth";
import { syncGitHubTimeline } from "@/lib/timeline-github";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (
    !hasBearerSecret(
      request.headers.get("authorization"),
      process.env.CRON_SECRET
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await syncGitHubTimeline();
    revalidateTag("timeline-edition", "max");
    return NextResponse.json({
      anonymousCoverage: result.anonymousCoverage,
      anonymousDays: result.anonymousDays,
      coverage: result.coverage,
      events: result.events,
      kind: result.kind,
      ok: true,
      privateActivity: result.privateActivity,
      rows: result.rows,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
