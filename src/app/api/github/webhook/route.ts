import { createHmac } from "node:crypto";

import { revalidateTag } from "next/cache";

import { isDatabaseConfigured } from "@/db/client";
import { processPendingGitHubActivity } from "@/lib/github-activity-processor";
import { syncGitHubWebhookPush } from "@/lib/github-commits";
import { pushFromWebhook } from "@/lib/github-commits-core";
import { constantTimeEqual } from "@/lib/request-auth";

const MAXIMUM_PAYLOAD_BYTES = 2_000_000;

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const validSignature = (
  body: string,
  signature: string | null,
  secret: string
) => {
  if (signature === null || !/^sha256=[a-f\d]{64}$/i.test(signature)) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", secret)
    .update(body, "utf-8")
    .digest("hex")}`;
  return constantTimeEqual(signature.toLowerCase(), expected);
};

export async function POST(request: Request) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (
    webhookSecret === undefined ||
    webhookSecret.length < 32 ||
    !isDatabaseConfigured()
  ) {
    return Response.json({ ok: false }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAXIMUM_PAYLOAD_BYTES
  ) {
    return Response.json({ ok: false }, { status: 413 });
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf-8") > MAXIMUM_PAYLOAD_BYTES) {
    return Response.json({ ok: false }, { status: 413 });
  }
  if (
    !validSignature(
      body,
      request.headers.get("x-hub-signature-256"),
      webhookSecret
    )
  ) {
    return Response.json({ ok: false }, { status: 401 });
  }
  if (request.headers.get("x-github-event") !== "push") {
    return Response.json({ ignored: true, ok: true }, { status: 202 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const push = pushFromWebhook(payload);
  if (push === null) {
    return Response.json({ ignored: true, ok: true }, { status: 202 });
  }

  try {
    const commits = await syncGitHubWebhookPush(push);
    let activity:
      | Awaited<ReturnType<typeof processPendingGitHubActivity>>
      | { unavailable: true };
    try {
      activity = await processPendingGitHubActivity();
      if (activity.completed > 0) {
        revalidateTag("github-activity", "max");
      }
    } catch {
      activity = { unavailable: true };
    }
    return Response.json({
      activity,
      commits,
      ok: true,
      repository: push.repository.fullName,
    });
  } catch {
    // A non-2xx response keeps the GitHub delivery retryable. Duplicate commit
    // inserts are harmless because repository ID and SHA form the primary key.
    return Response.json({ ok: false }, { status: 503 });
  }
}
