import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GitHubActivityDays } from "../src/components/github-activity-days.tsx";
import { githubCommits, githubSummaryAttempts } from "../src/db/schema.ts";
import {
  decodeGitHubActivityCursor,
  encodeGitHubActivityCursor,
} from "../src/lib/github-activity-cursor.ts";
import {
  publicLanguageIconUrl,
  publicRepositoryDisplay,
} from "../src/lib/github-activity-display.ts";

describe("public GitHub activity projection", () => {
  test("persists both Nano summary variants", () => {
    expect(githubSummaryAttempts.summaryHeadline.name).toBe("summary_headline");
    expect(githubSummaryAttempts.summaryShort.name).toBe("summary_short");
  });

  test("persists whether GitHub capped the returned file evidence", () => {
    expect(githubCommits.providerFileCapReached.name).toBe(
      "provider_file_cap_reached"
    );
    expect(githubCommits.providerFileCapReached.notNull).toBe(true);
    expect(githubCommits.providerFileCapReached.hasDefault).toBe(true);
  });

  test("round trips an opaque cursor without repository identity", () => {
    const cursor = {
      beforeDay: "2026-08-28",
      snapshotAt: "2026-08-28T08:30:00.000Z",
      version: 1,
    };
    const secret = "a-test-cursor-secret-with-at-least-32-characters";
    const encoded = encodeGitHubActivityCursor(cursor, secret);
    expect(encoded).not.toContain("repository");
    expect(decodeGitHubActivityCursor(encoded, secret)).toEqual(cursor);
    expect(decodeGitHubActivityCursor(null, secret)).toBeNull();
    expect(() => decodeGitHubActivityCursor("not-a-cursor", secret)).toThrow(
      "cursor is invalid"
    );
    expect(() =>
      decodeGitHubActivityCursor(
        `${encoded.slice(0, -1)}${encoded.endsWith("a") ? "b" : "a"}`,
        secret
      )
    ).toThrow("cursor is invalid");
  });

  test("given mixed work in one day, shows each repository once without merge milestones", () => {
    const portfolioRepository = {
      avatarUrl: null,
      key: "public:portfolio",
      label: "f0rr0/portfolio",
      url: "https://github.com/f0rr0/portfolio/commit/aaa",
    };
    const portfolioIssueRepository = {
      ...portfolioRepository,
      url: "https://github.com/f0rr0/portfolio/issues/7",
    };
    const portfolioPullRequestRepository = {
      ...portfolioRepository,
      url: "https://github.com/f0rr0/portfolio/pull/12",
    };
    const workerRepository = {
      avatarUrl: null,
      key: "public:worker",
      label: "f0rr0/worker",
      url: "https://github.com/f0rr0/worker/commit/bbb",
    };
    const html = renderToStaticMarkup(
      createElement(GitHubActivityDays, {
        days: [
          {
            day: "2026-08-28",
            items: [
              {
                id: "issue-public-id",
                kind: "issue-opened",
                occurredAt: "2026-08-28T10:00:00.000Z",
                repository: portfolioIssueRepository,
                title: "Track daily activity",
              },
              {
                commit: {
                  additions: 6,
                  changedFiles: 2,
                  committedAt: "2026-08-28T09:00:00.000Z",
                  deletions: 2,
                  headline: "Document the worker contract",
                  id: "worker-commit-public-id",
                  languages: [],
                  providerFileCapReached: false,
                  summary: "Documents the worker contract.",
                },
                id: "worker-activity-public-id",
                kind: "commit",
                occurredAt: "2026-08-28T09:00:00.000Z",
                repository: workerRepository,
              },
              {
                commits: [
                  {
                    additions: 12,
                    changedFiles: 2,
                    committedAt: "2026-08-28T08:00:00.000Z",
                    deletions: 3,
                    headline: "Add the daily projection",
                    id: "commit-public-id",
                    languages: [],
                    providerFileCapReached: false,
                    summary: "Builds complete UTC-day activity pages.",
                  },
                ],
                id: "pr-slice-public-id",
                kind: "pull-request-commits",
                occurredAt: "2026-08-28T08:00:00.000Z",
                repository: portfolioPullRequestRepository,
                title: "Build daily GitHub activity",
              },
              {
                commit: {
                  additions: 4,
                  changedFiles: 1,
                  committedAt: "2026-08-28T07:00:00.000Z",
                  deletions: 1,
                  headline: "Polish repository activity rows",
                  id: "portfolio-commit-public-id",
                  languages: [],
                  providerFileCapReached: false,
                  summary: "Polishes grouped repository activity rows.",
                },
                id: "portfolio-activity-public-id",
                kind: "commit",
                occurredAt: "2026-08-28T07:00:00.000Z",
                repository: portfolioRepository,
              },
            ],
            totals: {
              additions: 22,
              deletions: 6,
              issuesOpened: 1,
              repositories: 2,
            },
          },
        ],
      })
    );

    expect(html).toContain("Build daily GitHub activity");
    expect(html.match(/Build daily GitHub activity/gu)).toHaveLength(1);
    expect(html).not.toContain("Add the daily projection");
    expect(html).toContain("Builds complete UTC-day activity pages.");
    expect(html).toContain("Polish repository activity rows");
    expect(html).toContain("Document the worker contract");
    expect(html).toContain("Issue opened");
    expect(html).not.toMatch(/pull requests? (?:work|merged)/iu);
    expect(html).toContain("Across 2 repositories");
    expect(html).toContain('aria-label="Activity for 2026-08-28"');
    expect(html.match(/<header(?:\s[^>]*)?>/gu)).toHaveLength(2);

    const portfolioGroup = '<article aria-label="f0rr0/portfolio activity">';
    const workerGroup = '<article aria-label="f0rr0/worker activity">';
    expect(html.split(portfolioGroup)).toHaveLength(2);
    expect(html.split(workerGroup)).toHaveLength(2);
    for (const url of [
      portfolioRepository.url,
      portfolioIssueRepository.url,
      portfolioPullRequestRepository.url,
      workerRepository.url,
    ]) {
      expect(html).toContain(`href="${url}"`);
    }

    const portfolioGroupIndex = html.indexOf(portfolioGroup);
    const workerGroupIndex = html.indexOf(workerGroup);
    expect(portfolioGroupIndex).toBeGreaterThan(-1);
    expect(workerGroupIndex).toBeGreaterThan(portfolioGroupIndex);
    for (const work of [
      "Track daily activity",
      "Build daily GitHub activity",
      "Polish repository activity rows",
    ]) {
      expect(html.indexOf(work)).toBeGreaterThan(portfolioGroupIndex);
      expect(html.indexOf(work)).toBeLessThan(workerGroupIndex);
    }
    expect(html.indexOf("Document the worker contract")).toBeGreaterThan(
      workerGroupIndex
    );

    for (const occurredAt of [
      "2026-08-28T10:00:00.000Z",
      "2026-08-28T09:00:00.000Z",
      "2026-08-28T08:00:00.000Z",
      "2026-08-28T07:00:00.000Z",
    ]) {
      expect(html).toContain(occurredAt);
    }
  });

  test("uses the PR title once for a singleton but keeps commit titles in a multi-commit PR", () => {
    const pullRequestRepository = {
      avatarUrl: null,
      key: "public:portfolio",
      label: "f0rr0/portfolio",
      url: "https://github.com/f0rr0/portfolio/pull/12",
    };
    const html = renderToStaticMarkup(
      createElement(GitHubActivityDays, {
        days: [
          {
            day: "2026-08-28",
            items: [
              {
                commits: [
                  {
                    additions: 4,
                    changedFiles: 1,
                    committedAt: "2026-08-28T08:00:00.000Z",
                    deletions: 1,
                    headline: "Add deterministic projection",
                    id: "first-commit-public-id",
                    languages: [],
                    providerFileCapReached: false,
                    summary: "Adds the projection contract.",
                  },
                  {
                    additions: 2,
                    changedFiles: 1,
                    committedAt: "2026-08-28T09:00:00.000Z",
                    deletions: 0,
                    headline: "Test historical PR revisions",
                    id: "second-commit-public-id",
                    languages: [],
                    providerFileCapReached: false,
                    summary: "Covers old and current PR versions.",
                  },
                ],
                id: "pr-slice-public-id",
                kind: "pull-request-commits",
                occurredAt: "2026-08-28T09:00:00.000Z",
                repository: pullRequestRepository,
                title: "Make GitHub work deterministic",
              },
            ],
            totals: {
              additions: 6,
              deletions: 1,
              issuesOpened: 0,
              repositories: 1,
            },
          },
        ],
      })
    );

    expect(html.match(/Make GitHub work deterministic/gu)).toHaveLength(1);
    expect(html).toContain("Add deterministic projection");
    expect(html).toContain("Test historical PR revisions");
    expect(html.indexOf("Add deterministic projection")).toBeLessThan(
      html.indexOf("Test historical PR revisions")
    );
  });

  test("shows public owners while concealing private names and owners", () => {
    expect(
      publicRepositoryDisplay({
        ownerLogin: "another-org",
        private: false,
        repository: "another-org/public-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({
      repositoryLabel: "another-org/public-repo",
      url: `https://github.com/another-org/public-repo/commit/${"a".repeat(40)}`,
    });
    expect(
      publicRepositoryDisplay({
        ownerLogin: "another-org",
        private: true,
        repository: "another-org/private-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({
      repositoryLabel: "Private",
      url: null,
    });
    expect(
      publicRepositoryDisplay({
        ownerLogin: "f0rr0",
        private: true,
        repository: "f0rr0/private-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({ repositoryLabel: "Private", url: null });
  });

  test("maps deterministic language IDs to official logo URLs", () => {
    expect(publicLanguageIconUrl("typescript")).toBe(
      "https://cdn.jsdelivr.net/npm/simple-icons@16.12.0/icons/typescript.svg"
    );
    expect(publicLanguageIconUrl("unknown")).toBeNull();
  });
});
