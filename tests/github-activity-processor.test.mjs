import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  fetchGitHubActivityCommitSource,
  fetchGitHubAssociatedPullRequests,
  fetchGitHubPullRequestSource,
  fetchGitHubPushObservationSource,
} from "../src/lib/github-activity-processor.ts";

const originalFetch = globalThis.fetch;
const originalF0rr0Token = process.env.GITHUB_F0RR0_TOKEN;
const originalYuppiesTechDevToken = process.env.GITHUB_YUPPIESTECHDEV_TOKEN;
const originalDefaultToken = process.env.GITHUB_TOKEN;

const pushCommitValue = (sha, login, id) => ({
  author: { id, login },
  commit: {
    author: { date: "2026-08-28T12:00:00Z" },
    message: `feat: ${login} change`,
  },
  html_url: `https://github.com/example-org/example-repo/commit/${sha}`,
  sha,
});

const restoreEnvironmentValue = (name, value) => {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
};

beforeEach(() => {
  delete process.env.GITHUB_F0RR0_TOKEN;
  delete process.env.GITHUB_YUPPIESTECHDEV_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironmentValue("GITHUB_F0RR0_TOKEN", originalF0rr0Token);
  restoreEnvironmentValue(
    "GITHUB_YUPPIESTECHDEV_TOKEN",
    originalYuppiesTechDevToken
  );
  restoreEnvironmentValue("GITHUB_TOKEN", originalDefaultToken);
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

    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async () => Response.json({ ahead_by: 0, commits: [] });

    const source = await fetchGitHubPushObservationSource({
      account: "f0rr0",
      afterSha,
      beforeSha,
      expectedCommitCount: null,
      knownShas: [],
      observedAt: new Date("2026-08-28T12:34:00.000Z"),
      refName: "refs/heads/main",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source).toEqual({ commitShas: [], commits: [] });
  });

  test("falls back to full reachable history when a force-push base is gone", async () => {
    const beforeSha = "1".repeat(40);
    const olderSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    const paths = [];
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      paths.push(url.pathname);
      if (url.pathname.includes("/compare/")) {
        return new Response(null, { status: 404 });
      }
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [
                  {
                    author: { user: { login: "f0rr0" } },
                    authoredDate: "2026-08-28T12:00:00Z",
                    message: "head",
                    oid: afterSha,
                    url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                  },
                  {
                    author: { user: { login: "octocat" } },
                    authoredDate: "2026-08-28T11:00:00Z",
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
  });

  test("bounds a new branch by the observed count without slicing history", async () => {
    const olderSha = "1".repeat(40);
    const afterSha = "2".repeat(40);
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      expect(url.pathname).toBe("/graphql");
      expect(init?.method).toBe("POST");
      const request = JSON.parse(init?.body);
      expect(request.variables.pageSize).toBe(2);
      return Response.json({
        data: {
          repository: {
            object: {
              history: {
                nodes: [
                  {
                    author: { user: { login: "f0rr0" } },
                    authoredDate: "2026-08-28T12:00:00Z",
                    message: "head",
                    oid: afterSha,
                    url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                  },
                  {
                    author: { user: { login: "octocat" } },
                    authoredDate: "2026-08-28T11:00:00Z",
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
      knownShas: [olderSha, afterSha],
      observedAt: new Date("2026-08-28T12:00:00.000Z"),
      refName: "refs/heads/new",
      repository: "example-org/example-repo",
      repositoryId: "123",
    });
    expect(source.commitShas).toEqual([olderSha, afterSha]);
    expect(source.commits.map(({ sha }) => sha)).toEqual([afterSha]);
  });

  test("walks complete new-ref history when the event has no commit count", async () => {
    const olderSha = "1".repeat(40);
    const middleSha = "2".repeat(40);
    const afterSha = "3".repeat(40);
    const cursors = [];
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
    globalThis.fetch = async (_input, init) => {
      const request = JSON.parse(init?.body);
      cursors.push(request.variables.cursor);
      expect(request.variables.pageSize).toBe(100);
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
                        message: "head",
                        oid: afterSha,
                        url: `https://github.com/example-org/example-repo/commit/${afterSha}`,
                      },
                      {
                        author: { user: { login: "f0rr0" } },
                        authoredDate: "2026-08-28T11:00:00Z",
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
  const headSha = "d".repeat(40);
  const baseSha = "e".repeat(40);
  const memberShas = ["f".repeat(40), "1".repeat(40)];
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
    merge_commit_sha: null,
    merged: false,
    merged_at: null,
    node_id: "PR_node_700",
    number: 7,
    state: "open",
    title: "Build a durable activity worker",
    updated_at: "2026-08-28T10:00:00Z",
    user: { id: 900, login: "other-maintainer" },
  };

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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "f0-token";
    process.env.GITHUB_YUPPIESTECHDEV_TOKEN = "yuppies-token";
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
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
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

  test("falls back to GraphQL for pull requests beyond the REST cap", async () => {
    process.env.GITHUB_F0RR0_TOKEN = "test-token";
    const graphQlCursors = [];
    globalThis.fetch = async (input, init) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      if (url.pathname.endsWith("/pulls/7")) {
        return Response.json({ ...pullRequest, commits: 251 });
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
        const count = page < 2 ? 100 : 51;
        const nodes = Array.from({ length: count }, (_, index) => ({
          commit: {
            oid: (BigInt(page * 100 + index) + 10_000n)
              .toString(16)
              .padStart(40, "0"),
          },
        }));
        return Response.json({
          data: {
            repository: {
              pullRequest: {
                commits: {
                  nodes,
                  pageInfo: {
                    endCursor: page < 2 ? `cursor-${String(page + 1)}` : null,
                    hasNextPage: page < 2,
                  },
                  totalCount: 251,
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
    expect(source.commitShas).toHaveLength(251);
    expect(source.membershipComplete).toBe(true);
    expect(graphQlCursors).toEqual([null, "cursor-1", "cursor-2"]);
  });
});
