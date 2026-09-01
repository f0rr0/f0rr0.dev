import type { PublicActivityHead } from "@/lib/github-activity-types";

export const PUBLIC_ACTIVITY_MAX_STATUS_REQUESTS = 12;
export const PUBLIC_ACTIVITY_MAX_SETTLED_REQUESTS = 3;
export const PUBLIC_ACTIVITY_SETTLED_POLL_MS = 5 * 60 * 1000;
export const PUBLIC_ACTIVITY_SUMMARY_POLL_MS = 3 * 60 * 1000;

const REVISION = /^(?:0|[1-9]\d*)$/u;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
};

const isPublicActivityRevision = (value: unknown): value is string =>
  typeof value === "string" && REVISION.test(value);

export const publicActivityHeadFrom = (
  value: unknown
): PublicActivityHead | null => {
  if (
    !isObject(value) ||
    !isPublicActivityRevision(value.revision) ||
    !isPublicActivityRevision(value.feedRevision) ||
    (value.lastPublishedAt !== null && !isIsoDate(value.lastPublishedAt)) ||
    typeof value.summarizing !== "boolean"
  ) {
    return null;
  }
  return {
    feedRevision: value.feedRevision,
    lastPublishedAt: value.lastPublishedAt,
    revision: value.revision,
    summarizing: value.summarizing,
  };
};

export const comparePublicActivityRevisions = (left: string, right: string) => {
  const leftRevision = REVISION.test(left) ? BigInt(left) : BigInt(-1);
  const rightRevision = REVISION.test(right) ? BigInt(right) : BigInt(-1);
  return leftRevision < rightRevision
    ? -1
    : leftRevision > rightRevision
      ? 1
      : 0;
};

export interface PublicActivityPollState {
  requestCount: number;
  settledRequestCount: number;
}

export interface PublicActivityPollPlan {
  delayMs: number;
  kind: "settled" | "summarizing";
}

export const nextPublicActivityPoll = (
  head: PublicActivityHead,
  state: PublicActivityPollState
): PublicActivityPollPlan | null => {
  if (state.requestCount >= PUBLIC_ACTIVITY_MAX_STATUS_REQUESTS) {
    return null;
  }
  if (head.summarizing) {
    return {
      delayMs: PUBLIC_ACTIVITY_SUMMARY_POLL_MS,
      kind: "summarizing",
    };
  }
  return state.settledRequestCount >= PUBLIC_ACTIVITY_MAX_SETTLED_REQUESTS
    ? null
    : { delayMs: PUBLIC_ACTIVITY_SETTLED_POLL_MS, kind: "settled" };
};

const relativeTime = (then: string, now: number) => {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(then).getTime()) / 1000)
  );
  if (elapsedSeconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${String(hours)} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${String(days)} ${days === 1 ? "day" : "days"} ago`;
};

export const publicActivityStatusText = (
  head: PublicActivityHead,
  now: number
) => {
  if (head.summarizing) {
    return "Shaping the latest update";
  }
  return head.lastPublishedAt === null
    ? "Activity is up to date"
    : `Updated ${relativeTime(head.lastPublishedAt, now)}`;
};
