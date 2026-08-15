import "server-only";
import { setTimeout as delay } from "node:timers/promises";

import { unstable_cache } from "next/cache";

import {
  createGitHubContributionWindow,
  createUnavailableGitHubProfile,
  parseGitHubContributionCalendarHtml,
  parseGitHubProfileResponse,
  parseGitHubRepositoriesResponse,
} from "@/lib/github-profile-core";
import type { GitHubProfile } from "@/lib/github-profile-core";

export type {
  AvailableGitHubActivity,
  GitHubActivity,
  GitHubActivityLevel,
  GitHubActivityWeek,
  GitHubContributionDay,
  GitHubContributionWindow,
  GitHubDataStatus,
  GitHubProfile,
  GitHubProject,
  UnavailableGitHubActivity,
} from "@/lib/github-profile-core";

const GITHUB_LOGIN = "f0rr0";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_REST_URL = `https://api.github.com/users/${GITHUB_LOGIN}/repos`;
const GITHUB_CONTRIBUTIONS_URL = `https://github.com/users/${GITHUB_LOGIN}/contributions`;
const GITHUB_FETCH_TIMEOUT_MS = 10_000;
const GITHUB_FETCH_ATTEMPTS = 3;
const GITHUB_CACHE_SECONDS = 60 * 60 * 12;

const githubProfileQuery = `
  query PortfolioGitHubProfile(
    $login: String!
    $from: DateTime!
    $to: DateTime!
  ) {
    user(login: $login) {
      login
      contributionsCollection(from: $from, to: $to) {
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
      repositories(
        first: 100
        ownerAffiliations: OWNER
        privacy: PUBLIC
        isFork: false
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        nodes {
          name
          description
          url
          isPrivate
          isFork
          owner {
            login
          }
          stargazerCount
          forkCount
          updatedAt
          primaryLanguage {
            name
            color
          }
          repositoryTopics(first: 5) {
            nodes {
              topic {
                name
              }
            }
          }
        }
      }
    }
  }
`;

const readGitHubToken = () => {
  for (const token of [process.env.GITHUB_TOKEN, process.env.GH_TOKEN]) {
    const normalized = token?.trim();
    if (normalized !== undefined && normalized.length > 0) {
      return normalized;
    }
  }

  return null;
};

const fetchGitHubResource = async (url: string, init: RequestInit = {}) => {
  for (let attempt = 0; attempt < GITHUB_FETCH_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === GITHUB_FETCH_ATTEMPTS - 1) {
        throw error;
      }
      await delay(200 * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      return response;
    }
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    if (attempt === GITHUB_FETCH_ATTEMPTS - 1) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }

    await delay(200 * 2 ** attempt);
  }

  throw new Error("GitHub request retry budget exhausted.");
};

const fetchAuthenticatedGitHubProfile = async (
  token: string,
  fetchedAt: Date,
  window: ReturnType<typeof createGitHubContributionWindow>
): Promise<GitHubProfile> => {
  const response = await fetchGitHubResource(GITHUB_GRAPHQL_URL, {
    body: JSON.stringify({
      query: githubProfileQuery,
      variables: {
        from: window.from,
        login: GITHUB_LOGIN,
        to: window.to,
      },
    }),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "f0rr0.dev",
    },
    method: "POST",
  });

  const payload: unknown = await response.json();
  const profile = parseGitHubProfileResponse(payload, {
    fetchedAt: fetchedAt.toISOString(),
    login: GITHUB_LOGIN,
    window,
  });

  if (profile === null) {
    throw new Error("GitHub returned an invalid profile response.");
  }

  return profile;
};

const fetchPublicRepositories = async () => {
  const url = new URL(GITHUB_REST_URL);
  url.searchParams.set("direction", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("type", "owner");

  const response = await fetchGitHubResource(url.toString(), {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "f0rr0.dev",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  return (await response.json()) as unknown;
};

const fetchContributionCalendar = async (year: number) => {
  const url = new URL(GITHUB_CONTRIBUTIONS_URL);
  url.searchParams.set("from", `${year}-01-01`);
  url.searchParams.set("to", `${year}-12-31`);

  const response = await fetchGitHubResource(url.toString(), {
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "f0rr0.dev",
    },
  });

  return await response.text();
};

const fetchContributionCalendars = async (years: readonly number[]) => {
  const calendars: string[] = [];
  for (const year of years) {
    calendars.push(await fetchContributionCalendar(year));
  }
  return calendars;
};

const fetchPublicGitHubProfile = async (
  fetchedAt: Date,
  window: ReturnType<typeof createGitHubContributionWindow>
): Promise<GitHubProfile> => {
  const years = [
    ...new Set([
      new Date(window.from).getUTCFullYear(),
      new Date(window.to).getUTCFullYear(),
    ]),
  ];
  const [repositoryResult] = await Promise.allSettled([
    fetchPublicRepositories(),
  ]);
  const [calendarResult] = await Promise.allSettled([
    fetchContributionCalendars(years),
  ]);
  const projects =
    repositoryResult.status === "fulfilled"
      ? parseGitHubRepositoriesResponse(repositoryResult.value, GITHUB_LOGIN)
      : null;
  const activity =
    calendarResult.status === "fulfilled"
      ? parseGitHubContributionCalendarHtml(calendarResult.value, window)
      : null;

  if (projects === null && activity === null) {
    throw new Error("GitHub returned invalid public profile data.");
  }

  const unavailableProfile = createUnavailableGitHubProfile({
    login: GITHUB_LOGIN,
    window,
  });

  return {
    activity: activity ?? unavailableProfile.activity,
    fetchedAt: fetchedAt.toISOString(),
    login: GITHUB_LOGIN,
    profileUrl: `https://github.com/${GITHUB_LOGIN}`,
    projects: projects ?? unavailableProfile.projects,
    status: projects === null ? "unavailable" : "available",
  };
};

const fetchGitHubProfile = async (): Promise<GitHubProfile> => {
  const fetchedAt = new Date();
  const window = createGitHubContributionWindow(fetchedAt);
  const token = readGitHubToken();

  if (token === null) {
    return await fetchPublicGitHubProfile(fetchedAt, window);
  }

  try {
    return await fetchAuthenticatedGitHubProfile(token, fetchedAt, window);
  } catch {
    return await fetchPublicGitHubProfile(fetchedAt, window);
  }
};

const getCachedGitHubProfile = unstable_cache(
  fetchGitHubProfile,
  ["portfolio-github-profile-v5", GITHUB_LOGIN],
  {
    revalidate: GITHUB_CACHE_SECONDS,
    tags: ["github-profile"],
  }
);

export const getGitHubProfile = async (): Promise<GitHubProfile> => {
  try {
    return await getCachedGitHubProfile();
  } catch {
    return createUnavailableGitHubProfile({
      login: GITHUB_LOGIN,
      window: createGitHubContributionWindow(),
    });
  }
};
