import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { env } from "../src/env.ts";
import {
  fetchGitHubActivityCommitSource,
  fetchGitHubAssociatedPullRequests,
  fetchGitHubPullRequestSnapshot,
  fetchGitHubPullRequestSource,
  fetchGitHubPullRequestMembershipWithToken,
  fetchGitHubPushObservationSource,
  generateValidatedGitHubActivitySummary,
  GITHUB_ACTIVITY_FALLBACK_SUMMARY_MODEL,
  resolveGitHubPullRequestMergeCommits,
} from "../src/lib/github-activity-processor.ts";
import { GitHubRequestDeadlineError } from "../src/lib/github-api.ts";

const originalFetch = globalThis.fetch;
const originalF0rr0Token = env.GITHUB_F0RR0_TOKEN;
const originalYuppiesTechDevToken = env.GITHUB_YUPPIESTECHDEV_TOKEN;
const originalDefaultToken = env.GITHUB_TOKEN;
const originalOpenAiKey = env.OPENAI_API_KEY;
const originalProcessOpenAiKey = process.env.OPENAI_API_KEY;

const pushCommitValue = (sha, login, id) => ({
  author: { id, login },
  commit: {
    author: { date: "2026-08-28T12:00:00Z" },
    message: `feat: ${login} change`,
  },
  html_url: `https://github.com/example-org/example-repo/commit/${sha}`,
  sha,
});

const summarySource = (isPrivate) => ({
  authorUserId: "1",
  authoredAt: "2026-08-28T12:00:00.000Z",
  commit: {
    committedAt: "2026-08-28T12:00:00.000Z",
    files: [],
    message: "feat(billing): add AI credit ledger",
    parents: ["a".repeat(40)],
    providerFileCapReached: false,
    sha: "b".repeat(40),
    stats: { additions: 0, deletions: 0, total: 0 },
    treeSha: "c".repeat(40),
  },
  committerAt: "2026-08-28T12:00:00.000Z",
  committerUserId: "1",
  repository: {
    avatarUrl: null,
    description: null,
    fullName: "private-owner/private-repo",
    homepageUrl: null,
    ownerLogin: "private-owner",
    ownerType: "Organization",
    private: isPrivate,
    topics: [],
  },
});

const restoreEnvironmentValue = (name, value, target = env) => {
  if (value === undefined) {
    Reflect.deleteProperty(target, name);
  } else {
    target[name] = value;
  }
};

beforeEach(() => {
  delete env.GITHUB_F0RR0_TOKEN;
  delete env.GITHUB_YUPPIESTECHDEV_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.OPENAI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironmentValue("GITHUB_F0RR0_TOKEN", originalF0rr0Token);
  restoreEnvironmentValue(
    "GITHUB_YUPPIESTECHDEV_TOKEN",
    originalYuppiesTechDevToken
  );
  restoreEnvironmentValue("GITHUB_TOKEN", originalDefaultToken);
  restoreEnvironmentValue("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnvironmentValue(
    "OPENAI_API_KEY",
    originalProcessOpenAiKey,
    process.env
  );
});

test("summarizes privately without sending source evidence to a model", async () => {
  const summary = await generateValidatedGitHubActivitySummary(
    summarySource(true)
  );

  expect(summary.model).toBe(GITHUB_ACTIVITY_FALLBACK_SUMMARY_MODEL);
  expect(summary.summary).toEqual({
    headline: "Add AI credit ledger",
    short: "Add AI credit ledger",
  });
});

test("bounds model summaries by the worker deadline and falls back deterministically", async () => {
  env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  let providerSignal;
  globalThis.fetch = async (_input, init) => {
    providerSignal = init.signal;
    await delay(60_000, undefined, { signal: providerSignal });
    return Response.json({});
  };

  const startedAt = Date.now();
  const summary = await generateValidatedGitHubActivitySummary(
    summarySource(false),
    { deadlineAt: startedAt + 50 }
  );

  expect(providerSignal).toBeInstanceOf(AbortSignal);
  expect(providerSignal.aborted).toBe(true);
  expect(Date.now() - startedAt).toBeLessThan(1000);
  expect(summary.model).toBe(GITHUB_ACTIVITY_FALLBACK_SUMMARY_MODEL);
  expect(summary.summary).toEqual({
    headline: "Add AI credit ledger",
    short: "Add AI credit ledger",
  });
});

