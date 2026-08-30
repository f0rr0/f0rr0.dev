import { afterEach, describe, expect, test } from "bun:test";

import {
  backfillGitHubPullRequests,
  collectGitHubAuthoredPullRequestBackfillCandidates,
  collectGitHubPullRequestBackfillCandidates,
  githubPullRequestBelongsInBackfillWindow,
  persistGitHubPullRequestBackfillMembership,
} from "../src/lib/github-pull-request-backfill.ts";

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

const pullRequestValue = (number, updatedAt) => ({
  base: { ref: "main", repo: rawRepository, sha: "a".repeat(40) },
  body: null,
  closed_at: null,
  created_at: "2026-07-01T00:00:00Z",
  draft: false,
  head: {
    ref: `feature/${String(number)}`,
    repo: rawRepository,
    sha: number.toString(16).padStart(40, "0"),
  },
  html_url: `https://github.com/${repository.fullName}/pull/${String(number)}`,
  id: 1000 + number,
  merged_at: null,
  node_id: `PR_node_${String(number)}`,
  number,
  state: "open",
  title: `Pull request ${String(number)}`,
  updated_at: updatedAt,
  user: { id: 900, login: "other-maintainer" },
});

const authoredPullRequestNode = (
  number,
  {
    nodeId = `PR_authored_${String(number)}`,
    repositoryId = 5000 + number,
    repositoryName = `external-org/repository-${String(number)}`,
  } = {}
) => ({
  author: { login: "f0rr0" },
  id: nodeId,
  number,
  repository: {
    databaseId: repositoryId,
    nameWithOwner: repositoryName,
  },
  updatedAt: "2026-08-29T12:00:00Z",
  url: `https://github.com/${repositoryName}/pull/${String(number)}`,
});

const authoredPullRequestPage = ({
  endCursor = null,
  hasNextPage,
  nodes,
  totalCount,
}) => ({
  data: {
    user: {
      login: "f0rr0",
      pullRequests: {
        nodes,
        pageInfo: { endCursor, hasNextPage },
        totalCount,
      },
    },
  },
});

