import { githubBackfillRequestFrom } from "@/lib/github-backfill-core";
import { queueGitHubBackfill } from "@/lib/github-commits";
import { reportOperationalError } from "@/lib/operational-error";
import { hasBearerSecret } from "@/lib/request-auth";

const MAXIMUM_PAYLOAD_BYTES = 4096;

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (
    !hasBearerSecret(
      request.headers.get("authorization"),
      process.env.GITHUB_BACKFILL_SECRET
    )
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAXIMUM_PAYLOAD_BYTES
  ) {
    return Response.json({ ok: false }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf-8") > MAXIMUM_PAYLOAD_BYTES) {
      return Response.json({ ok: false }, { status: 413 });
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const backfill = githubBackfillRequestFrom(body);
  if (backfill === null) {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const result = await queueGitHubBackfill(backfill);
    const ok = result.failedAccounts.length === 0;
    return Response.json(
      {
        ...result,
        endDate: backfill.endDate,
        ok,
        repositoryId: backfill.repositoryId,
        startDate: backfill.startDate,
        windows: backfill.windows.length,
      },
      { status: ok ? 202 : 207 }
    );
  } catch (error) {
    const errorName = reportOperationalError("github_backfill", error);
    return Response.json({ error: errorName, ok: false }, { status: 503 });
  }
}
