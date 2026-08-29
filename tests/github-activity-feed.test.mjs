import { describe, expect, test } from "bun:test";

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
