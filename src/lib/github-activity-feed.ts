import "server-only";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
  readPublicGitHubActivityHead,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";
import { reportOperationalError } from "@/lib/operational-error";
import { readPublicSnapshot } from "@/lib/public-snapshot";
import { readRuntimeCache, writeRuntimeCache } from "@/lib/runtime-cache";

const FALLBACK_KEY = "public-github-activity-fallback-v3";
const contentKey = (
  page: Pick<PublicGitHubActivityPage, "head" | "orderingRevision">
) =>
  JSON.stringify([
    "public-github-activity-v3",
    page.head.feedRevision,
    page.orderingRevision,
  ]);

export const getInitialGitHubActivity = async () => {
  const fallbackRead = readRuntimeCache<PublicGitHubActivityPage>(FALLBACK_KEY);
  let cacheWrites: Promise<unknown> | undefined;
  let bodyRead: Promise<PublicGitHubActivityPage> | undefined;
  const readBody = async () =>
    await (bodyRead ??= readPublicGitHubActivityPage(
      null,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ));
  const healthyRead = (async () => {
    const live = await readPublicGitHubActivityHead();
    const [versioned, fallback] = await Promise.all([
      readRuntimeCache<PublicGitHubActivityPage>(contentKey(live)),
      fallbackRead,
    ]);
    const cached =
      fallback?.head.feedRevision === live.head.feedRevision &&
      fallback.orderingRevision === live.orderingRevision
        ? fallback
        : versioned;
    const snapshot = cached ?? (await readBody());
    const page =
      snapshot.head.feedRevision === live.head.feedRevision &&
      snapshot.orderingRevision === live.orderingRevision &&
      BigInt(live.head.revision) >= BigInt(snapshot.head.revision)
        ? { ...snapshot, head: live.head }
        : snapshot;
    cacheWrites = Promise.all([
      cached === null
        ? writeRuntimeCache(contentKey(snapshot), snapshot, 3600)
        : undefined,
      fallback?.head.feedRevision === page.head.feedRevision &&
      fallback.head.revision === page.head.revision &&
      fallback.orderingRevision === page.orderingRevision
        ? undefined
        : writeRuntimeCache(FALLBACK_KEY, page),
    ]);
    return page;
  })();
  try {
    const page = await readPublicSnapshot(async () => await healthyRead);
    // Optional persistence must not turn a fresh, masked page into an old fallback.
    await cacheWrites;
    return page;
  } catch (error) {
    reportOperationalError("github_activity_initial", error);
    const fallback = await fallbackRead;
    if (fallback !== null) {
      return fallback;
    }
    // A timeout leaves the original read running. Reuse it instead of downloading
    // the page again. If metadata failed, one direct page read can still succeed.
    try {
      const page = await healthyRead;
      await cacheWrites;
      return page;
    } catch {
      try {
        const page = await readBody();
        await writeRuntimeCache(FALLBACK_KEY, page);
        return page;
      } catch {
        return null;
      }
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
