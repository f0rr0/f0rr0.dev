import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GitHubTimeline } from "../src/components/github-timeline.tsx";
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

  test("renders provider-capped evidence as a lower bound", () => {
    const html = renderToStaticMarkup(
      createElement(GitHubTimeline, {
        initialPage: {
          days: [
            {
              day: "2026-08-28",
              items: [
                {
                  commit: {
                    additions: 1,
                    changedFiles: 3000,
                    committedAt: "2026-08-28T08:30:00.000Z",
                    deletions: 2,
                    headline: "Improve the large change",
                    id: "provider-capped-commit",
                    languages: [
                      {
                        changedLines: 3,
                        iconUrl: null,
                        id: "typescript",
                        label: "TypeScript",
                      },
                    ],
                    providerFileCapReached: true,
                    summary: "Improves a large change.",
                  },
                  id: "provider-capped-activity",
                  kind: "commit",
                  occurredAt: "2026-08-28T08:30:00.000Z",
                  repository: {
                    avatarUrl: null,
                    label: null,
                    url: null,
                  },
                },
              ],
              totals: {
                additions: 1,
                deletions: 2,
                issuesOpened: 0,
                pullRequestsMerged: 0,
                repositories: 1,
              },
            },
          ],
          nextCursor: null,
          snapshotAt: "2026-08-28T09:00:00.000Z",
        },
      })
    );

    expect(html).toContain("3,000+ files");
    expect(html).toContain("Improve the large change");
    expect(html).toContain("Improves a large change.");
    expect(html.indexOf("Improve the large change")).toBeLessThan(
      html.indexOf("Improves a large change.")
    );
    expect(html).toContain("<details");
    expect(html).toContain(
      "3,000 or more changed files; GitHub caps returned file details at 3,000 files"
    );
    expect(html).toContain(
      'aria-label="Languages found in the first 3,000 files returned by GitHub; the full commit may include more"'
    );
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

  test("renders complete day totals and PR/issue milestones without zero counts", () => {
    const html = renderToStaticMarkup(
      createElement(GitHubTimeline, {
        initialPage: {
          days: [
            {
              day: "2026-08-28",
              items: [
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
                  repository: {
                    avatarUrl: null,
                    label: "portfolio",
                    url: "https://github.com/f0rr0/portfolio/pull/12",
                  },
                  title: "Build daily GitHub activity",
                },
                {
                  id: "pr-merged-public-id",
                  kind: "pull-request-merged",
                  occurredAt: "2026-08-28T09:00:00.000Z",
                  repository: {
                    avatarUrl: null,
                    label: "portfolio",
                    url: "https://github.com/f0rr0/portfolio/pull/12",
                  },
                  title: "Build daily GitHub activity",
                },
              ],
              totals: {
                additions: 12,
                deletions: 3,
                issuesOpened: 0,
                pullRequestsMerged: 1,
                repositories: 1,
              },
            },
          ],
          nextCursor: null,
          snapshotAt: "2026-08-28T10:00:00.000Z",
        },
      })
    );

    expect(html).toContain("Pull request work");
    expect(html).toContain("Pull request merged");
    expect(html).toContain("1 pull request merged");
    expect(html).not.toContain("issues opened");
    expect(html).toContain('aria-label="Summary for 2026-08-28"');
  });

  test("shows all public repositories and only directly owned private names", () => {
    expect(
      publicRepositoryDisplay({
        ownerLogin: "another-org",
        private: false,
        repository: "another-org/public-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({
      repositoryLabel: "public-repo",
      url: `https://github.com/another-org/public-repo/commit/${"a".repeat(40)}`,
    });
    expect(
      publicRepositoryDisplay({
        ownerLogin: "another-org",
        private: true,
        repository: "another-org/private-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({ repositoryLabel: null, url: null });
    expect(
      publicRepositoryDisplay({
        ownerLogin: "f0rr0",
        private: true,
        repository: "f0rr0/private-repo",
        sha: "a".repeat(40),
      })
    ).toEqual({ repositoryLabel: "private-repo", url: null });
  });

  test("maps deterministic language IDs to official logo URLs", () => {
    expect(publicLanguageIconUrl("typescript")).toBe(
      "https://cdn.jsdelivr.net/npm/simple-icons@16.12.0/icons/typescript.svg"
    );
    expect(publicLanguageIconUrl("unknown")).toBeNull();
  });
});