describe("GitHub activity commit acquisition", () => {
  test("accepts an exactly full 3,000-file response and marks the provider cap", async () => {
    const sha = "a".repeat(40);
    const parentSha = "b".repeat(40);
    const filenames = Array.from(
      { length: 3000 },
      (_, index) => `src/file-${String(index).padStart(4, "0")}.ts`
    );
    filenames[0] = "é.ts";
    filenames[1] = "z.ts";
    filenames[2] = "A.ts";
    const requestedPages = [];

    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname === "/repos/example-org/example-repo") {
        return Response.json({
          description: "Example repository",
          full_name: "example-org/example-repo",
          homepage: null,
          id: 123,
          owner: {
            avatar_url: "https://avatars.githubusercontent.com/u/123?v=4",
            login: "example-org",
            type: "Organization",
          },
          private: false,
          topics: [],
        });
      }

      expect(url.pathname).toBe(
        `/repos/example-org/example-repo/commits/${sha}`
      );
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      const offset = (page - 1) * 100;
      return Response.json({
        author: { id: 100, login: "f0rr0" },
        commit: {
          author: { date: "2026-08-28T12:00:00Z" },
          committer: { date: "2026-08-28T12:01:00Z" },
          message: "feat: process a very large commit",
          tree: { sha: "c".repeat(40) },
        },
        committer: { id: 200, login: "github" },
        files: filenames.slice(offset, offset + 100).map((filename) => ({
          additions: 1,
          deletions: 0,
          filename,
          patch: "+change",
          status: "modified",
        })),
        parents: [{ sha: parentSha }],
        sha,
        stats: { additions: 3000, deletions: 0, total: 3000 },
      });
    };

    const source = await fetchGitHubActivityCommitSource({
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: process a very large commit",
      repository: "example-org/example-repo",
      repositoryId: "123",
      sha,
    });

    expect(requestedPages).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(source.commit.files).toHaveLength(3000);
    expect(source.commit.providerFileCapReached).toBe(true);
    expect(source.commit.treeSha).toBe("c".repeat(40));
    expect(source.authorUserId).toBe("100");
    expect(source.authoredAt).toBe("2026-08-28T12:00:00.000Z");
    expect(source.committerAt).toBe("2026-08-28T12:01:00.000Z");
    expect(source.committerUserId).toBe("200");
    expect(source.commit.files[0]?.filename).toBe("A.ts");
    expect(source.commit.files.at(-2)?.filename).toBe("z.ts");
    expect(source.commit.files.at(-1)?.filename).toBe("é.ts");
  });

  test("requires explicit valid ancestry while accepting a root commit", async () => {
    const sha = "d".repeat(40);
    const ancestryResponses = [undefined, [{ sha: "not-a-sha" }], []];
    let commitReads = 0;
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname === "/repos/example-org/example-repo") {
        return Response.json({
          description: null,
          full_name: "example-org/example-repo",
          homepage: null,
          id: 123,
          owner: {
            avatar_url: "https://avatars.githubusercontent.com/u/123?v=4",
            id: 123,
            login: "example-org",
            type: "Organization",
          },
          private: false,
          topics: [],
          visibility: "public",
        });
      }
      const parents = ancestryResponses[commitReads];
      commitReads += 1;
      return Response.json({
        author: { id: 100, login: "f0rr0" },
        commit: {
          author: { date: "2026-08-28T12:00:00Z" },
          committer: { date: "2026-08-28T12:01:00Z" },
          message: "feat: preserve authoritative ancestry",
          tree: { sha: "e".repeat(40) },
        },
        committer: { id: 200, login: "github" },
        files: [],
        ...(parents === undefined ? {} : { parents }),
        sha,
        stats: { additions: 0, deletions: 0, total: 0 },
      });
    };
    const reference = {
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: preserve authoritative ancestry",
      repository: "example-org/example-repo",
      repositoryId: "123",
      sha,
    };

    await expect(
      fetchGitHubActivityCommitSource(reference)
    ).rejects.toMatchObject({ code: "source_invalid" });
    await expect(
      fetchGitHubActivityCommitSource(reference)
    ).rejects.toMatchObject({ code: "source_invalid" });
    const root = await fetchGitHubActivityCommitSource(reference);
    expect(root.commit.parents).toEqual([]);
  });

  test("expands a push durably while retaining only tracked-authored commits", async () => {
    const beforeSha = "1".repeat(40);
    const trackedSha = "3".repeat(40);
    const foreignSha = "4".repeat(40);
    const afterSha = foreignSha;
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe(
        `/repos/example-org/example-repo/compare/${beforeSha}...${afterSha}`
      );
      return Response.json({
        ahead_by: 2,
        commits: [
          pushCommitValue(trackedSha, "f0rr0", 100),
          pushCommitValue(foreignSha, "octocat", 200),
        ],
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha,
      expectedCommitCount: 2,
      knownShas: [trackedSha, foreignSha],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual([trackedSha, foreignSha]);
    expect(source.commits).toHaveLength(1);
    expect(source.commits[0]?.author).toBe("f0rr0");
  });

  test("rejects surplus compare commits instead of truncating away the head", async () => {
    const beforeSha = "1".repeat(40);
    const firstSha = "2".repeat(40);
    const surplusSha = "3".repeat(40);
    const afterSha = "4".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () =>
      Response.json({
        ahead_by: 3,
        commits: [
          pushCommitValue(firstSha, "f0rr0", 100),
          pushCommitValue(surplusSha, "octocat", 200),
          pushCommitValue(afterSha, "f0rr0", 100),
        ],
      });

    await expect(
      fetchGitHubPushObservationSource({
        account: "f0rr0",
        afterSha,
        beforeSha,
        expectedCommitCount: 2,
        knownShas: [firstSha, afterSha],
        observedAt: new Date("2026-08-28T12:00:00.000Z"),
        refName: "refs/heads/main",
        repository: "example-org/example-repo",
        repositoryId: "123",
      })
    ).rejects.toMatchObject({ code: "source_incomplete" });
  });

  test("rejects a pushed sequence that contradicts durable commit order", async () => {
    const beforeSha = "1".repeat(40);
    const firstSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () =>
      Response.json({
        ahead_by: 2,
        commits: [
          pushCommitValue(firstSha, "f0rr0", 100),
          pushCommitValue(afterSha, "f0rr0", 100),
        ],
      });

    await expect(
      fetchGitHubPushObservationSource({
        account: "f0rr0",
        afterSha,
        beforeSha,
        expectedCommitCount: 2,
        knownShas: [afterSha, firstSha],
        observedAt: new Date("2026-08-28T12:00:00.000Z"),
        refName: "refs/heads/main",
        repository: "example-org/example-repo",
        repositoryId: "123",
      })
    ).rejects.toMatchObject({ code: "source_incomplete" });
  });

  test("isolates malformed foreign commits and accepts an empty tracked message", async () => {
    const beforeSha = "1".repeat(40);
    const foreignSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () =>
      Response.json({
        ahead_by: 2,
        commits: [
          { author: { login: "octocat" }, commit: null, sha: foreignSha },
          {
            author: { login: "f0rr0" },
            commit: {
              author: { date: "2026-08-28T12:01:00Z" },
              message: "",
            },
            sha: afterSha,
          },
        ],
      });

    const observedAt = new Date("2026-08-28T12:34:00.000Z");
    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha,
      expectedCommitCount: 2,
      knownShas: [foreignSha, afterSha],
      observedAt,
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual([foreignSha, afterSha]);
    expect(source.commits).toEqual([
      expect.objectContaining({
        committedAt: "2026-08-28T12:01:00.000Z",
        message: "",
        sha: afterSha,
      }),
    ]);
  });

  test("rejects a tracked commit without a provider timestamp", async () => {
    const beforeSha = "1".repeat(40);
    const afterSha = "2".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () =>
      Response.json({
        ahead_by: 1,
        commits: [
          {
            author: { login: "f0rr0" },
            commit: { author: { date: "not-a-date" }, message: "change" },
            sha: afterSha,
          },
        ],
      });

    await expect(
      fetchGitHubPushObservationSource({
        account: "f0rr0",
        afterSha,
        beforeSha,
        expectedCommitCount: 1,
        knownShas: [afterSha],
        observedAt: new Date("2026-08-28T12:34:00.000Z"),
        refName: "refs/heads/main",
        repository: "example-org/example-repo",
        repositoryId: "123",
      })
    ).rejects.toMatchObject({ code: "source_invalid" });
  });

  test("accepts a ref rewind with no newly reachable commits", async () => {
    const beforeSha = "1".repeat(40);
    const afterSha = "2".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () => Response.json({ ahead_by: 0, commits: [] });

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha,
      expectedCommitCount: null,
      historySinceAt: new Date("2026-08-18T00:00:00.000Z"),
      knownShas: [],
      observedAt: new Date("2026-08-28T12:34:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source).toEqual({ commitShas: [], commits: [] });
  });

  test("falls back to bounded reachable history when a force-push base is gone", async () => {
    const beforeSha = "1".repeat(40);
    const olderSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    const paths = [];
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      paths.push(url.pathname);
      if (url.pathname.includes("/compare/")) {
        return new Response(null, { status: 404 });
      }
      const request = JSON.parse(init?.body);
      expect(request.variables.since).toBe("2026-08-18T00:00:00.000Z");
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [
                  {
                    author: { user: { login: "f0rr0" } },
                    authoredDate: "2026-08-28T12:00:00Z",
                    committedDate: "2026-08-28T12:01:00Z",
                    message: "head",
                    oid: afterSha,
                    url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                  },
                  {
                    author: { user: { login: "octocat" } },
                    authoredDate: "2026-08-28T11:00:00Z",
                    committedDate: "2026-08-28T11:01:00Z",
                    message: "older",
                    oid: olderSha,
                    url: `https://github.com/example-org/example-repo/commit/${olderSha}`,
                  },
                ],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha,
      expectedCommitCount: null,
      historySinceAt: new Date("2026-08-18T00:00:00.000Z"),
      knownShas: [],
      observedAt: new Date("2026-08-28T12:34:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(paths).toEqual([
      `/repos/example-org/example-repo/compare/${beforeSha}...${afterSha}`,
      "/graphql",
    ]);
    expect(source.commitShas).toEqual([olderSha, afterSha]);
    expect(source.commits.map(({ sha }) => sha)).toEqual([afterSha]);
    expect(source.commits[0]?.committedAt).toBe("2026-08-28T12:01:00.000Z");
  });

  test("bounds a new branch by the observed count without slicing history", async () => {
    const olderSha = "1".repeat(40);
    const afterSha = "2".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/graphql");
      expect(init?.method).toBe("POST");
      const request = JSON.parse(init?.body);
      expect(request.variables.pageSize).toBe(2);
      expect(request.variables.since).toBeNull();
      expect(request.variables.until).toBeNull();
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [
                  {
                    author: { user: { login: "f0rr0" } },
                    authoredDate: "2026-08-28T12:00:00Z",
                    committedDate: "2026-08-28T12:01:00Z",
                    message: "head",
                    oid: afterSha,
                    url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                  },
                  {
                    author: { user: { login: "octocat" } },
                    authoredDate: "2026-08-28T11:00:00Z",
                    committedDate: "2026-08-28T11:01:00Z",
                    message: "older",
                    oid: olderSha,
                    url: `https://github.com/example-org/example-repo/commit/${olderSha}`,
                  },
                ],
                pageInfo: { endCursor: null, hasNextPage: true },
              },
            },
          },
        },
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha: "0".repeat(40),
      expectedCommitCount: 2,
      historySinceAt: new Date("2026-08-18T00:00:00.000Z"),
      knownShas: [olderSha, afterSha],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/new",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual([olderSha, afterSha]);
    expect(source.commits.map(({ sha }) => sha)).toEqual([afterSha]);
  });

  test("walks new-ref history back to the fixed timeline boundary", async () => {
    const olderSha = "1".repeat(40);
    const middleSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    const cursors = [];
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init?.body);
      cursors.push(request.variables.cursor);
      expect(request.variables.pageSize).toBe(100);
      expect(request.variables.since).toBe("2026-08-18T00:00:00.000Z");
      expect(request.variables.until).toBeNull();
      const secondPage = request.variables.cursor === "page-2";
      return Response.json({
        data: {
          repository: {
            object: {
              history: secondPage
                ? {
                    nodes: [
                      {
                        author: { user: { login: "octocat" } },
                        authoredDate: "2026-08-28T10:00:00Z",
                        committedDate: "2026-08-28T10:01:00Z",
                        message: "older",
                        oid: olderSha,
                        url: `https://github.com/example-org/example-repo/commit/${olderSha}`,
                      },
                    ],
                    pageInfo: { endCursor: null, hasNextPage: false },
                  }
                : {
                    nodes: [
                      {
                        author: { user: { login: "f0rr0" } },
                        authoredDate: "2026-08-28T12:00:00Z",
                        committedDate: "2026-08-28T12:01:00Z",
                        message: "head",
                        oid: afterSha,
                        url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                      },
                      {
                        author: { user: { login: "f0rr0" } },
                        authoredDate: "2026-08-28T11:00:00Z",
                        committedDate: "2026-08-28T11:01:00Z",
                        message: "middle",
                        oid: middleSha,
                        url: `https://github.com/example-org/example-repo/commit/${middleSha}`,
                      },
                    ],
                    pageInfo: {
                      endCursor: "page-2",
                      hasNextPage: true,
                    },
                  },
            },
          },
        },
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha: "0".repeat(40),
      expectedCommitCount: null,
      historySinceAt: new Date("2026-08-18T00:00:00.000Z"),
      knownShas: [],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/new",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(cursors).toEqual([null, "page-2"]);
    expect(source.commitShas).toEqual([olderSha, middleSha, afterSha]);
    expect(source.commits.map(({ sha }) => sha)).toEqual([middleSha, afterSha]);
  });

  test("backfills a closed date window without requiring the current ref head", async () => {
    const rangedSha = "4".repeat(40);
    const afterSha = "5".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init?.body);
      expect(request.variables.since).toBe("2026-07-01T00:00:00.000Z");
      expect(request.variables.until).toBe("2026-07-31T23:59:59.999Z");
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [
                  {
                    author: { user: { login: "f0rr0" } },
                    authoredDate: "2026-07-15T12:00:00Z",
                    committedDate: "2026-07-15T12:01:00Z",
                    message: "historical change",
                    oid: rangedSha,
                    url: `https://github.com/example-org/example-repo/commit/${rangedSha}`,
                  },
                ],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha: "0".repeat(40),
      expectedCommitCount: null,
      historySinceAt: new Date("2026-07-01T00:00:00.000Z"),
      historyUntilAt: new Date("2026-07-31T23:59:59.999Z"),
      knownShas: [],
      observedAt: new Date("2026-08-29T12:00:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual([rangedSha]);
    expect(source.commits.map(({ sha }) => sha)).toEqual([rangedSha]);
  });

  test("accepts a ref whose reachable history predates the boundary", async () => {
    const afterSha = "4".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init?.body);
      expect(request.variables.since).toBe("2026-08-18T00:00:00.000Z");
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        },
      });
    };

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha: "0".repeat(40),
      expectedCommitCount: null,
      historySinceAt: new Date("2026-08-18T00:00:00.000Z"),
      knownShas: [],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/old",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source).toEqual({ commitShas: [], commits: [] });
  });
});

