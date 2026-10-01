import "server-only";
import { unstable_cache } from "next/cache";

import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
  readPublicGitHubActivityHead,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";
import { reportOperationalError } from "@/lib/operational-error";
import { readPublicSnapshot } from "@/lib/public-snapshot";

// Keep a successful snapshot available even when the current head cannot be read.
// Publication invalidation must not discard this outage fallback.
const readCachedInitialGitHubActivity = unstable_cache(
  async () =>
    await readPublicGitHubActivityPage(
      null,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ),
  ["public-github-activity-fallback-v1"],
  { revalidate: 60 }
);

const readVersionedInitialGitHubActivity = unstable_cache(
  async (_feedRevision: string, _orderingRevision: string) =>
    await readPublicGitHubActivityPage(
      null,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ),
  ["public-github-activity-versioned-v1"],
  { revalidate: 60, tags: ["public-github-activity"] }
);

export const getInitialGitHubActivity = async () => {
  let fallback: PublicGitHubActivityPage | null = null;
  try {
    return await readPublicSnapshot(async () => {
      const { head, orderingRevision } = await readPublicGitHubActivityHead();
      fallback = await readCachedInitialGitHubActivity();
      if (
        BigInt(fallback.head.feedRevision) >= BigInt(head.feedRevision) &&
        BigInt(fallback.orderingRevision) >= BigInt(orderingRevision)
      ) {
        return fallback;
      }
      // An older in-flight read can only populate its own revision's cache key.
      return await readVersionedInitialGitHubActivity(
        head.feedRevision,
        orderingRevision
      );
    });
  } catch (error) {
    // Catch outside the cache so an outage never replaces a successful snapshot.
    reportOperationalError("github_activity_initial", error);
    if (fallback !== null) {
      return fallback;
    }
    try {
      return await readCachedInitialGitHubActivity();
    } catch {
      return null;
    }
  }
};

export const getGitHubActivityPage = async (cursor: GitHubActivityCursor) =>
  await readPublicGitHubActivityPage(
    cursor,
    PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
  );

export const getGitHubActivityHead = async () =>
  await readPublicGitHubActivityHead();
