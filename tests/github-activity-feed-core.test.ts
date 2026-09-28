import { describe, expect, test } from "bun:test";

import type { PublicGitHubWorkUnitRow } from "../src/lib/github-activity-feed-core.ts";
import {
  buildPublicGitHubActivityDays,
  getVisibleGitHubActivityDays,
} from "../src/lib/github-activity-feed-core.ts";
import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityRepository,
} from "../src/lib/github-activity-types.ts";

const repository = (key: string, label = key) => ({
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

const work = (
  id: string,
  activityAt: string,
  repositoryIdentity: PublicGitHubActivityRepository
): PublicGitHubWorkUnitRow => ({
  activityAt,
  day: activityAt.slice(0, 10),
  destination: {
    label: `Open ${id}`,
    url: `https://github.com/example/repository/pull/${id}`,
  },
  facts,
  headline: null,
  id,
  kind: "pull-request",
  repository: repositoryIdentity,
  summarizing: false,
  summary: null,
});

describe("public GitHub activity day projection", () => {
  test("visible days skip empty days and sort active days newest first", () => {
    const active: PublicGitHubActivityDay = {
      day: "2026-09-04",
      repositories: [
        {
          repository: repository("42"),
          items: [
            {
              kind: "issue",
              activityAt: "2026-09-04T12:00:00.000Z",
              id: "issue",
              title: "Investigate",
              destination: null,
            },
          ],
        },
      ],
    };
    const empty = { day: "2026-09-06", repositories: [] };
    const emptyGroup = {
      day: "2026-09-05",
      repositories: [{ repository: repository("42"), items: [] }],
    };
    const older = { ...active, day: "2026-08-31" };
    const days = [older, empty, active, emptyGroup];
    expect(getVisibleGitHubActivityDays(days, "2026-09-06")).toEqual([
      active,
      older,
    ]);
    expect(days).toEqual([older, empty, active, emptyGroup]);
    expect(getVisibleGitHubActivityDays([active], "2026-09-04")).toEqual([
      active,
    ]);
    expect(
      getVisibleGitHubActivityDays([empty, emptyGroup], "2026-09-06")
    ).toEqual([]);
    expect(getVisibleGitHubActivityDays([], "2026-09-06")).toEqual([]);
    expect(getVisibleGitHubActivityDays([active], "2026-09-03")).toEqual([]);
  });

  test("emits one header with all repository work in deterministic order", () => {
    const sharedRepository = repository("42", "example/repository");
    const [day] = buildPublicGitHubActivityDays({
      days: ["2026-08-28"],
      issues: [],
      workUnits: [
        work("older", "2026-08-28T08:00:00.000Z", sharedRepository),
        work("newer", "2026-08-28T12:00:00.000Z", sharedRepository),
      ],
    });

    expect(day).toEqual({
      day: "2026-08-28",
      repositories: [
        {
          items: [
            {
              activityAt: "2026-08-28T12:00:00.000Z",
              destination: {
                label: "Open newer",
                url: "https://github.com/example/repository/pull/newer",
              },
              facts,
              headline: null,
              id: "newer",
              kind: "pull-request",
              summarizing: false,
              summary: null,
            },
            {
              activityAt: "2026-08-28T08:00:00.000Z",
              destination: {
                label: "Open older",
                url: "https://github.com/example/repository/pull/older",
              },
              facts,
              headline: null,
              id: "older",
              kind: "pull-request",
              summarizing: false,
              summary: null,
            },
          ],
          repository: sharedRepository,
        },
      ],
    });
  });

  test("rejects rows outside the requested complete-day page", () => {
    expect(() =>
      buildPublicGitHubActivityDays({
        days: ["2026-08-28"],
        issues: [],
        workUnits: [
          work("outside", "2026-08-27T12:00:00.000Z", repository("42")),
        ],
      })
    ).toThrow();
  });

  test("preserves saved days even when timestamps cross a timezone boundary", () => {
    const repo = repository("42");
    const days = buildPublicGitHubActivityDays({
      days: ["2026-09-06", "2026-09-05"],
      issues: [],
      workUnits: [
        {
          ...work("later", "2026-09-05T23:00:00.000Z", repo),
          day: "2026-09-06",
        },
        work("earlier", "2026-09-05T23:00:00.000Z", repo),
      ],
    });
    expect(days.map(({ day }) => day)).toEqual(["2026-09-06", "2026-09-05"]);
    expect(
      days.map(({ repositories }) => repositories[0].items.map(({ id }) => id))
    ).toEqual([["later"], ["earlier"]]);
  });
});