describe("GitHub pull request merge commit resolution", () => {
  test("batches node IDs and returns authoritative merge commits in input order", async () => {
    const firstSha = "6".repeat(40);
    const secondSha = "7".repeat(40);
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls += 1;
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/graphql");
      expect(init?.method).toBe("POST");
      const request = JSON.parse(init?.body);
      expect(request.variables.ids).toEqual(["PR_first", "PR_second"]);
      return Response.json({
        data: {
          nodes: [
            {
              __typename: "PullRequest",
              id: "PR_second",
              mergeCommit: { oid: secondSha },
              merged: true,
            },
            {
              __typename: "PullRequest",
              id: "PR_first",
              mergeCommit: { oid: firstSha },
              merged: true,
            },
          ],
        },
      });
    };

    expect(
      await resolveGitHubPullRequestMergeCommits(
        ["PR_first", "PR_second"],
        "test-token"
      )
    ).toEqual([
      { mergeCommitSha: firstSha, nodeId: "PR_first" },
      { mergeCommitSha: secondSha, nodeId: "PR_second" },
    ]);
    expect(calls).toBe(1);
  });

  test("resolves an authoritative null merge commit for a rebase merge", async () => {
    globalThis.fetch = async () =>
      Response.json({
        data: {
          nodes: [
            {
              __typename: "PullRequest",
              id: "PR_pending",
              mergeCommit: null,
              merged: true,
            },
          ],
        },
      });

    expect(
      await resolveGitHubPullRequestMergeCommits(["PR_pending"], "test-token")
    ).toEqual([{ mergeCommitSha: null, nodeId: "PR_pending" }]);
  });

  test("rejects HTTP-200 GraphQL errors instead of consuming partial data", async () => {
    globalThis.fetch = async () =>
      Response.json({
        data: {
          nodes: [
            {
              __typename: "PullRequest",
              id: "PR_partial",
              mergeCommit: { oid: "8".repeat(40) },
              merged: true,
            },
          ],
        },
        errors: [{ message: "Resolver timed out", type: "INTERNAL" }],
      });

    await expect(
      resolveGitHubPullRequestMergeCommits(["PR_partial"], "test-token")
    ).rejects.toMatchObject({
      code: "source_incomplete",
      kind: "partial_response",
      retryable: true,
    });
  });

  test("classifies HTTP-200 GraphQL rate limits with their reset time", async () => {
    const resetAt = new Date("2026-08-30T18:00:00.000Z");
    globalThis.fetch = async () =>
      Response.json(
        {
          data: null,
          errors: [
            { message: "API rate limit exceeded", type: "RATE_LIMITED" },
          ],
        },
        {
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetAt.getTime() / 1000),
          },
        }
      );

    await expect(
      resolveGitHubPullRequestMergeCommits(["PR_limited"], "test-token")
    ).rejects.toMatchObject({
      code: "source_incomplete",
      kind: "rate_limited",
      retryable: true,
      retryAt: resetAt,
    });
  });

  test("waits at least one minute for a headerless GraphQL secondary limit", async () => {
    const requestedAt = Date.now();
    globalThis.fetch = async () =>
      Response.json({
        data: null,
        errors: [{ message: "Secondary rate limit exceeded" }],
      });

    let caught;
    try {
      await resolveGitHubPullRequestMergeCommits(
        ["PR_secondary_limited"],
        "test-token"
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: "source_incomplete",
      kind: "rate_limited",
      retryable: true,
    });
    expect(caught.retryAt.getTime()).toBeGreaterThanOrEqual(
      requestedAt + 60_000
    );
  });

  test("classifies a rejected GraphQL request as non-retryable", async () => {
    globalThis.fetch = async () =>
      Response.json({
        data: null,
        errors: [{ message: "Resource not accessible", type: "FORBIDDEN" }],
      });

    await expect(
      resolveGitHubPullRequestMergeCommits(["PR_hidden"], "test-token")
    ).rejects.toMatchObject({
      code: "source_invalid",
      kind: "request_rejected",
      retryable: false,
    });
  });
});

