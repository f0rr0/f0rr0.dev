import { describe, expect, test } from "bun:test";

import {
  createGitHubContributionWindow,
  createUnavailableGitHubProfile,
  parseGitHubContributionCalendarDays,
  parseGitHubContributionCalendarHtml,
  parseGitHubProfileResponse,
  parseGitHubRepositoriesResponse,
} from "../src/lib/github-profile-core.ts";

const window = {
  from: "2025-08-14T00:00:00.000Z",
  to: "2026-08-12T12:00:00.000Z",
};

const contributionDay = (date, contributionCount) => ({
  contributionCount,
  date,
});

const publicRepository = (overrides = {}) => ({
  description: "A useful public project.",
  forkCount: 4,
  isFork: false,
  isPrivate: false,
  name: "public-project",
  owner: { login: "f0rr0" },
  primaryLanguage: { color: "#3178c6", name: "TypeScript" },
  repositoryTopics: {
    nodes: [{ topic: { name: "Next-JS" } }, { topic: { name: "portfolio" } }],
  },
  stargazerCount: 42,
  updatedAt: "2026-08-11T10:00:00Z",
  url: "https://github.com/f0rr0/public-project",
  ...overrides,
});

const responseWith = (repositories) => ({
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 11,
          weeks: [
            {
              contributionDays: [
                contributionDay("2025-08-13", 50),
                contributionDay("2025-08-14", 2),
                contributionDay("2025-08-15", 0),
              ],
              firstDay: "2025-08-10",
            },
            {
              contributionDays: [
                contributionDay("2025-08-17", 1),
                contributionDay("2025-08-18", 8),
              ],
              firstDay: "2025-08-17",
            },
          ],
        },
        restrictedContributionsCount: 7,
      },
      login: "f0rr0",
      repositories: { nodes: repositories },
    },
  },
});

const contributionCalendarDocument = (days) => {
  const tooltips = days
    .map(({ count, date, id }) => {
      const label =
        count === 0
          ? `No contributions on ${date}.`
          : `${count.toLocaleString("en-US")} contribution${count === 1 ? "" : "s"} on ${date}.`;
      return `<tool-tip class="sr-only" for="${id}">${label}</tool-tip>`;
    })
    .join("");
  const cells = days
    .map(
      ({ date, id }) =>
        `<td data-level='2' class='calendar-cell ContributionCalendar-day' id="${id}" data-date='${date}'></td>`
    )
    .join("");

  return `<table><tbody><tr>${tooltips}${cells}</tr></tbody></table>`;
};

const restRepository = (overrides = {}) => ({
  description: "A REST project.",
  fork: false,
  forks_count: 3,
  html_url: "https://github.com/f0rr0/rest-project",
  language: "TypeScript",
  name: "rest-project",
  owner: { login: "f0rr0" },
  private: false,
  stargazers_count: 12,
  topics: ["next-js", "portfolio", "portfolio"],
  updated_at: "2026-08-10T09:00:00Z",
  ...overrides,
});

