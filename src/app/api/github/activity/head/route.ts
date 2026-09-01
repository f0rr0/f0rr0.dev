import { getGitHubActivityHead } from "@/lib/github-activity-feed";
import { reportOperationalError } from "@/lib/operational-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "private, no-cache";

const etagMatches = (requestValue: string | null, current: string) =>
  requestValue === "*" ||
  requestValue
    ?.split(",")
    .map((value) => value.trim())
    .includes(current) === true;

export async function GET(request: Request) {
  try {
    const { etag, head } = await getGitHubActivityHead();
    const headers = { "Cache-Control": CACHE_CONTROL, ETag: etag };
    if (etagMatches(request.headers.get("if-none-match"), etag)) {
      return new Response(null, { headers, status: 304 });
    }
    return Response.json(head, { headers });
  } catch (error) {
    reportOperationalError("github_activity_head", error);
    return Response.json(
      { ok: false },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
