import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GitHubActivityDays } from "../src/components/github-activity-days.tsx";
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
  headline: null,
  id,
  kind: "pull-request",
  repository: repositoryIdentity,
  summarizing: false,
  summary: null,
});

describe("public GitHub activity day projection", () => {
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

  test("keeps a stale summary visible without a processing indicator", () => {
    const item = {
      ...work(
        "refreshing",
        "2026-08-28T12:00:00.000Z",
        repository("42", "example/repository")
      ),
      facts: { ...facts, languages: null },
      headline: "Previous headline",
      summarizing: true,
      summary: "Previous summary remains visible.",
    };
    const html = renderToStaticMarkup(
      createElement(GitHubActivityDays, {
        days: [
          {
            day: "2026-08-28",
            repositories: [{ items: [item], repository: item.repository }],
          },
        ],
      })
    );

    expect(html).toContain("Previous summary remains visible.");
    expect(html).not.toContain("Refreshing summary");
    expect(html).not.toContain("animate-spin");
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
});
