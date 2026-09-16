import "server-only";
import { unstable_cache } from "next/cache";

import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
  readPublicGitHubActivityHead,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";
import { reportOperationalError } from "@/lib/operational-error";

const readCachedInitialGitHubActivity = unstable_cache(
  async () =>
    await readPublicGitHubActivityPage(
      null,
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
    ),
  ["public-github-activity-initial-v1"],
  { revalidate: 60 }
);

export const getInitialGitHubActivity = async () => {
  try {
    return await readCachedInitialGitHubActivity();
  } catch (error) {
    // Catch outside the cache so an outage never replaces a successful snapshot.
    reportOperationalError("github_activity_initial", error);
    return null;
  }
};

export const getGitHubActivityPage = async (cursor: GitHubActivityCursor) =>
  await readPublicGitHubActivityPage(
    cursor,
    PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
  );

export const getGitHubActivityHead = async () =>
  await readPublicGitHubActivityHead();
