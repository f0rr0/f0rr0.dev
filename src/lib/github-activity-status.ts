import type { PublicActivityHead } from "@/lib/github-activity-types";

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
    (value.orderingRevision !== undefined &&
      !isPublicActivityRevision(value.orderingRevision)) ||
    (value.lastPublishedAt !== null && !isIsoDate(value.lastPublishedAt)) ||
    typeof value.summarizing !== "boolean"
  ) {
    return null;
  }
  return {
    feedRevision: value.feedRevision,
    ...(value.orderingRevision === undefined
      ? {}
      : { orderingRevision: value.orderingRevision }),
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

export const hasNewPublicActivity = (
  head: PublicActivityHead,
  feedRevision: string,
  orderingRevision: string
) =>
  comparePublicActivityRevisions(head.feedRevision, feedRevision) > 0 ||
  (head.orderingRevision !== undefined &&
    comparePublicActivityRevisions(head.orderingRevision, orderingRevision) >
      0);

export async function fetchPublicActivityHead(
  initialHead: PublicActivityHead,
  signal?: AbortSignal
) {
  const response = await fetch("/api/github/activity/head", {
    signal,
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error("Activity status is unavailable.");
  }
  const nextHead = publicActivityHeadFrom(await response.json());
  if (nextHead === null) {
    throw new Error("Activity status is invalid.");
  }
  return comparePublicActivityRevisions(
    nextHead.revision,
    initialHead.revision
  ) < 0 ||
    comparePublicActivityRevisions(
      nextHead.feedRevision,
      initialHead.feedRevision
    ) < 0 ||
    (nextHead.orderingRevision !== undefined &&
      initialHead.orderingRevision !== undefined &&
      comparePublicActivityRevisions(
        nextHead.orderingRevision,
        initialHead.orderingRevision
      ) < 0)
    ? initialHead
    : nextHead;
}
