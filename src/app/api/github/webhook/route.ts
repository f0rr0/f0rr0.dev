import { createHmac } from "node:crypto";

import { revalidateTag } from "next/cache";

import { isDatabaseConfigured } from "@/db/client";
import { env } from "@/env";
import {
  githubDeliveryIdFrom,
  issueActionFromWebhook,
  issueFromWebhook,
  pullRequestObservationFromWebhook,
  pushFromWebhook,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import {
  persistIgnoredGitHubWebhookDelivery,
  persistGitHubWebhookIssue,
  persistGitHubWebhookPullRequest,
  persistGitHubWebhookPush,
} from "@/lib/github-commits-store";
import { reportOperationalError } from "@/lib/operational-error";
import { constantTimeEqual } from "@/lib/request-auth";

const MAXIMUM_PAYLOAD_BYTES = 4_500_000;
const GITHUB_EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const SUPPORTED_GITHUB_EVENTS = new Set(["issues", "pull_request", "push"]);

type SupportedGitHubEvent = "issues" | "pull_request" | "push";
type JsonObject = Record<string, unknown>;

class InvalidGitHubWebhookPayloadError extends Error {
  constructor() {
    super("A supported GitHub webhook payload was malformed.");
    this.name = "InvalidGitHubWebhookPayloadError";
  }
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const githubActorLogin = (value: unknown) =>
  typeof value === "string" &&
  value.length <= 100 &&
  /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?|[a-z\d](?:[a-z\d-]*[a-z\d])?\[bot\])$/iu.test(
    value
  )
    ? value
    : null;

const hasForeignActor = (value: unknown) => {
  const login = isObject(value) ? githubActorLogin(value.login) : null;
  return login !== null && trackedGitHubAccountFrom(login) === null;
};

const intentionallyIgnoredPush = (payload: unknown) => {
  if (!isObject(payload)) {
    return false;
  }
  if (payload.deleted === true) {
    return true;
  }
  if (
    typeof payload.ref === "string" &&
    payload.ref.startsWith("refs/") &&
    !payload.ref.startsWith("refs/heads/")
  ) {
    return true;
  }
  return isObject(payload.sender)
    ? hasForeignActor(payload.sender)
    : hasForeignActor(payload.pusher);
};

const intentionallyIgnoredIssue = (payload: unknown) => {
  const action = issueActionFromWebhook(payload);
  if (action !== "opened") {
    return action !== null;
  }
  return (
    isObject(payload) &&
    isObject(payload.issue) &&
    hasForeignActor(payload.issue.user)
  );
};

const supportedGitHubEventFrom = (event: string): SupportedGitHubEvent | null =>
  SUPPORTED_GITHUB_EVENTS.has(event) ? (event as SupportedGitHubEvent) : null;

export const dynamic = "force-dynamic";
export const maxDuration = 30;
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

const acceptedResponse = (input: {
  duplicate: boolean;
  ignored?: boolean;
  issues: number;
  paused: boolean;
  pullRequests: number;
  pushes: number;
}) =>
  Response.json(
    {
      accepted: !input.paused && input.ignored !== true,
      duplicate: input.duplicate,
      ignored: input.ignored ?? false,
      issues: input.issues,
      ok: true,
      paused: input.paused,
      pullRequests: input.pullRequests,
      pushes: input.pushes,
    },
    { status: 202 }
  );

const persistSupportedWebhook = async (
  deliveryId: string,
  eventType: SupportedGitHubEvent,
  payload: unknown
) => {
  if (eventType === "push") {
    const push = pushFromWebhook(payload);
    if (push !== null) {
      return await persistGitHubWebhookPush(deliveryId, push);
    }
    if (!intentionallyIgnoredPush(payload)) {
      throw new InvalidGitHubWebhookPayloadError();
    }
  } else if (eventType === "pull_request") {
    const observation = pullRequestObservationFromWebhook(payload);
    if (observation !== null) {
      return await persistGitHubWebhookPullRequest(
        deliveryId,
        observation.account,
        observation.pullRequest
      );
    }
    throw new InvalidGitHubWebhookPayloadError();
  } else {
    const issue = issueFromWebhook(payload);
    if (issue !== null) {
      return await persistGitHubWebhookIssue(deliveryId, issue);
    }
    if (!intentionallyIgnoredIssue(payload)) {
      throw new InvalidGitHubWebhookPayloadError();
    }
  }
  return await persistIgnoredGitHubWebhookDelivery({
    account: null,
    action: eventType === "issues" ? issueActionFromWebhook(payload) : null,
    deliveryId,
    event: eventType,
    repositoryId: null,
  });
};

const persistUnsupportedWebhook = async (deliveryId: string, event: string) => {
  try {
    return acceptedResponse(
      await persistIgnoredGitHubWebhookDelivery({
        account: null,
        action: null,
        deliveryId,
        event,
        repositoryId: null,
      })
    );
  } catch (error) {
    reportOperationalError("github_webhook_unsupported", error);
    return Response.json({ ok: false }, { status: 503 });
  }
};

export async function POST(request: Request) {
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET?.trim();
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

  const deliveryId = githubDeliveryIdFrom(
    request.headers.get("x-github-delivery")
  );
  if (deliveryId === null) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const eventName = request.headers.get("x-github-event")?.trim().toLowerCase();
  if (eventName === undefined || !GITHUB_EVENT_NAME.test(eventName)) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const eventType = supportedGitHubEventFrom(eventName);
  if (eventType === null) {
    return await persistUnsupportedWebhook(deliveryId, eventName);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    try {
      await persistIgnoredGitHubWebhookDelivery({
        account: null,
        action: null,
        deliveryId,
        event: eventType,
        repositoryId: null,
      });
    } catch (error) {
      reportOperationalError("github_webhook_invalid_delivery", error);
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const result = await persistSupportedWebhook(
      deliveryId,
      eventType,
      payload
    );
    if (result.issues > 0) {
      revalidateTag("github-activity", "max");
    }
    return acceptedResponse(result);
  } catch (error) {
    if (error instanceof InvalidGitHubWebhookPayloadError) {
      reportOperationalError("github_webhook_invalid_payload", error);
      return Response.json({ ok: false }, { status: 400 });
    }
    reportOperationalError("github_webhook_intake", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
