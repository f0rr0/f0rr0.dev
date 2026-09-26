import { unstable_cache } from "next/cache";
import "server-only";

import { primaryGitHubProfile } from "@/content/resume";
import { fetchGitHub, githubApiUrl } from "@/lib/github-api";
import {
  createUnavailableGitHubProfile,
  parseGitHubRepositoriesResponse,
} from "@/lib/github-profile-core";
import type { GitHubProfile } from "@/lib/github-profile-core";

export type { GitHubProfile } from "@/lib/github-profile-core";

const GITHUB_LOGIN = primaryGitHubProfile.username;
const GITHUB_CACHE_SECONDS = 60 * 60 * 12;

const fetchGitHubProfile = async (): Promise<GitHubProfile> => {
  const url = githubApiUrl(`/users/${GITHUB_LOGIN}/repos`);
  url.searchParams.set("direction", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("type", "owner");

  const response = await fetchGitHub(url);
  const projects = parseGitHubRepositoriesResponse(
    (await response.json()) as unknown,
    GITHUB_LOGIN
  );
  if (projects === null) {
    throw new Error("GitHub returned an invalid repository response.");
  }

  return {
    fetchedAt: new Date().toISOString(),
    login: GITHUB_LOGIN,
    profileUrl: `https://github.com/${GITHUB_LOGIN}`,
    projects,
    status: "available",
  };
};

const getCachedGitHubProfile = unstable_cache(
  fetchGitHubProfile,
  ["portfolio-github-profile-v7", GITHUB_LOGIN],
  { revalidate: GITHUB_CACHE_SECONDS, tags: ["github-profile"] }
);

export const getGitHubProfile = async (): Promise<GitHubProfile> => {
  try {
    return await getCachedGitHubProfile();
  } catch {
    return createUnavailableGitHubProfile(GITHUB_LOGIN);
  }
};
