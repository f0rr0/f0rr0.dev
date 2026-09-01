import { afterEach, describe, expect, test } from "bun:test";

import {
  backfillGitHubPullRequests,
  collectGitHubAuthoredPullRequestBackfillCandidates,
  githubPullRequestBelongsInBackfillWindow,
  persistGitHubPullRequestBackfillMembership,
} from "../src/lib/github-pull-request-backfill.ts";

const originalFetch = globalThis.fetch;
const sinceAt = new Date("2026-08-01T00:00:00.000Z");
const untilAt = new Date("2026-08-31T23:59:59.999Z");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const authoredPullRequestNode = (
  number,
  {
    nodeId = `PR_authored_${String(number)}`,
    repositoryId = 5000 + number,
    repositoryName = `external-org/repository-${String(number)}`,
    updatedAt = "2026-08-29T12:00:00Z",
  } = {}
) => ({
  author: { login: "f0rr0" },
  id: nodeId,
  number,
  repository: {
    databaseId: repositoryId,
    nameWithOwner: repositoryName,
  },
  updatedAt,
  url: `https://github.com/${repositoryName}/pull/${String(number)}`,
});

const authoredPullRequestPage = ({
  endCursor = null,
  hasNextPage = false,
  nodes = [],
  totalCount = nodes.length,
} = {}) => ({
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

const backfillInput = (overrides = {}) => ({
  account: "f0rr0",
  deadlineAt: Date.now() + 60_000,
  repositoryId: null,
  sinceAt,
  token: "test-token",
  untilAt,
  ...overrides,
});

const trackedCommit = (committedAt, author = "f0rr0") => ({
  author,
  committedAt,
  message: "feat: retained work",
  repository: "external-org/repository",
  repositoryId: "5001",
  sha: "f".repeat(40),
  url: `https://github.com/external-org/repository/commit/${"f".repeat(40)}`,
});

describe("GitHub authored pull request backfill", () => {
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

  test("walks authored PR pages and stops at the UTC window boundary", async () => {
    const cursors = [];
    globalThis.fetch = async (_input, options) => {
      const { variables } = JSON.parse(options.body);
      cursors.push(variables.cursor);
      if (variables.cursor === null) {
        return Response.json(
          authoredPullRequestPage({
            endCursor: "page-two",
            hasNextPage: true,
            nodes: [authoredPullRequestNode(1)],
            totalCount: 3,
          })
        );
      }
      return Response.json(
        authoredPullRequestPage({
          endCursor: "unused",
          hasNextPage: true,
          nodes: [
            authoredPullRequestNode(2, {
              updatedAt: "2026-07-31T23:59:59Z",
            }),
          ],
          totalCount: 3,
        })
      );
    };

    const result = await collectGitHubAuthoredPullRequestBackfillCandidates({
      account: "f0rr0",
      deadlineAt: Date.now() + 60_000,
      token: "test-token",
      updatedSinceAt: sinceAt,
    });

    expect(cursors).toEqual([null, "page-two"]);
    expect(result).toEqual({
      pages: 2,
      pullRequests: [expect.objectContaining({ nodeId: "PR_authored_1" })],
      totalCount: 3,
    });
  });

  test("fails closed when authored pagination repeats a cursor", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: "same-cursor",
          hasNextPage: true,
          nodes: [authoredPullRequestNode(page)],
          totalCount: 2,
        })
      );
    };

    await expect(
      collectGitHubAuthoredPullRequestBackfillCandidates({
        account: "f0rr0",
        deadlineAt: Date.now() + 60_000,
        token: "test-token",
        updatedSinceAt: sinceAt,
      })
    ).rejects.toThrow("invalid authored pull request pagination");
  });

  test("does not scan the accessible repository catalog", async () => {
    const paths = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      paths.push(url.pathname);
      return Response.json(authoredPullRequestPage());
    };

    const result = await backfillGitHubPullRequests(backfillInput());

    expect(result).toMatchObject({
      complete: true,
      repositories: 0,
      selectedAuthoredPullRequests: 0,
      stopReason: "complete",
    });
    expect(paths).toEqual(["/graphql"]);
  });

  test("filters a repository shard before hydrating candidates", async () => {
    const paths = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      paths.push(url.pathname);
      return Response.json(
        authoredPullRequestPage({
          nodes: [authoredPullRequestNode(1, { repositoryId: 5001 })],
          totalCount: 1,
        })
      );
    };

    const result = await backfillGitHubPullRequests(
      backfillInput({ repositoryId: "9999" })
    );

    expect(result).toMatchObject({
      complete: true,
      scannedPullRequests: 0,
      selectedAuthoredPullRequests: 0,
    });
    expect(paths).toEqual(["/graphql"]);
  });

  test("returns provider retry metadata immediately during candidate hydration", async () => {
    const retrySeconds = 120;
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/graphql") {
        return Response.json(
          authoredPullRequestPage({
            nodes: [authoredPullRequestNode(1)],
            totalCount: 1,
          })
        );
      }
      return Response.json(
        { message: "Service Unavailable" },
        { headers: { "retry-after": String(retrySeconds) }, status: 503 }
      );
    };

    const startedAt = Date.now();
    const result = await backfillGitHubPullRequests(backfillInput());

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toMatchObject({
      complete: false,
      scannedPullRequests: 1,
      stopReason: "provider_retry",
      unavailablePullRequests: 0,
    });
    expect(result.retryAt?.getTime()).toBeGreaterThanOrEqual(
      startedAt + retrySeconds * 1000
    );
  });

  test("records an inaccessible authored PR as an explicit coverage gap", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/graphql") {
        return Response.json(
          authoredPullRequestPage({
            nodes: [authoredPullRequestNode(1)],
            totalCount: 1,
          })
        );
      }
      return Response.json({ message: "Not Found" }, { status: 404 });
    };

    expect(await backfillGitHubPullRequests(backfillInput())).toMatchObject({
      complete: true,
      scannedPullRequests: 1,
      stopReason: "complete",
      unavailablePullRequests: 1,
    });
  });

  test("includes a PR only when its current membership has tracked work in range", () => {
    const belongs = (commits) =>
      githubPullRequestBelongsInBackfillWindow({
        account: "f0rr0",
        commits,
        pullRequest: { authorAccount: "f0rr0", mergedAt: null },
        sinceAt,
        untilAt,
      });

    expect(belongs([trackedCommit(sinceAt.toISOString())])).toBe(true);
    expect(belongs([trackedCommit(untilAt.toISOString())])).toBe(true);
    expect(belongs([trackedCommit("2026-09-01T00:00:00.000Z")])).toBe(false);
    expect(
      belongs([trackedCommit("2026-08-15T00:00:00.000Z", "someone")])
    ).toBe(false);
    expect(belongs([])).toBe(false);
  });
});
