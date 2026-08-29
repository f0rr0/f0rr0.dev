import { afterEach, describe, expect, test } from "bun:test";

import {
  collectAccessibleGitHubRepositories,
  collectGitHubRepositoryRefs,
  hydrateSparseGitHubPullRequestEvents,
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

  test("enumerates heads and peels annotated tags to commit SHAs", async () => {
    const headSha = "a".repeat(40);
    const tagSha = "b".repeat(40);
    const taggedCommitSha = "c".repeat(40);
    const paths = [];
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      paths.push(url.pathname);
      if (url.pathname.endsWith("/git/matching-refs/heads/")) {
        return Response.json([
          {
            object: { sha: headSha, type: "commit" },
            ref: "refs/heads/main",
          },
        ]);
      }
      if (url.pathname.endsWith("/git/matching-refs/tags/")) {
        return Response.json([
          {
            object: { sha: tagSha, type: "tag" },
            ref: "refs/tags/v1.0.0",
          },
        ]);
      }
      if (url.pathname.endsWith(`/git/tags/${tagSha}`)) {
        return Response.json({
          object: { sha: taggedCommitSha, type: "commit" },
        });
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
      "/repos/example-org/example-repo/git/matching-refs/heads/",
      "/repos/example-org/example-repo/git/matching-refs/tags/",
      `/repos/example-org/example-repo/git/tags/${tagSha}`,
    ]);
  });
});

describe("sparse PullRequestEvent hydration", () => {
  const event = {
    id: "123456789",
    issue: null,
    occurredAt: "2026-08-29T10:00:00.000Z",
    pullRequest: null,
    pullRequestSignal: {
      action: "opened",
      number: 7,
      repository: {
        fullName: repositoryFacts.fullName,
        id: repositoryFacts.id,
      },
    },
    push: null,
  };

  test("hydrates an unknown sparse event before its checkpoint advances", async () => {
    const headSha = "d".repeat(40);
    const baseSha = "e".repeat(40);
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/repos/example-org/example-repo/pulls/7");
      return Response.json({
        base: { ref: "main", repo: repository, sha: baseSha },
        body: "Adds credit billing.",
        closed_at: null,
        created_at: "2026-08-29T09:00:00Z",
        draft: false,
        head: { ref: "credit-billing", repo: repository, sha: headSha },
        html_url: "https://github.com/example-org/example-repo/pull/7",
        id: 789,
        merge_commit_sha: null,
        merged: false,
        merged_at: null,
        node_id: "PR_example",
        number: 7,
        state: "open",
        title: "Add credit billing",
        updated_at: "2026-08-29T10:00:00Z",
        user: { id: 101, login: "f0rr0" },
      });
    };

    const [hydrated] = await hydrateSparseGitHubPullRequestEvents(
      [event],
      "token"
    );
    expect(hydrated.pullRequest).toMatchObject({
      authorAccount: "f0rr0",
      nodeId: "PR_example",
      number: 7,
      title: "Add credit billing",
    });
    expect(hydrated.pullRequestSignal).toBeUndefined();
  });

  test("retains an inaccessible signal so known-PR reconciliation can still run", async () => {
    globalThis.fetch = async () => new Response(null, { status: 404 });
    expect(
      await hydrateSparseGitHubPullRequestEvents([event], "token")
    ).toEqual([event]);
  });
});
