import "server-only";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import {
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
  readPublicGitHubActivityHead,
  readPublicGitHubActivityPage,
} from "@/lib/github-activity-store";

export const getInitialGitHubActivity = async () =>
  await readPublicGitHubActivityPage(
    null,
    PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
  );

export const getGitHubActivityPage = async (cursor: GitHubActivityCursor) =>
  await readPublicGitHubActivityPage(
    cursor,
    PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE
  );

export const getGitHubActivityHead = async () =>
  await readPublicGitHubActivityHead();