describe("GitHub pull request historical backfill", () => {
  test("does not rewrite complete membership on an unchanged PR rerun", async () => {
    let persistenceCalls = 0;
    const result = await persistGitHubPullRequestBackfillMembership({
      commitShas: ["a".repeat(40)],
      headSha: "a".repeat(40),
      membershipComplete: true,
      persist: async () => {
        persistenceCalls += 1;
        return true;
      },
      stored: {
        baseRepositoryId: "123",
        commitRepositoryId: "123",
        membershipRefreshRequired: false,
        pullRequestNodeId: "PR_unchanged",
        retryLifecycleReset: false,
        versionId: "version-1",
      },
    });

    expect(result).toEqual({ complete: true, refreshed: false });
    expect(persistenceCalls).toBe(0);
  });

  test("walks the authored PR connection beyond 100 pages", async () => {
    const totalCount = 101;
    let requests = 0;
    globalThis.fetch = async (_input, options) => {
      const body = JSON.parse(options.body);
      const page = requests;
      expect(body.variables.cursor).toBe(
        page === 0 ? null : `authored-cursor-${String(page)}`
      );
      expect(body.variables.login).toBe("f0rr0");
      expect(body.variables.pageSize).toBe(100);
      expect(body.query).toContain("user(login: $login)");
      requests += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor:
            page + 1 < totalCount
              ? `authored-cursor-${String(page + 1)}`
              : null,
          hasNextPage: page + 1 < totalCount,
          nodes: [authoredPullRequestNode(page + 1)],
          totalCount,
        })
      );
    };

    const result = await collectGitHubAuthoredPullRequestBackfillCandidates({
      account: "f0rr0",
      deadlineAt: Date.now() + 120_000,
      token: "test-token",
    });

    expect(result.pages).toBe(101);
    expect(result.totalCount).toBe(totalCount);
    expect(result.pullRequests).toHaveLength(totalCount);
    expect(requests).toBe(101);
  });

  test("rejects a cyclic authored PR cursor", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: "repeated-cursor",
          hasNextPage: true,
          nodes: [authoredPullRequestNode(page)],
          totalCount: 2,
        })
      );
    };

    await expect(
      collectGitHubAuthoredPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        token: "test-token",
      })
    ).rejects.toThrow("invalid authored pull request pagination");
  });

  test("rejects authored PR pagination without unique progress", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: `cursor-${String(page)}`,
          hasNextPage: true,
          nodes: [authoredPullRequestNode(1)],
          totalCount: 2,
        })
      );
    };

    await expect(
      collectGitHubAuthoredPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        token: "test-token",
      })
    ).rejects.toThrow("invalid authored pull request pagination");
  });

  test("rejects a changing authored PR total count", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: page === 1 ? "page-two" : null,
          hasNextPage: page === 1,
          nodes: [authoredPullRequestNode(page)],
          totalCount: page === 1 ? 2 : 3,
        })
      );
    };

    await expect(
      collectGitHubAuthoredPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        token: "test-token",
      })
    ).rejects.toThrow("invalid authored pull request connection");
  });

  test("rejects conflicting authored PR identities", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: page === 1 ? "page-two" : null,
          hasNextPage: page === 1,
          nodes: [
            authoredPullRequestNode(page, {
              nodeId: "PR_conflicting",
              repositoryId: 6000 + page,
              repositoryName: `external-org/conflict-${String(page)}`,
            }),
          ],
          totalCount: 2,
        })
      );
    };

    await expect(
      collectGitHubAuthoredPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        token: "test-token",
      })
    ).rejects.toThrow("conflicting pull requests");
  });

  test("discovers an authored PR in an unaffiliated external repository", async () => {
    globalThis.fetch = async () =>
      Response.json(
        authoredPullRequestPage({
          hasNextPage: false,
          nodes: [
            authoredPullRequestNode(7, {
              repositoryId: 7000,
              repositoryName: "unaffiliated/example",
            }),
          ],
          totalCount: 1,
        })
      );

    const result = await collectGitHubAuthoredPullRequestBackfillCandidates({
      account: "f0rr0",
      deadlineAt: Date.now() + 120_000,
      token: "test-token",
    });
    expect(result.pullRequests).toEqual([
      expect.objectContaining({
        nodeId: "PR_authored_7",
        repository: "unaffiliated/example",
        repositoryId: "7000",
      }),
    ]);
  });

  test("processes unshardable external authored PRs before affiliated repositories", async () => {
    const requestedPaths = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requestedPaths.push(url.pathname);
      if (url.pathname === "/user/repos") {
        return Response.json([rawRepository]);
      }
      if (url.pathname === "/graphql") {
        return Response.json(
          authoredPullRequestPage({
            hasNextPage: false,
            nodes: [
              authoredPullRequestNode(7, {
                repositoryId: 7000,
                repositoryName: "unaffiliated/example",
              }),
            ],
            totalCount: 1,
          })
        );
      }
      if (url.pathname === "/repos/unaffiliated/example/pulls/7") {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      throw new Error(`Unexpected GitHub request: ${url.href}`);
    };

    expect(
      await backfillGitHubPullRequests({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        repositoryId: null,
        sinceAt: new Date("2026-08-01T00:00:00.000Z"),
        token: "test-token",
        untilAt: new Date("2026-08-31T23:59:59.999Z"),
      })
    ).toMatchObject({
      complete: false,
      repositories: 1,
      scannedPullRequests: 1,
      stopReason: "provider_retry",
    });
    expect(requestedPaths).toEqual([
      "/user/repos",
      "/graphql",
      "/repos/unaffiliated/example/pulls/7",
    ]);
  });

  test("walks every all-state PR despite adversarially old update times", async () => {
    const requests = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(url);
      if (url.searchParams.get("page") === "2") {
        return Response.json([pullRequestValue(3, "2026-07-31T23:59:59Z")]);
      }
      const next = new URL(url);
      next.searchParams.set("page", "2");
      return Response.json(
        [
          // Updated after the commit window still matters: the PR may have
          // retained an in-window commit only after that window closed.
          pullRequestValue(1, "2026-09-10T00:00:00Z"),
          pullRequestValue(2, "2026-08-01T00:00:00Z"),
        ],
        { headers: { link: `<${next.href}>; rel="next"` } }
      );
    };

    const result = await collectGitHubPullRequestBackfillCandidates({
      account: "f0rr0",
      deadlineAt: Date.now() + 120_000,
      repository,
      token: "test-token",
    });

    expect(result.complete).toBe(true);
    expect(result.pullRequests.map(({ nodeId }) => nodeId)).toEqual([
      "PR_node_1",
      "PR_node_2",
      "PR_node_3",
    ]);
    expect(requests).toHaveLength(2);
    for (const url of requests) {
      expect(url.pathname).toBe("/repos/example-org/example-repo/pulls");
      expect(url.searchParams.get("direction")).toBe("desc");
      expect(url.searchParams.get("page")).toBe(
        String(requests.indexOf(url) + 1)
      );
      expect(url.searchParams.get("per_page")).toBe("100");
      expect(url.searchParams.get("sort")).toBe("updated");
      expect(url.searchParams.get("state")).toBe("all");
    }
  });

  test("rejects pagination that drops an inventory constraint", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const next = new URL(url);
      next.searchParams.set("page", "2");
      next.searchParams.delete("state");
      return Response.json([pullRequestValue(1, "2026-08-01T00:00:00Z")], {
        headers: { link: `<${next.href}>; rel="next"` },
      });
    };

    await expect(
      collectGitHubPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        repository,
        token: "test-token",
      })
    ).rejects.toThrow("invalid pull request pagination");
  });

  test("rejects pages that violate the documented descending order", async () => {
    globalThis.fetch = async () =>
      Response.json([
        pullRequestValue(1, "2026-08-01T00:00:00Z"),
        pullRequestValue(2, "2026-08-02T00:00:00Z"),
      ]);

    await expect(
      collectGitHubPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        repository,
        token: "test-token",
      })
    ).rejects.toThrow("outside descending updated order");
  });

  test("fails incomplete when a listed pull request becomes inaccessible", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/user/repos") {
        return Response.json([rawRepository]);
      }
      if (url.pathname === "/repos/example-org/example-repo/pulls") {
        return Response.json([pullRequestValue(1, "2026-08-01T00:00:00Z")]);
      }
      if (url.pathname === "/graphql") {
        return Response.json(
          authoredPullRequestPage({
            hasNextPage: false,
            nodes: [],
            totalCount: 0,
          })
        );
      }
      if (url.pathname === "/repos/example-org/example-repo/pulls/1") {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      throw new Error(`Unexpected GitHub request: ${url.href}`);
    };

    expect(
      await backfillGitHubPullRequests({
        account: "f0rr0",
        deadlineAt: Date.now() + 120_000,
        repositoryId: null,
        sinceAt: new Date("2026-08-01T00:00:00.000Z"),
        token: "test-token",
        untilAt: new Date("2026-08-31T23:59:59.999Z"),
      })
    ).toMatchObject({
      complete: false,
      scannedPullRequests: 1,
      skippedPullRequests: 0,
      stopReason: "provider_retry",
    });
  });

  test("includes only an in-window tracked commit or merged PR milestone", () => {
    const sinceAt = new Date("2026-08-01T00:00:00.000Z");
    const untilAt = new Date("2026-08-31T23:59:59.999Z");
    const commit = (committedAt) => ({
      author: "f0rr0",
      committedAt,
      message: "feat: retained work",
      repository: repository.fullName,
      repositoryId: repository.id,
      sha: "f".repeat(40),
      url: `https://github.com/${repository.fullName}/commit/${"f".repeat(40)}`,
    });
    const belongs = (input) =>
      githubPullRequestBelongsInBackfillWindow({
        account: "f0rr0",
        commits: [],
        sinceAt,
        untilAt,
        ...input,
      });

    expect(
      belongs({
        commits: [commit(sinceAt.toISOString())],
        pullRequest: { authorAccount: null, mergedAt: null },
      })
    ).toBe(true);
    expect(
      belongs({
        commits: [commit(untilAt.toISOString())],
        pullRequest: { authorAccount: null, mergedAt: null },
      })
    ).toBe(true);
    expect(
      belongs({
        pullRequest: {
          authorAccount: "f0rr0",
          mergedAt: "2026-08-15T00:00:00.000Z",
        },
      })
    ).toBe(true);
    expect(
      belongs({
        pullRequest: {
          authorAccount: "f0rr0",
          mergedAt: "2026-09-01T00:00:00.000Z",
        },
      })
    ).toBe(false);
    expect(
      belongs({
        pullRequest: { authorAccount: "f0rr0", mergedAt: null },
      })
    ).toBe(false);
  });
});
