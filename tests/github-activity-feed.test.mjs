import { describe, expect, test } from "bun:test";

import {
  decodeGitHubActivityCursor,
  encodeGitHubActivityCursor,
} from "../src/lib/github-activity-cursor.ts";
import {
  publicLanguageIconUrl,
  publicRepositoryDisplay,
} from "../src/lib/github-activity-display.ts";

describe("public GitHub activity projection", () => {
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
