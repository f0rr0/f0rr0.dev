import { describe, expect, test } from "bun:test";

import { buildPublicGitHubActivityDays } from "../src/lib/github-activity-feed-core.ts";

const repository = (key, label = key) => ({
  avatarUrl: null,
  key,
  label,
  url: `https://github.com/${label}`,
});

const facts = {
  additions: 12,
  dateRange: null,
  deletions: 3,
  languages: ["TypeScript"],
  ownedCommitCount: 2,
  uniqueFileCount: 4,
};

const work = (id, activityAt, repositoryIdentity) => ({
  activityAt,
  day: activityAt.slice(0, 10),
  destination: {
    label: `Open ${id}`,
    url: `https://github.com/example/repository/pull/${id}`,
  },
  facts,
  id,
  kind: "pull-request",
  outcome: null,
  repository: repositoryIdentity,
});

describe("public GitHub activity day projection", () => {
  test("emits one header with all repository work in deterministic order", () => {
    const sharedRepository = repository("42", "example/repository");
    const [day] = buildPublicGitHubActivityDays({
      days: ["2026-08-28"],
      issues: [],
      privateDays: new Set(),
      workUnits: [
        work("older", "2026-08-28T08:00:00.000Z", sharedRepository),
        work("newer", "2026-08-28T12:00:00.000Z", sharedRepository),
      ],
    });

    expect(day).toEqual({
      day: "2026-08-28",
      privateWork: false,
      repositories: [
        {
          items: [
            {
              destination: {
                label: "Open newer",
                url: "https://github.com/example/repository/pull/newer",
              },
              facts,
              id: "newer",
              kind: "pull-request",
              outcome: null,
            },
            {
              destination: {
                label: "Open older",
                url: "https://github.com/example/repository/pull/older",
              },
              facts,
              id: "older",
              kind: "pull-request",
              outcome: null,
            },
          ],
          repository: sharedRepository,
        },
      ],
    });
  });

  test("collapses all private work to one boolean-only day fact", () => {
    expect(
      buildPublicGitHubActivityDays({
        days: ["2026-08-27"],
        issues: [],
        privateDays: new Set(["2026-08-27"]),
        workUnits: [],
      })
    ).toEqual([{ day: "2026-08-27", privateWork: true, repositories: [] }]);
  });

  test("rejects rows outside the requested complete-day page", () => {
    expect(() =>
      buildPublicGitHubActivityDays({
        days: ["2026-08-28"],
        issues: [],
        privateDays: new Set(),
        workUnits: [
          work("outside", "2026-08-27T12:00:00.000Z", repository("42")),
        ],
      })
    ).toThrow();
  });
});
