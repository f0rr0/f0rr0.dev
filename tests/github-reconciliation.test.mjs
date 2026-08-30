import { afterEach, describe, expect, test } from "bun:test";

import {
  collectAccessibleGitHubRepositories,
  collectGitHubRepositoryRefs,
} from "../src/lib/github-reconciliation.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const repository = {
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
  visibility: "private",
};

const repositoryFacts = {
  fullName: "example-org/example-repo",
  htmlUrl: "https://github.com/example-org/example-repo",
  id: "123",
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/456?v=4",
  ownerId: "456",
  ownerLogin: "example-org",
  ownerType: "Organization",
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

  test("fetches one opaque repository ID without enumerating affiliations", async () => {
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/repositories/123");
      return Response.json(repository);
    };

    expect(await collectAccessibleGitHubRepositories("token", "123")).toEqual([
      repositoryFacts,
    ]);
  });

  test("uses branch and repository-tag commit targets without tag peeling", async () => {
    const headSha = "a".repeat(40);
    const taggedCommitSha = "c".repeat(40);
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
      if (url.pathname.endsWith("/tags")) {
        return Response.json([
          {
            commit: { sha: taggedCommitSha },
            name: "v1.0.0",
          },
        ]);
      }
      throw new Error(`Unexpected GitHub path: ${url.pathname}`);
    };

    expect(await collectGitHubRepositoryRefs(repositoryFacts, "token")).toEqual(
      [
        { headSha, kind: "head", refName: "refs/heads/main" },
        {
          headSha: taggedCommitSha,
          kind: "tag",
          refName: "refs/tags/v1.0.0",
        },
      ]
    );
    expect(paths).toEqual([
      "/repos/example-org/example-repo/branches?per_page=100&page=1",
      "/repos/example-org/example-repo/tags?per_page=100&page=1",
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

    expect(await collectGitHubRepositoryRefs(repositoryFacts, "token")).toEqual(
      [
        { headSha: firstSha, kind: "head", refName: "refs/heads/first" },
        { headSha: secondSha, kind: "head", refName: "refs/heads/second" },
      ]
    );
    expect(pages).toEqual([
      "/repos/example-org/example-repo/branches:1",
      "/repos/example-org/example-repo/branches:2",
      "/repos/example-org/example-repo/tags:1",
    ]);
  });
});
