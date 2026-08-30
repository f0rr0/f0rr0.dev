import "server-only";
import { unstable_cache } from "next/cache";

import { isDatabaseConfigured } from "@/db/client";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

const emptyPage = (): PublicGitHubActivityPage => ({
  days: [],
  nextCursor: null,
  snapshotAt: new Date().toISOString(),
});

const readCachedActivity = unstable_cache(
  async (cursor: GitHubActivityCursor | null) =>
    await readPublicGitHubActivityPage(
      cursor,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ),
  ["public-github-activity-v12"],
  { revalidate: 900, tags: ["github-activity"] }
);

export const getInitialGitHubActivity = async () => {
  if (!isDatabaseConfigured()) {
    return emptyPage();
  }
  return await readCachedActivity(null);
};

export const getGitHubActivityPage = async (cursor: GitHubActivityCursor) => {
  if (!isDatabaseConfigured()) {
    return emptyPage();
  }
  return await readCachedActivity(cursor);
};
