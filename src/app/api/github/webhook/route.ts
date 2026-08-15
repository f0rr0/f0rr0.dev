import { createHmac } from "node:crypto";

import { revalidateTag } from "next/cache";
import { after, NextResponse } from "next/server";

import { isTimelineDatabaseConfigured } from "@/db/client";
import { constantTimeEqual } from "@/lib/request-auth";
import { syncGitHubTimeline } from "@/lib/timeline-github";
import { normalizeTimelinePrivacyKey } from "@/lib/timeline-privacy";
import {
  deletePrivateTimelineActivity,
  deleteTimelineActivityByRepoKey,
  deleteTimelinePublicEventsByRepoKey,
  markTimelineWebhookProcessed,
  pruneTimelineWebhookReceipts,
  recordTimelineWebhookReceipt,
  rejectPublishedTimelineEditions,
} from "@/lib/timeline-store";
import { timelineRevocationFromWebhook } from "@/lib/timeline-webhook";

const maximumPayloadBytes = 2_000_000;
const supportedEvents = new Set([
  "installation",
  "installation_repositories",
  "push",
  "repository",
]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const verifySignature = (
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
  return constantTimeEqual(signature.toLocaleLowerCase("en-US"), expected);
};

export async function POST(request: Request) {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (
    webhookSecret === undefined ||
    webhookSecret.length < 24 ||
    !isTimelineDatabaseConfigured()
  ) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumPayloadBytes) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf-8") > maximumPayloadBytes) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  if (
    !verifySignature(
      body,
      request.headers.get("x-hub-signature-256"),
      webhookSecret
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const eventType = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  if (
    !supportedEvents.has(eventType) ||
    !/^[a-z\d-]{8,100}$/i.test(deliveryId)
  ) {
    return NextResponse.json({ ignored: true, ok: true }, { status: 202 });
  }

  const privacyKey = normalizeTimelinePrivacyKey(
    process.env.TIMELINE_PRIVACY_KEY
  );
  const receiptKey = createHmac("sha256", privacyKey ?? webhookSecret)
    .update(`github-delivery:${deliveryId}`, "utf-8")
    .digest("hex");
  const revocation = timelineRevocationFromWebhook(body, eventType, privacyKey);
  const shouldRevoke =
    revocation.repoKeys.length > 0 || revocation.withdrawAllPrivateActivity;

  try {
    await pruneTimelineWebhookReceipts();
    const accepted = await recordTimelineWebhookReceipt({
      deliveryKey: receiptKey,
      eventType,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });

    if (!accepted) {
      return NextResponse.json({ duplicate: true, ok: true }, { status: 202 });
    }

    after(async () => {
      try {
        if (shouldRevoke) {
          if (revocation.withdrawAllPrivateActivity) {
            await deletePrivateTimelineActivity("f0rr0");
          }
          for (const repoKey of revocation.repoKeys) {
            await Promise.all([
              deleteTimelineActivityByRepoKey("f0rr0", repoKey),
              deleteTimelinePublicEventsByRepoKey("f0rr0", repoKey),
            ]);
          }
          await rejectPublishedTimelineEditions();
          revalidateTag("github-profile", "max");
          revalidateTag("timeline-edition", "max");
        }
        await syncGitHubTimeline({
          forceBackfill: shouldRevoke,
          kind: "webhook",
        });
        await markTimelineWebhookProcessed(receiptKey);
      } catch {
        // The sync run records a non-sensitive failure code for reconciliation.
      }
    });

    return NextResponse.json({ accepted: true, ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
