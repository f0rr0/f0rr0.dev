import "server-only";
import { unstable_cache } from "next/cache";

import { isDatabaseConfigured } from "@/db/client";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_PAGE_SIZE,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

const EMPTY_PAGE: PublicGitHubActivityPage = {
  items: [],
  nextCursor: null,
};

const readCachedInitialActivity = unstable_cache(
  async () => await readPublicGitHubActivityPage(null),
  ["public-github-activity-v1"],
  { revalidate: 900, tags: ["github-activity"] }
);

export const getInitialGitHubActivity = async () => {
  if (!isDatabaseConfigured()) {
    return EMPTY_PAGE;
  }
  try {
    return await readCachedInitialActivity();
  } catch {
    return EMPTY_PAGE;
  }
};

export const getGitHubActivityPage = async (cursor: GitHubActivityCursor) => {
  if (!isDatabaseConfigured()) {
    return EMPTY_PAGE;
  }
  return await readPublicGitHubActivityPage(
    cursor,
    PUBLIC_GITHUB_ACTIVITY_PAGE_SIZE
  );
};
