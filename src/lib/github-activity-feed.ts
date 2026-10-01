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
// Capture the successful page without putting it in the stable cache key.
const readCachedInitialGitHubActivity = async (
  snapshot?: Promise<PublicGitHubActivityPage>
) =>
  await unstable_cache(
    async () =>
      await (snapshot ??
        readPublicGitHubActivityPage(
          null,
          PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
        )),
    ["public-github-activity-fallback-v2"],
    { revalidate: 60 }
  )();

const readVersionedInitialGitHubActivity = unstable_cache(
  async (_feedRevision: string, _orderingRevision: string) =>
    await readPublicGitHubActivityPage(
      null,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ),
  ["public-github-activity-versioned-v2"],
  { revalidate: 3600, tags: ["public-github-activity"] }
);

export const getInitialGitHubActivity = async () => {
  try {
    return await readPublicSnapshot(async () => {
      const { head, orderingRevision } = await readPublicGitHubActivityHead();
      const snapshot = readVersionedInitialGitHubActivity(
        head.feedRevision,
        orderingRevision
      ).then((page) =>
        page.head.feedRevision === head.feedRevision &&
        page.orderingRevision === orderingRevision &&
        BigInt(head.revision) >= BigInt(page.head.revision)
          ? { ...page, head }
          : page
      );
      // Check both caches concurrently; an expired fallback waits for the same successful snapshot.
      const [page] = await Promise.all([
        snapshot,
        readCachedInitialGitHubActivity(snapshot),
      ]);
      return page;
    });
  } catch (error) {
    reportOperationalError("github_activity_initial", error);
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
