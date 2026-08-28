import { decodeGitHubActivityCursor } from "@/lib/github-activity-cursor";
import { getGitHubActivityPage } from "@/lib/github-activity-feed";

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
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      },
    });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
