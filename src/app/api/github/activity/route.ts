import { decodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import { getGitHubActivityPage } from "@/lib/github-activity-feed";
import { GitHubActivityOrderingChangedError } from "@/lib/github-activity-store";
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
    return Response.json(
      { ok: false },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
  if (cursor === null) {
    return Response.json(
      { ok: false },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
  try {
    const page = await getGitHubActivityPage(cursor);
    return Response.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof GitHubActivityOrderingChangedError) {
      return Response.json(
        { ok: false },
        { headers: { "Cache-Control": "no-store" }, status: 409 }
      );
    }
    reportOperationalError("github_activity_page", error);
    return Response.json(
      { ok: false },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
