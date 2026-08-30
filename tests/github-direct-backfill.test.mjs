import { afterEach, describe, expect, test } from "bun:test";

import {
  backfillGitHubCommitsFromCurrentRefs,
  collectGitHubCommitsFromHead,
  distinctGitHubCurrentRefHeads,
} from "../src/lib/github-direct-backfill.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const repository = {
  fullName: "example-org/example-repo",
  htmlUrl: "https://github.com/example-org/example-repo",
  id: "123",
  ownerAvatarUrl: null,
  ownerId: "456",
  ownerLogin: "example-org",
  ownerType: "Organization",
  visibility: "private",
};

const rawRepository = {
  full_name: repository.fullName,
  html_url: repository.htmlUrl,
  id: Number(repository.id),
  owner: {
    avatar_url: null,
    id: Number(repository.ownerId),
    login: repository.ownerLogin,
    type: repository.ownerType,
  },
  private: true,
  visibility: repository.visibility,
};

const commitValue = (sha, authoredAt, committedAt) => ({
  author: { login: "f0rr0" },
  commit: {
    author: { date: authoredAt },
    committer: { date: committedAt },
    message: `feat: discover ${sha.slice(0, 4)}\n\nbody`,
  },
  sha,
});

describe("direct GitHub ref backfill", () => {
  test("orders heads before tags and deduplicates their target SHAs", () => {
    const sharedSha = "a".repeat(40);
    const tagOnlySha = "b".repeat(40);
    expect(
      distinctGitHubCurrentRefHeads([
        {
          headSha: tagOnlySha,
          kind: "tag",
          refName: "refs/tags/v2",
        },
        {
          headSha: sharedSha,
          kind: "tag",
          refName: "refs/tags/v1",
        },
        {
          headSha: sharedSha,
          kind: "head",
          refName: "refs/heads/main",
        },
      ])
    ).toEqual([
      { headSha: sharedSha, refName: "refs/heads/main" },
      { headSha: tagOnlySha, refName: "refs/tags/v2" },
    ]);
  });

  test("uses one author-filtered inclusive range and committer timestamps", async () => {
    const headSha = "c".repeat(40);
    const firstSha = "d".repeat(40);
    const lastSha = "e".repeat(40);
    const sinceAt = new Date("2024-01-01T00:00:00.000Z");
    const untilAt = new Date("2026-08-29T23:59:59.999Z");
    const requests = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      const page = Number(url.searchParams.get("page"));
      if (page === 1) {
        const next = new URL(url);
        next.searchParams.set("page", "2");
        return Response.json(
          [
            commitValue(
              firstSha,
              "2023-12-01T00:00:00Z",
              sinceAt.toISOString()
            ),
          ],
          { headers: { link: `<${next.href}>; rel="next"` } }
        );
      }
      return Response.json([
        commitValue(lastSha, "2026-08-01T00:00:00Z", untilAt.toISOString()),
      ]);
    };

    const result = await collectGitHubCommitsFromHead({
      account: "f0rr0",
      deadlineAt: Date.now() + 120_000,
      headSha,
      repository,
      sinceAt,
      token: "test-token",
      untilAt,
    });

    expect(result.pages).toBe(2);
    expect(
      result.commits.map(({ committedAt, sha }) => ({ committedAt, sha }))
    ).toEqual([
      { committedAt: sinceAt.toISOString(), sha: firstSha },
      { committedAt: untilAt.toISOString(), sha: lastSha },
    ]);
    expect(requests).toHaveLength(2);
    for (const [index, url] of requests.entries()) {
      expect(url.pathname).toBe("/repos/example-org/example-repo/commits");
      expect(url.searchParams.get("author")).toBe("f0rr0");
      expect(url.searchParams.get("page")).toBe(String(index + 1));
      expect(url.searchParams.get("per_page")).toBe("100");
      expect(url.searchParams.get("sha")).toBe(headSha);
      expect(url.searchParams.get("since")).toBe(sinceAt.toISOString());
      expect(url.searchParams.get("until")).toBe(untilAt.toISOString());
    }
  });

  test("rejects pagination that drops an inventory constraint", async () => {
    const headSha = "f".repeat(40);
    globalThis.fetch = async (input) => {
      const next = new URL(input instanceof Request ? input.url : input);
      next.searchParams.delete("author");
      next.searchParams.set("page", "2");
      return Response.json([], {
        headers: { link: `<${next.href}>; rel="next"` },
      });
    };

    await expect(
      collectGitHubCommitsFromHead({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        headSha,
        repository,
        sinceAt: new Date("2026-08-01T00:00:00.000Z"),
        token: "test-token",
        untilAt: new Date("2026-08-29T23:59:59.999Z"),
      })
    ).rejects.toThrow("invalid commit pagination");
  });

  test("fails incomplete when a listed repository becomes inaccessible", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/user/repos") {
        return Response.json([rawRepository]);
      }
      if (url.pathname === "/repos/example-org/example-repo/branches") {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      throw new Error(`Unexpected GitHub request: ${url.href}`);
    };

    expect(
      await backfillGitHubCommitsFromCurrentRefs({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        repositoryId: null,
        sinceAt: new Date("2026-08-01T00:00:00.000Z"),
        token: "test-token",
        untilAt: new Date("2026-08-31T23:59:59.999Z"),
      })
    ).toMatchObject({ complete: false, stopReason: "provider_retry" });
  });
});