describe("GitHub pull request acquisition", () => {
  const repository = {
    full_name: "example-org/example-repo",
    html_url: "https://github.com/example-org/example-repo",
    id: 123,
    owner: {
      avatar_url: "https://avatars.githubusercontent.com/u/123?v=4",
      id: 123,
      login: "example-org",
      type: "Organization",
    },
    private: false,
    visibility: "public",
  };
  const baseSha = "e".repeat(40);
  const memberShas = ["f".repeat(40), "1".repeat(40)];
  const headSha = memberShas.at(-1);
  const pullRequest = {
    base: { ref: "main", repo: repository, sha: baseSha },
    body: "Adds the public activity worker.",
    closed_at: null,
    commits: memberShas.length,
    created_at: "2026-08-27T10:00:00Z",
    draft: false,
    head: { ref: "feature/worker", repo: repository, sha: headSha },
    html_url: "https://github.com/example-org/example-repo/pull/7",
    id: 700,
    merged: false,
    merged_at: null,
    node_id: "PR_node_700",
    number: 7,
    state: "open",
    title: "Build a durable activity worker",
    updated_at: "2026-08-28T10:00:00Z",
    user: { id: 900, login: "other-maintainer" },
  };
  const authoritativeMergeSha = "2".repeat(40);
  const rest2026MergedPullRequest = {
    ...pullRequest,
    closed_at: "2026-08-28T11:00:00Z",
    merged: true,
    merged_at: "2026-08-28T11:00:00Z",
    state: "closed",
    updated_at: "2026-08-28T11:00:00Z",
  };

  test("rejects an invalid associated-PR item instead of completing empty", async () => {
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () =>
      Response.json([{ ...pullRequest, node_id: null }]);

    await expect(
      fetchGitHubAssociatedPullRequests({
        author: "f0rr0",
        committedAt: "2026-08-28T12:00:00.000Z",
        message: "feat: reject ambiguous PR evidence",
        repository: repository.full_name,
        repositoryId: String(repository.id),
        sha: "3".repeat(40),
      })
    ).rejects.toMatchObject({ code: "source_invalid" });
  });

  test("resolves an associated REST 2026 merged PR through GraphQL", async () => {
    expect(Object.hasOwn(rest2026MergedPullRequest, "merge_commit_sha")).toBe(
      false
    );
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname === "/graphql") {
        return Response.json({
          data: {
            nodes: [
              {
                __typename: "PullRequest",
                id: pullRequest.node_id,
                mergeCommit: { oid: authoritativeMergeSha },
                merged: true,
              },
            ],
          },
        });
      }
      return Response.json([rest2026MergedPullRequest]);
    };

    const [associated] = await fetchGitHubAssociatedPullRequests({
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: resolve merged PR identity",
      repository: repository.full_name,
      repositoryId: String(repository.id),
      sha: "4".repeat(40),
    });
    expect(associated?.mergeCommitSha).toBe(authoritativeMergeSha);
  });

  test("resolves an authoritative merge SHA for REST 2026 snapshots", async () => {
    env.GITHUB_F0RR0_TOKEN = "test-token";
    const requestedPaths = [];
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      requestedPaths.push(url.pathname);
      if (url.pathname === "/graphql") {
        return Response.json({
          data: {
            nodes: [
              {
                __typename: "PullRequest",
                id: pullRequest.node_id,
                mergeCommit: { oid: authoritativeMergeSha },
                merged: true,
              },
            ],
          },
        });
      }
      return Response.json(rest2026MergedPullRequest);
    };

    const snapshot = await fetchGitHubPullRequestSnapshot({
      account: "f0rr0",
      number: 7,
      repository: repository.full_name,
      repositoryId: String(repository.id),
    });
    expect(snapshot.pullRequest.mergeCommitSha).toBe(authoritativeMergeSha);
    expect(requestedPaths).toEqual([
      `/repos/${repository.full_name}/pulls/7`,
      "/graphql",
    ]);
  });

  test("preserves an authoritative null merge SHA for a rebase merge", async () => {
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname === "/graphql") {
        return Response.json({
          data: {
            nodes: [
              {
                __typename: "PullRequest",
                id: pullRequest.node_id,
                mergeCommit: null,
                merged: true,
              },
            ],
          },
        });
      }
      return Response.json(rest2026MergedPullRequest);
    };

    const snapshot = await fetchGitHubPullRequestSnapshot({
      account: "f0rr0",
      number: 7,
      repository: repository.full_name,
      repositoryId: String(repository.id),
    });
    expect(snapshot.pullRequest.mergeCommitSha).toBeNull();
  });

  test("retains tracked PR commits at their committer timestamp", async () => {
    const sha = headSha;
    globalThis.fetch = async () =>
      Response.json([
        {
          author: { login: "f0rr0" },
          commit: {
            author: { date: "2026-08-01T09:00:00Z" },
            committer: { date: "2026-08-01T12:00:00Z" },
            message: "feat: retain the provider timestamp",
          },
          sha,
        },
      ]);

    const membership = await fetchGitHubPullRequestMembershipWithToken(
      {
        account: "f0rr0",
        number: 7,
        repository: repository.full_name,
        repositoryId: String(repository.id),
      },
      1,
      "test-token",
      { expectedHeadSha: sha }
    );
    expect(membership).toMatchObject({
      commits: [
        {
          committedAt: "2026-08-01T12:00:00.000Z",
          sha,
        },
      ],
      membershipComplete: true,
    });
  });

  test("accepts an upstream PR discovered from a fork commit", async () => {
    const commitSha = "9".repeat(40);
    const forkRepository = {
      full_name: "f0rr0/example-repo-fork",
      html_url: "https://github.com/f0rr0/example-repo-fork",
      id: 456,
      owner: {
        avatar_url: "https://avatars.githubusercontent.com/u/456?v=4",
        id: 456,
        login: "f0rr0",
        type: "User",
      },
      private: false,
      visibility: "public",
    };
    const upstreamPullRequest = {
      ...pullRequest,
      head: {
        ref: "feature/worker",
        repo: forkRepository,
        sha: headSha,
      },
    };
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe(
        `/repos/${forkRepository.full_name}/commits/${commitSha}/pulls`
      );
      return Response.json([upstreamPullRequest]);
    };

    const [associated] = await fetchGitHubAssociatedPullRequests({
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: contribute through a fork",
      repository: forkRepository.full_name,
      repositoryId: String(forkRepository.id),
      sha: commitSha,
    });
    expect(associated?.repository.id).toBe("123");
    expect(associated?.repository.ownerLogin).toBe("example-org");
    expect(associated?.repository.visibility).toBe("public");
    expect(associated?.headRepository?.id).toBe("456");
    expect(associated?.headRepository?.ownerLogin).toBe("f0rr0");
  });

  test("unions associated PR visibility across both tracked identities", async () => {
    const commitSha = "8".repeat(40);
    env.GITHUB_F0RR0_TOKEN = "f0-token";
    env.GITHUB_YUPPIESTECHDEV_TOKEN = "yuppies-token";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json(calls === 1 ? [] : [pullRequest]);
    };

    const associated = await fetchGitHubAssociatedPullRequests({
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: visible through the second identity",
      repository: repository.full_name,
      repositoryId: String(repository.id),
      sha: commitSha,
    });
    expect(calls).toBe(2);
    expect(associated.map(({ nodeId }) => nodeId)).toEqual([
      pullRequest.node_id,
    ]);
  });

  test("discovers associated tracked pull requests and reconciles membership", async () => {
    const commitSha = "a".repeat(40);
    const requestedPaths = [];
    env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      requestedPaths.push(url.pathname);
      if (url.pathname.endsWith(`/commits/${commitSha}/pulls`)) {
        return Response.json([pullRequest]);
      }
      if (url.pathname.endsWith("/pulls/7")) {
        return Response.json(pullRequest);
      }
      if (url.pathname.endsWith("/pulls/7/commits")) {
        return Response.json(memberShas.map((sha) => ({ sha })));
      }
      return Response.json({ message: "not found" }, { status: 404 });
    };

    const associated = await fetchGitHubAssociatedPullRequests({
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: build the worker",
      repository: "example-org/example-repo",
      repositoryId: "123",
      sha: commitSha,
    });
    expect(associated).toHaveLength(1);
    expect(associated[0]?.id).toBe("700");
    expect(associated[0]?.title).toBe("Build a durable activity worker");

    const source = await fetchGitHubPullRequestSource({
      account: "f0rr0",
      number: 7,
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual(memberShas);
    expect(source.membershipComplete).toBe(true);
    expect(source.pullRequest.headSha).toBe(headSha);
    expect(requestedPaths).toEqual([
      `/repos/${repository.full_name}/commits/${commitSha}/pulls`,
      `/repos/${repository.full_name}/pulls/7`,
      `/repos/${repository.full_name}/pulls/7/commits`,
    ]);
  });

  test("fully paginates GraphQL membership beyond the REST cap", async () => {
    env.GITHUB_F0RR0_TOKEN = "test-token";
    const graphQlCursors = [];
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname.endsWith("/pulls/7")) {
        return Response.json({ ...pullRequest, commits: 3051 });
      }
      if (url.pathname.endsWith("/pulls/7/commits")) {
        const page = Number(url.searchParams.get("page") ?? "1");
        const shas = Array.from({ length: page < 3 ? 100 : 50 }, (_, index) =>
          (BigInt(page * 100 + index) + 1n).toString(16).padStart(40, "0")
        );
        return Response.json(
          shas.map((sha) => ({ sha })),
          {
            headers:
              page < 3
                ? {
                    link: `<https://api.github.com/repos/example-org/example-repo/pulls/7/commits?per_page=100&page=${String(page + 1)}>; rel="next"`,
                  }
                : undefined,
          }
        );
      }
      if (url.pathname === "/graphql") {
        expect(init?.method).toBe("POST");
        const request = JSON.parse(init?.body);
        const { cursor } = request.variables;
        graphQlCursors.push(cursor);
        const page = cursor === null ? 0 : Number(cursor.slice(7));
        const count = page < 30 ? 100 : 51;
        const nodes = Array.from({ length: count }, (_, index) => ({
          commit: {
            ...(page === 0 && index === 0
              ? {
                  author: { user: { login: "f0rr0" } },
                  committedDate: "2026-08-02T12:00:00Z",
                  message: "feat: GraphQL membership",
                }
              : {}),
            oid: (BigInt(page * 100 + index) + 10_000n)
              .toString(16)
              .padStart(40, "0"),
          },
        }));
        if (page === 30) {
          nodes.at(-1).commit.oid = headSha;
        }
        return Response.json({
          data: {
            repository: {
              pullRequest: {
                commits: {
                  nodes,
                  pageInfo: {
                    endCursor: page < 30 ? `cursor-${String(page + 1)}` : null,
                    hasNextPage: page < 30,
                  },
                  totalCount: 3051,
                },
              },
            },
          },
        });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    };

    const source = await fetchGitHubPullRequestSource({
      account: "f0rr0",
      number: 7,
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toHaveLength(3051);
    expect(source.membershipComplete).toBe(true);
    expect(source.commits[0]?.committedAt).toBe("2026-08-02T12:00:00.000Z");
    expect(graphQlCursors).toHaveLength(31);
    expect(graphQlCursors.at(0)).toBeNull();
    expect(graphQlCursors.at(-1)).toBe("cursor-30");
  });
});

