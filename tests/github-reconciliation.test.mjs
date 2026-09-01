import { afterEach, describe, expect, test } from "bun:test";

import {
  collectAccessibleGitHubRepositories,
  collectGitHubRepositoryRefPage,
} from "../src/lib/github-reconciliation.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const repository = {
  default_branch: "main",
  full_name: "example-org/example-repo",
  html_url: "https://github.com/example-org/example-repo",
  id: 123,
  owner: {
    avatar_url: "https://avatars.githubusercontent.com/u/456?v=4",
    id: 456,
    login: "example-org",
    type: "Organization",
  },
  private: true,
  pushed_at: "2026-08-20T00:00:00Z",
  visibility: "private",
};

const repositoryFacts = {
  defaultBranch: "main",
  fullName: "example-org/example-repo",
  htmlUrl: "https://github.com/example-org/example-repo",
  id: "123",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/456?v=4",
  ownerId: "456",
  ownerLogin: "example-org",
  ownerType: "Organization",
  pushedAt: "2026-08-20T00:00:00.000Z",
  visibility: "private",
};

describe("GitHub repository reconciliation", () => {
  test("enumerates every repository affiliation available to the token", async () => {
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/user/repos");
      expect(url.searchParams.get("affiliation")).toBe(
        "owner,collaborator,organization_member"
      );
      expect(url.searchParams.get("visibility")).toBe("all");
      expect(url.searchParams.get("per_page")).toBe("100");
      return Response.json([repository]);
    };

    expect(await collectAccessibleGitHubRepositories("token")).toEqual([
      repositoryFacts,
    ]);
  });

  test("fetches one opaque repository ID even when its push predates the global cutoff", async () => {
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/repositories/123");
      return Response.json(repository);
    };

    expect(
      await collectAccessibleGitHubRepositories("token", "123", {
        pushedSinceAt: new Date("2026-09-01T00:00:00.000Z"),
      })
    ).toEqual([repositoryFacts]);
  });

  test("bounds a historical inventory to repositories pushed since the window began", async () => {
    globalThis.fetch = async () =>
      Response.json([
        repository,
        {
          ...repository,
          full_name: "example-org/stale-repo",
          html_url: "https://github.com/example-org/stale-repo",
          id: 124,
          pushed_at: "2026-07-31T23:59:59Z",
        },
        {
          ...repository,
          full_name: "example-org/empty-repo",
          html_url: "https://github.com/example-org/empty-repo",
          id: 125,
          pushed_at: null,
        },
      ]);

    expect(
      await collectAccessibleGitHubRepositories("token", null, {
        pushedSinceAt: new Date("2026-08-01T00:00:00.000Z"),
      })
    ).toEqual([repositoryFacts]);
  });

  test("rejects a next inventory page that drops the access constraints", async () => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return Response.json([repository], {
        headers: {
          link: '<https://api.github.com/user/repos?page=2&per_page=100>; rel="next"',
        },
      });
    };

    await expect(
      collectAccessibleGitHubRepositories("token")
    ).rejects.toBeInstanceOf(TypeError);
    expect(requests).toBe(1);
  });

  test("collects current heads without scanning tags", async () => {
    const headSha = "a".repeat(40);
    const paths = [];
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      paths.push(`${url.pathname}?${url.searchParams.toString()}`);
      if (url.pathname.endsWith("/branches")) {
        return Response.json([
          {
            commit: { sha: headSha },
            name: "main",
          },
        ]);
      }
      throw new Error(`Unexpected GitHub path: ${url.pathname}`);
    };

    expect(
      await collectGitHubRepositoryRefPage(repositoryFacts, "head", "token", {
        page: 1,
      })
    ).toEqual({
      nextPage: null,
      refs: [{ headSha, kind: "head", refName: "refs/heads/main" }],
    });
    expect(paths).toEqual([
      "/repos/example-org/example-repo/branches?per_page=100&page=1",
    ]);
  });

  test("follows every branch page without imposing a completeness cap", async () => {
    const firstSha = "d".repeat(40);
    const secondSha = "e".repeat(40);
    const pages = [];
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      pages.push(`${url.pathname}:${url.searchParams.get("page")}`);
      if (
        url.pathname.endsWith("/branches") &&
        url.searchParams.get("page") === "1"
      ) {
        return Response.json([{ commit: { sha: firstSha }, name: "first" }], {
          headers: {
            link: `<https://api.github.com/repos/example-org/example-repo/branches?per_page=100&page=2>; rel="next"`,
          },
        });
      }
      if (url.pathname.endsWith("/branches")) {
        return Response.json([{ commit: { sha: secondSha }, name: "second" }]);
      }
      return Response.json([]);
    };

    const first = await collectGitHubRepositoryRefPage(
      repositoryFacts,
      "head",
      "token",
      { page: 1 }
    );
    const second = await collectGitHubRepositoryRefPage(
      repositoryFacts,
      "head",
      "token",
      { page: 2 }
    );
    expect(first).toEqual({
      nextPage: 2,
      refs: [{ headSha: firstSha, kind: "head", refName: "refs/heads/first" }],
    });
    expect(second).toEqual({
      nextPage: null,
      refs: [
        { headSha: secondSha, kind: "head", refName: "refs/heads/second" },
      ],
    });
    expect(pages).toEqual([
      "/repos/example-org/example-repo/branches:1",
      "/repos/example-org/example-repo/branches:2",
    ]);
  });
});
