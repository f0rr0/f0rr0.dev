import { decodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import { getGitHubActivityPage } from "@/lib/github-activity-feed";
import { reportOperationalError } from "@/lib/operational-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let cursor;
  try {
    cursor = decodeGitHubActivityCursor(
      new URL(request.url).searchParams.get("cursor")
    );
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (cursor === null) {
    return Response.json({ ok: false }, { status: 400 });
  }
  try {
    const page = await getGitHubActivityPage(cursor);
    return Response.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    reportOperationalError("github_activity_page", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