describe("GitHub profile normalization", () => {
  test("creates a rolling 365-calendar-day UTC window", () => {
    expect(
      createGitHubContributionWindow(new Date("2026-08-12T12:34:56.000Z"))
    ).toEqual({
      from: "2025-08-13T00:00:00.000Z",
      to: "2026-08-12T12:34:56.000Z",
    });
  });

  test("reduces daily activity to coarse weekly aggregates", () => {
    const profile = parseGitHubProfileResponse(
      responseWith([publicRepository()]),
      {
        fetchedAt: "2026-08-12T12:00:00.000Z",
        login: "f0rr0",
        window,
      }
    );

    expect(profile?.activity).toEqual({
      activeDays: 3,
      from: "2025-08-14",
      restrictedContributions: 7,
      status: "available",
      to: "2026-08-12",
      totalContributions: 11,
      weeks: [
        { contributionCount: 2, level: 1, weekStart: "2025-08-10" },
        { contributionCount: 9, level: 4, weekStart: "2025-08-17" },
      ],
    });
  });

  test("keeps only validated public, owned, non-fork repositories", () => {
    const profile = parseGitHubProfileResponse(
      responseWith([
        publicRepository(),
        publicRepository({
          isPrivate: true,
          name: "private-client-roadmap",
          url: "https://github.com/f0rr0/private-client-roadmap",
        }),
        publicRepository({
          isFork: true,
          name: "upstream-fork",
          url: "https://github.com/f0rr0/upstream-fork",
        }),
        publicRepository({
          name: "someone-elses-project",
          owner: { login: "another-user" },
          url: "https://github.com/another-user/someone-elses-project",
        }),
      ]),
      {
        fetchedAt: "2026-08-12T12:00:00.000Z",
        login: "f0rr0",
        window,
      }
    );

    expect(profile?.projects).toEqual([
      {
        description: "A useful public project.",
        forks: 4,
        language: "TypeScript",
        languageColor: "#3178c6",
        name: "public-project",
        stars: 42,
        topics: ["next-js", "portfolio"],
        updatedAt: "2026-08-11T10:00:00.000Z",
        url: "https://github.com/f0rr0/public-project",
      },
    ]);
    expect(JSON.stringify(profile)).not.toContain("private-client-roadmap");
    expect(JSON.stringify(profile)).not.toContain("upstream-fork");
  });

  test("rejects GraphQL errors and malformed activity totals", () => {
    expect(
      parseGitHubProfileResponse(
        { errors: [{ message: "Bad credentials" }] },
        {
          fetchedAt: "2026-08-12T12:00:00.000Z",
          login: "f0rr0",
          window,
        }
      )
    ).toBeNull();

    const malformed = responseWith([publicRepository()]);
    malformed.data.user.contributionsCollection.contributionCalendar.totalContributions =
      -1;

    expect(
      parseGitHubProfileResponse(malformed, {
        fetchedAt: "2026-08-12T12:00:00.000Z",
        login: "f0rr0",
        window,
      })
    ).toBeNull();

    const impossibleRestrictedTotal = responseWith([publicRepository()]);
    impossibleRestrictedTotal.data.user.contributionsCollection.restrictedContributionsCount = 20;

    expect(
      parseGitHubProfileResponse(impossibleRestrictedTotal, {
        fetchedAt: "2026-08-12T12:00:00.000Z",
        login: "f0rr0",
        window,
      })
    ).toBeNull();
  });

  test("fallback activity never invents exact contribution totals", () => {
    const profile = createUnavailableGitHubProfile({
      login: "f0rr0",
      window,
    });

    expect(profile.status).toBe("unavailable");
    expect(profile.activity).toEqual({
      activeDays: null,
      from: "2025-08-14",
      restrictedContributions: null,
      status: "unavailable",
      to: "2026-08-12",
      totalContributions: null,
      weeks: [],
    });
    expect(profile.projects.map((project) => project.name)).toEqual([
      "oliphaunt",
      "react-native-rating",
    ]);
  });

  test("parses public contribution HTML directly into rolling weekly totals", () => {
    const priorYear = contributionCalendarDocument([
      { count: 1, date: "2025-12-29", id: "contribution-day-component-a" },
      { count: 0, date: "2025-12-30", id: "contribution-day-component-b" },
      { count: 2, date: "2025-12-31", id: "contribution-day-component-c" },
    ]);
    const currentYear = contributionCalendarDocument([
      { count: 3, date: "2026-01-01", id: "contribution-day-component-d" },
      { count: 0, date: "2026-01-02", id: "contribution-day-component-e" },
    ]);

    expect(
      parseGitHubContributionCalendarHtml([priorYear, currentYear], {
        from: "2025-12-29T00:00:00.000Z",
        to: "2026-01-02T12:00:00.000Z",
      })
    ).toEqual({
      activeDays: 3,
      from: "2025-12-29",
      restrictedContributions: null,
      status: "available",
      to: "2026-01-02",
      totalContributions: 6,
      weeks: [
        {
          contributionCount: 6,
          level: 4,
          weekStart: "2025-12-28",
        },
      ],
    });
    expect(
      parseGitHubContributionCalendarDays([priorYear, currentYear], {
        from: "2025-12-29T00:00:00.000Z",
        to: "2026-01-02T12:00:00.000Z",
      })
    ).toEqual([
      { contributionCount: 1, day: "2025-12-29" },
      { contributionCount: 0, day: "2025-12-30" },
      { contributionCount: 2, day: "2025-12-31" },
      { contributionCount: 3, day: "2026-01-01" },
      { contributionCount: 0, day: "2026-01-02" },
    ]);
  });

  test("rejects incomplete or malformed contribution HTML", () => {
    const incomplete = contributionCalendarDocument([
      { count: 1, date: "2026-01-01", id: "contribution-day-component-a" },
    ]);

    expect(
      parseGitHubContributionCalendarHtml([incomplete], {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-02T00:00:00.000Z",
      })
    ).toBeNull();
    expect(
      parseGitHubContributionCalendarHtml(
        [
          `<td class="ContributionCalendar-day" id="contribution-day-component-a" data-date="2026-01-01"></td>`,
        ],
        {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        }
      )
    ).toBeNull();
  });

  test("normalizes only public owned non-fork REST repositories", () => {
    const projects = parseGitHubRepositoriesResponse(
      [
        restRepository(),
        restRepository({
          html_url: "https://github.com/f0rr0/private-project",
          name: "private-project",
          private: true,
        }),
        restRepository({
          fork: true,
          html_url: "https://github.com/f0rr0/a-fork",
          name: "a-fork",
        }),
        restRepository({
          html_url: "https://github.com/someone-else/their-project",
          name: "their-project",
          owner: { login: "someone-else" },
        }),
      ],
      "f0rr0"
    );

    expect(projects).toEqual([
      {
        description: "A REST project.",
        forks: 3,
        language: "TypeScript",
        languageColor: null,
        name: "rest-project",
        stars: 12,
        topics: ["next-js", "portfolio"],
        updatedAt: "2026-08-10T09:00:00.000Z",
        url: "https://github.com/f0rr0/rest-project",
      },
    ]);
  });
});
