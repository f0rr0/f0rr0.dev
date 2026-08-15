import { setTimeout as delay } from "node:timers/promises";

import { parseGitHubContributionCalendarDays } from "@/lib/github-profile-core";
import type { GitHubContributionDay } from "@/lib/github-profile-core";

const GITHUB_FETCH_TIMEOUT_MS = 10_000;
const GITHUB_FETCH_ATTEMPTS = 3;
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const fetchContributionCalendar = async (login: string, year: number) => {
  const url = new URL(`https://github.com/users/${login}/contributions`);
  url.searchParams.set("from", `${year}-01-01`);
  url.searchParams.set("to", `${year}-12-31`);

  for (let attempt = 0; attempt < GITHUB_FETCH_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "f0rr0.dev",
        },
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
      return await response.text();
    }
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    if (attempt === GITHUB_FETCH_ATTEMPTS - 1) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    await delay(200 * 2 ** attempt);
  }

  throw new Error("GitHub contribution-calendar retry budget exhausted.");
};

export const fetchPublicGitHubContributionDays = async (input: {
  login: string;
  windowEnd: string;
  windowStart: string;
}): Promise<GitHubContributionDay[]> => {
  if (
    !GITHUB_LOGIN_PATTERN.test(input.login) ||
    !DATE_PATTERN.test(input.windowStart) ||
    !DATE_PATTERN.test(input.windowEnd) ||
    input.windowStart > input.windowEnd
  ) {
    throw new Error("Invalid GitHub contribution-calendar window.");
  }

  const years = [
    ...new Set([
      Number(input.windowStart.slice(0, 4)),
      Number(input.windowEnd.slice(0, 4)),
    ]),
  ];
  const htmlDocuments = await Promise.all(
    years.map(
      async (year) => await fetchContributionCalendar(input.login, year)
    )
  );
  const days = parseGitHubContributionCalendarDays(htmlDocuments, {
    from: `${input.windowStart}T00:00:00.000Z`,
    to: `${input.windowEnd}T23:59:59.999Z`,
  });

  if (days === null) {
    throw new Error("GitHub returned an invalid contribution calendar.");
  }
  return days;
};
