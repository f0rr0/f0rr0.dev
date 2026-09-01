import { afterEach, describe, expect, test } from "bun:test";

import {
  backfillGitHubPullRequests,
  collectGitHubAuthoredPullRequestBackfillCandidates,
  githubPullRequestBackfillDigestFrom,
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
  baseRefOid: "a".repeat(40),
  commits: { totalCount: 1 },
  headRefOid: "b".repeat(40),
  id: nodeId,
  number,
  repository: {
    databaseId: repositoryId,
    nameWithOwner: repositoryName,
  },
  state: "OPEN",
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

const backfillDependencies = (overrides = {}) => ({
  persistDigest: async () => null,
  persistPrepared: async () => null,
  readDigest: async () => null,
  ...overrides,
});

const runBackfill = async (input = {}, dependencies = {}) =>
  await backfillGitHubPullRequests(
    backfillInput(input),
    backfillDependencies(dependencies)
  );

const parsedCandidate = (number, overrides = {}) => ({
  account: "f0rr0",
  baseSha: "a".repeat(40),
  commitCount: 1,
  headSha: "b".repeat(40),
  nodeId: `PR_authored_${String(number)}`,
  number,
  providerUpdatedAt: "2026-08-29T12:00:00.000Z",
  repository: `external-org/repository-${String(number)}`,
  repositoryId: String(5000 + number),
  state: "open",
  ...overrides,
});

const pullRequestResponse = ({ headSha = "b".repeat(40) } = {}) => {
  const repository = {
    full_name: "external-org/repository-1",
    html_url: "https://github.com/external-org/repository-1",
    id: 5001,
    owner: {
      avatar_url: "https://avatars.githubusercontent.com/u/5001?v=4",
      id: 5001,
      login: "external-org",
      type: "Organization",
    },
    private: false,
    visibility: "public",
  };
  return {
    base: { ref: "main", repo: repository, sha: "a".repeat(40) },
    body: null,
    closed_at: null,
    commits: 1,
    created_at: "2026-07-30T10:00:00Z",
    draft: false,
    head: { ref: "feature", repo: repository, sha: headSha },
    html_url: "https://github.com/external-org/repository-1/pull/1",
    id: 7001,
    merged: false,
    merged_at: null,
    node_id: "PR_authored_1",
    number: 1,
    state: "open",
    title: "Remove August work",
    updated_at: "2026-08-29T12:00:00Z",
    user: { id: 8_574_219, login: "f0rr0" },
  };
};

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

  test("fails closed when a repeated node crosses the history cutoff", async () => {
    let page = 0;
    globalThis.fetch = async () => {
      page += 1;
      return Response.json(
        authoredPullRequestPage({
          endCursor: page === 1 ? "page-two" : "unused",
          hasNextPage: true,
          nodes: [
            authoredPullRequestNode(1, {
              updatedAt:
                page === 1 ? "2026-08-29T12:00:00Z" : "2026-07-31T23:59:59Z",
            }),
          ],
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

    const result = await runBackfill();

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

    const result = await runBackfill({ repositoryId: "9999" });

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
    let checkpointWrites = 0;
    const result = await runBackfill(
      {},
      {
        persistDigest: async () => {
          checkpointWrites += 1;
        },
      }
    );

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
    expect(checkpointWrites).toBe(0);
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

    let checkpointWrites = 0;
    expect(
      await runBackfill(
        {},
        {
          persistDigest: async () => {
            checkpointWrites += 1;
          },
        }
      )
    ).toMatchObject({
      complete: true,
      scannedPullRequests: 1,
      stopReason: "complete",
      unavailablePullRequests: 1,
    });
    expect(checkpointWrites).toBe(0);
  });

  test("hashes the exact scope and candidate state independent of input order", () => {
    const candidates = [parsedCandidate(1), parsedCandidate(2)];
    const digest = (overrides = {}) =>
      githubPullRequestBackfillDigestFrom({
        account: "f0rr0",
        candidates,
        repositoryId: null,
        sinceAt,
        untilAt,
        ...overrides,
      });
    const mutations = [
      { account: "yuppiestechdev" },
      { candidates: [candidates[0]] },
      {
        candidates: [
          parsedCandidate(1, { providerUpdatedAt: "2026-08-30T00:00:00.000Z" }),
          candidates[1],
        ],
      },
      {
        candidates: [
          parsedCandidate(1, { repository: "renamed-org/repository-1" }),
          candidates[1],
        ],
      },
      {
        candidates: [
          parsedCandidate(1, { nodeId: "PR_replaced_identity" }),
          candidates[1],
        ],
      },
      {
        candidates: [parsedCandidate(1, { number: 99 }), candidates[1]],
      },
      {
        candidates: [
          parsedCandidate(1, { repositoryId: "9999" }),
          candidates[1],
        ],
      },
      {
        candidates: [
          parsedCandidate(1, { headSha: "c".repeat(40) }),
          candidates[1],
        ],
      },
      {
        candidates: [
          parsedCandidate(1, { baseSha: "d".repeat(40) }),
          candidates[1],
        ],
      },
      {
        candidates: [parsedCandidate(1, { commitCount: 2 }), candidates[1]],
      },
      {
        candidates: [parsedCandidate(1, { state: "merged" }), candidates[1]],
      },
      { repositoryId: "5001" },
      { sinceAt: new Date("2026-08-02T00:00:00.000Z") },
      { untilAt: new Date("2026-08-30T23:59:59.999Z") },
    ];

    expect(digest({ candidates: candidates.toReversed() })).toBe(digest());
    expect(digest()).toMatch(/^[a-f0-9]{64}$/u);
    expect(new Set(mutations.map(digest)).size).toBe(mutations.length);
    expect(mutations.map(digest)).not.toContain(digest());
  });

  test("reuses only an exact completed candidate traversal", async () => {
    const candidate = parsedCandidate(1);
    const completedDigest = githubPullRequestBackfillDigestFrom({
      account: "f0rr0",
      candidates: [candidate],
      repositoryId: null,
      sinceAt,
      untilAt,
    });
    const paths = [];
    let checkpointWrites = 0;
    let persistenceCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      paths.push(url.pathname);
      return Response.json(
        authoredPullRequestPage({
          nodes: [authoredPullRequestNode(1)],
          totalCount: 1,
        })
      );
    };

    const result = await runBackfill(
      {},
      {
        persistDigest: async () => {
          checkpointWrites += 1;
        },
        persistPrepared: async () => {
          persistenceCalls += 1;
        },
        readDigest: async () => completedDigest,
      }
    );

    expect(result).toMatchObject({
      complete: true,
      reusedPullRequests: 1,
      scannedPullRequests: 0,
      selectedAuthoredPullRequests: 1,
    });
    expect(paths).toEqual(["/graphql"]);
    expect(persistenceCalls).toBe(0);
    expect(checkpointWrites).toBe(0);
  });

  test("does not checkpoint inconsistent GraphQL and REST snapshots", async () => {
    let checkpointWrites = 0;
    let persistenceCalls = 0;
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
      return Response.json(pullRequestResponse({ headSha: "c".repeat(40) }));
    };

    const result = await runBackfill(
      {},
      {
        persistDigest: async () => {
          checkpointWrites += 1;
        },
        persistPrepared: async () => {
          persistenceCalls += 1;
        },
      }
    );

    expect(result).toMatchObject({
      complete: false,
      scannedPullRequests: 1,
      stopReason: "provider_retry",
      unavailablePullRequests: 0,
    });
    expect(persistenceCalls).toBe(0);
    expect(checkpointWrites).toBe(0);
  });

  test("persists current membership even when no tracked commit remains in range", async () => {
    const headSha = "b".repeat(40);
    const persisted = [];
    let checkpointWrites = 0;
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
      if (url.pathname.endsWith("/pulls/1/commits")) {
        return Response.json([
          {
            author: { id: 8_574_219, login: "f0rr0" },
            commit: {
              author: { date: "2026-07-30T12:00:00Z" },
              committer: { date: "2026-07-30T12:00:00Z" },
              message: "feat: removed from the August branch",
            },
            sha: headSha,
          },
        ]);
      }
      return Response.json(pullRequestResponse({ headSha }));
    };

    const result = await runBackfill(
      {},
      {
        persistDigest: async () => {
          checkpointWrites += 1;
        },
        persistPrepared: async (prepared, _account, progress) => {
          persisted.push(...prepared);
          progress.skippedPullRequests += prepared.length;
        },
        readDigest: async () => "0".repeat(64),
      }
    );

    expect(result).toMatchObject({
      complete: true,
      pullRequests: 0,
      scannedPullRequests: 1,
      skippedPullRequests: 1,
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      commits: [],
      inWindow: false,
      membership: { commitShas: [headSha], membershipComplete: true },
      snapshot: { pullRequest: { headSha } },
    });
    expect(checkpointWrites).toBe(1);
  });

  test("includes a PR only when its current membership has tracked work in range", () => {
    const belongs = (commits) =>
      githubPullRequestBelongsInBackfillWindow({
        account: "f0rr0",
        commits,
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