describe("GitHub activity provider deadlines", () => {
  test("propagates one absolute deadline through every worker acquisition path", async () => {
    env.GITHUB_F0RR0_TOKEN = "test-token";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({});
    };
    const deadlineAt = Date.now() - 1;
    const commit = {
      author: "f0rr0",
      committedAt: "2026-08-28T12:00:00.000Z",
      message: "feat: enforce the worker deadline",
      repository: "example-org/example-repo",
      repositoryId: "123",
      sha: "2".repeat(40),
    };
    const pullRequest = {
      account: "f0rr0",
      number: 7,
      repository: "example-org/example-repo",
      repositoryId: "123",
    };
    const observation = {
      account: "f0rr0",
      afterSha: "2".repeat(40),
      beforeSha: "1".repeat(40),
      expectedCommitCount: 1,
      historySinceAt: new Date("2026-08-01T00:00:00.000Z"),
      historyUntilAt: null,
      knownShas: ["2".repeat(40)],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    };

    const callsWithDeadline = [
      async () => await fetchGitHubActivityCommitSource(commit, { deadlineAt }),
      async () =>
        await fetchGitHubPushObservationSource(observation, { deadlineAt }),
      async () =>
        await fetchGitHubAssociatedPullRequests(commit, { deadlineAt }),
      async () =>
        await fetchGitHubPullRequestSnapshot(pullRequest, { deadlineAt }),
      async () =>
        await fetchGitHubPullRequestMembershipWithToken(
          pullRequest,
          1,
          "test-token",
          { deadlineAt }
        ),
      async () =>
        await fetchGitHubPullRequestSource(pullRequest, { deadlineAt }),
    ];
    for (const call of callsWithDeadline) {
      await expect(call()).rejects.toBeInstanceOf(GitHubRequestDeadlineError);
    }
    expect(calls).toBe(0);
  });
});
