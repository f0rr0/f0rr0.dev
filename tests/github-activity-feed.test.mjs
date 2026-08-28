import { describe, expect, test } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GitHubTimeline } from "../src/components/github-timeline.tsx";
import { githubCommits } from "../src/db/schema.ts";
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
    expect(githubCommits.summaryHeadline.name).toBe("summary_headline");
    expect(githubCommits.summaryShort.name).toBe("summary_short");
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
          items: [
            {
              additions: 1,
              avatarUrl: null,
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
              repositoryLabel: null,
              summary: "Improves a large change.",
              summaryKind: "short",
              url: null,
            },
          ],
          nextCursor: null,
        },
      })
    );

    expect(html).toContain("3000+ files");
    expect(html).toContain("Improve the large change");
    expect(html).toContain("Improves a large change.");
    expect(html.indexOf("Improve the large change")).toBeLessThan(
      html.indexOf("Improves a large change.")
    );
    expect(html).toContain(
      "3000 or more changed files; GitHub caps returned file details at 3,000 files"
    );
    expect(html).toContain(
      'aria-label="Languages found in the first 3,000 files returned by GitHub; the full commit may include more"'
    );
  });

  test("round trips an opaque cursor without repository identity", () => {
    const cursor = {
      committedAt: "2026-08-28T08:30:00.000Z",
      publicId: "018f4f3c-8c35-7b11-8d4e-fbc7feab35e3",
    };
    const encoded = encodeGitHubActivityCursor(cursor);
    expect(encoded).not.toContain("repository");
    expect(decodeGitHubActivityCursor(encoded)).toEqual(cursor);
    expect(decodeGitHubActivityCursor(null)).toBeNull();
    expect(() => decodeGitHubActivityCursor("not-a-cursor")).toThrow(
      "cursor is invalid"
    );
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
