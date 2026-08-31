import { afterEach, describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  fetchGitHub,
  GitHubRequestDeadlineError,
  GitHubResponseError,
  githubApiUrl,
} from "../src/lib/github-api.ts";
import {
  authenticatedGitHubAccountFrom,
  commitFromGitHub,
  githubDeliveryIdFrom,
  githubEventFrom,
  issueActionFromWebhook,
  issueFromGitHub,
  issueFromWebhook,
  pullRequestFromGitHub,
  pullRequestFromWebhook,
  pullRequestObservationFromWebhook,
  pushFromWebhook,
  repositoryFactsFrom,
  repositoryFrom,
} from "../src/lib/github-commits-core.ts";
import { isGitHubAccountPaused } from "../src/lib/github-commits-store.ts";
import {
  assertGitHubTokenIdentity,
  collectGitHubEvents,
} from "../src/lib/github-commits.ts";

const originalFetch = globalThis.fetch;
const accountEvent = (id) => ({
  actor: { login: "f0rr0" },
  created_at: "2026-08-26T12:01:00Z",
  id,
  type: "WatchEvent",
});
const githubEventResponse = (events) =>
  Response.json(events, { headers: { "X-Poll-Interval": "60" } });

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sha = "a".repeat(40);
const before = "b".repeat(40);
const repository = {
  full_name: "another-org/private-repo",
  id: 123,
  private: true,
};

const apiCommit = {
  author: { login: "yuppiestechdev" },
  commit: {
    author: { date: "2026-08-26T12:00:00Z" },
    message: "feat: persist one commit\n\nLonger body",
  },
  html_url: `https://github.com/another-org/private-repo/commit/${sha}`,
  sha,
};
const pullRequest = {
  additions: 120,
  base: { ref: "main", repo: repository, sha: before },
  body: "Adds durable intake.\n\nNo hydration in the webhook.",
  closed_at: null,
  changed_files: 7,
  commits: 3,
  created_at: "2026-08-26T11:00:00Z",
  draft: false,
  deletions: 35,
  head: { ref: "durable-intake", repo: repository, sha },
  html_url: "https://github.com/another-org/private-repo/pull/42",
  id: 987,
  merge_commit_sha: null,
  merged: false,
  merged_at: null,
  node_id: "PR_kwDOExample",
  number: 42,
  state: "open",
  title: "Persist webhook facts exactly",
  updated_at: "2026-08-26T12:02:00Z",
  user: { id: 456, login: "f0rr0" },
};
const sparsePullRequest = {
  base: {
    ref: "main",
    repo: {
      id: 123,
      name: "private-repo",
      url: "https://api.github.com/repos/another-org/private-repo",
    },
    sha: before,
  },
  head: {
    ref: "durable-intake",
    repo: {
      id: 123,
      name: "private-repo",
      url: "https://api.github.com/repos/another-org/private-repo",
    },
    sha,
  },
  id: 987,
  number: 42,
  url: "https://api.github.com/repos/another-org/private-repo/pulls/42",
};
const sparsePullRequestEventFrom = (pullRequestValue, overrides = {}) =>
  githubEventFrom(
    {
      actor: { login: "f0rr0" },
      created_at: "2026-08-26T12:03:00Z",
      id: "123456798",
      payload: {
        action: "merged",
        number: 42,
        pull_request: pullRequestValue,
        ...overrides,
      },
      repo: { id: 123, name: "another-org/private-repo" },
      type: "PullRequestEvent",
    },
    "f0rr0"
  );
const issue = {
  created_at: "2026-08-26T10:00:00Z",
  html_url: "https://github.com/another-org/private-repo/issues/91",
  id: 654,
  node_id: "I_kwDOExample",
  number: 91,
  title: "Make event intake durable",
  user: { id: 456, login: "f0rr0" },
};
const webhookRepository = {
  ...repository,
  full_name: "another-org/private-repo",
  html_url: "https://github.com/another-org/private-repo",
  owner: {
    avatar_url: "https://avatars.githubusercontent.com/u/321?v=4",
    id: 321,
    login: "another-org",
    type: "Organization",
  },
  visibility: "private",
};

describe("GitHub commit normalization", () => {
  test("accepts an accessible repository regardless of owner or visibility", () => {
    expect(repositoryFrom(repository)).toEqual({
      fullName: "another-org/private-repo",
      id: "123",
    });
    expect(repositoryFrom({ id: 456, name: "f0rr0/public-repo" })).toEqual({
      fullName: "f0rr0/public-repo",
      id: "456",
    });
  });

  test("admits a commit based on its GitHub author", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(commitFromGitHub(apiCommit, normalizedRepository)).toEqual({
      author: "yuppiestechdev",
      committedAt: "2026-08-26T12:00:00.000Z",
      message: "feat: persist one commit",
      repository: "another-org/private-repo",
      repositoryId: "123",
      sha,
      url: apiCommit.html_url,
    });
  });

  test("uses committer time for activity ordering", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    const commit = commitFromGitHub(
      {
        ...apiCommit,
        commit: {
          ...apiCommit.commit,
          committer: { date: "2026-08-27T09:30:00Z" },
        },
      },
      normalizedRepository
    );
    expect(commit?.committedAt).toBe("2026-08-27T09:30:00.000Z");
  });

  test("accepts Git's valid empty commit message", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      commitFromGitHub(
        { ...apiCommit, commit: { ...apiCommit.commit, message: "" } },
        normalizedRepository
      )?.message
    ).toBe("");
  });

  test("excludes commits with null or foreign GitHub authors", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      commitFromGitHub({ ...apiCommit, author: null }, normalizedRepository)
    ).toBeNull();
    expect(
      commitFromGitHub(
        { ...apiCommit, author: { login: "somebody-else" } },
        normalizedRepository
      )
    ).toBeNull();
  });

  test("rejects malformed commit data and forged URLs", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(() =>
      commitFromGitHub(
        { ...apiCommit, html_url: "https://example.com/commit/a" },
        normalizedRepository
      )
    ).toThrow("invalid commit response");
    expect(() =>
      commitFromGitHub(
        {
          ...apiCommit,
          author: { login: "somebody-else" },
          html_url: "https://example.com/commit/a",
        },
        normalizedRepository
      )
    ).toThrow("invalid commit response");
  });
});

describe("authenticated user events", () => {
  test("extracts a private PushEvent for the authenticated actor", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:01:00Z",
          id: "123456789",
          payload: {
            before,
            commits: [{ message: "commit", sha }],
            head: sha,
            ref: "refs/heads/feature",
            size: 1,
          },
          public: false,
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PushEvent",
        },
        "f0rr0"
      )
    ).toEqual({
      id: "123456789",
      issue: null,
      occurredAt: "2026-08-26T12:01:00.000Z",
      pullRequest: null,
      push: {
        before,
        commitShas: [sha],
        head: sha,
        pushedBy: "f0rr0",
        ref: "refs/heads/feature",
        repository: {
          fullName: "another-org/private-repo",
          id: "123",
        },
        size: 1,
      },
    });
  });

  test("checkpoints non-push events without trying to process them", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "yuppiestechdev" },
          created_at: "2026-08-26T12:01:00Z",
          id: "123456790",
          type: "WatchEvent",
        },
        "yuppiestechdev"
      )
    ).toEqual({
      id: "123456790",
      issue: null,
      occurredAt: "2026-08-26T12:01:00.000Z",
      pullRequest: null,
      push: null,
    });
  });

  test("marks a compact PushEvent for API expansion when size is absent", () => {
    const event = githubEventFrom(
      {
        actor: { login: "f0rr0" },
        created_at: "2026-08-26T12:01:00Z",
        id: "123456791",
        payload: {
          before,
          head: sha,
          ref: "refs/heads/main",
        },
        repo: { id: 123, name: "another-org/private-repo" },
        type: "PushEvent",
      },
      "f0rr0"
    );
    expect(event?.push?.size).toBeNull();
    expect(event?.push?.commitShas).toEqual([]);
  });

  test("checkpoints tag pushes without treating them as new commits", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:01:00Z",
          id: "123456792",
          payload: {
            before: "0".repeat(40),
            commits: [],
            head: sha,
            ref: "refs/tags/v1.0.0",
            size: 0,
          },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PushEvent",
        },
        "f0rr0"
      )
    ).toEqual({
      id: "123456792",
      issue: null,
      occurredAt: "2026-08-26T12:01:00.000Z",
      pullRequest: null,
      push: null,
    });
  });

  test("normalizes only opened issues authored by the authenticated account", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T10:00:01Z",
          id: "123456794",
          org: {
            avatar_url: "https://avatars.githubusercontent.com/u/123?v=4",
            id: 123,
            login: "another-org",
          },
          payload: { action: "opened", issue },
          public: true,
          repo: { id: 123, name: "another-org/private-repo" },
          type: "IssuesEvent",
        },
        "f0rr0"
      )
    ).toMatchObject({
      id: "123456794",
      issue: {
        account: "f0rr0",
        authorUserId: "456",
        createdAt: "2026-08-26T10:00:00.000Z",
        nodeId: "I_kwDOExample",
        number: 91,
        repository: {
          fullName: "another-org/private-repo",
          id: "123",
          ownerAvatarUrl: "https://avatars.githubusercontent.com/u/123?v=4",
          ownerLogin: "another-org",
          ownerType: "Organization",
          visibility: "public",
        },
      },
      pullRequest: null,
      push: null,
    });

    const foreign = {
      ...issue,
      user: { id: 999, login: "somebody-else" },
    };
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T10:00:01Z",
          id: "123456795",
          payload: { action: "opened", issue: foreign },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "IssuesEvent",
        },
        "f0rr0"
      )?.issue
    ).toBeNull();
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T10:00:01Z",
          id: "123456796",
          payload: {
            action: "opened",
            issue: { ...issue, html_url: "https://example.com/issues/91" },
          },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "IssuesEvent",
        },
        "f0rr0"
      )
    ).toBeNull();
  });

  test("rejects an event returned for a different actor", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "someone" },
          created_at: "2026-08-26T12:01:00Z",
          id: "123",
          type: "WatchEvent",
        },
        "f0rr0"
      )
    ).toBeNull();
  });
});

describe("push webhook routing", () => {
  test("uses the push actor only to discover commit references", () => {
    expect(
      pushFromWebhook({
        after: sha,
        before,
        commits: [
          {
            id: sha,
            message: "fix: private dependency\n\nbody",
            timestamp: "2026-08-26T12:00:00Z",
          },
        ],
        deleted: false,
        ref: "refs/heads/feature",
        repository,
        sender: { login: "yuppiestechdev" },
      })
    ).toEqual({
      before,
      commitShas: [sha],
      head: sha,
      pushedBy: "yuppiestechdev",
      ref: "refs/heads/feature",
      repository: {
        fullName: "another-org/private-repo",
        id: "123",
      },
      size: 1,
    });
  });

  test("ignores pushes by other accounts and deleted refs", () => {
    const payload = {
      after: sha,
      before,
      commits: [],
      deleted: false,
      ref: "refs/heads/main",
      repository,
      sender: { login: "someone" },
    };
    expect(pushFromWebhook(payload)).toBeNull();
    expect(
      pushFromWebhook({
        ...payload,
        pusher: { name: "f0rr0" },
      })
    ).toBeNull();
    expect(
      pushFromWebhook({
        ...payload,
        deleted: true,
        sender: { login: "f0rr0" },
      })
    ).toBeNull();
    expect(
      pushFromWebhook({
        ...payload,
        ref: "refs/tags/v1.0.0",
        sender: { login: "f0rr0" },
      })
    ).toBeNull();
    expect(
      pushFromWebhook({
        ...payload,
        commits: [{ id: sha }],
        sender: { login: "f0rr0" },
        size: 0,
      })
    ).toBeNull();
  });

  test("expands a webhook payload at GitHub's commit-array limit", () => {
    const commits = Array.from({ length: 2048 }, (_, index) => ({
      id: index.toString(16).padStart(40, "0"),
      message: `commit ${index}`,
      timestamp: "2026-08-26T12:00:00Z",
    }));
    const push = pushFromWebhook({
      after: sha,
      before,
      commits,
      deleted: false,
      ref: "refs/heads/main",
      repository,
      sender: { login: "f0rr0" },
    });

    expect(push?.commitShas).toHaveLength(2048);
    expect(push?.size).toBeNull();
  });
});

describe("issue observation normalization", () => {
  test("reuses safe webhook repository identity and presentation facts", () => {
    expect(repositoryFactsFrom(webhookRepository)).toEqual({
      fullName: "another-org/private-repo",
      htmlUrl: "https://github.com/another-org/private-repo",
      id: "123",
      ownerAvatarUrl: "https://avatars.githubusercontent.com/u/321?v=4",
      ownerId: "321",
      ownerLogin: "another-org",
      ownerType: "Organization",
      visibility: "private",
    });
    expect(
      repositoryFactsFrom({
        ...webhookRepository,
        private: false,
        visibility: "private",
      })
    ).toBeNull();
  });

  test("preserves the immutable issue-creation snapshot", () => {
    const facts = repositoryFactsFrom(webhookRepository);
    expect(facts).not.toBeNull();
    expect(issueFromGitHub(issue, facts)).toEqual({
      account: "f0rr0",
      authorLogin: "f0rr0",
      authorUserId: "456",
      createdAt: "2026-08-26T10:00:00.000Z",
      nodeId: "I_kwDOExample",
      number: 91,
      repository: facts,
      title: "Make event intake durable",
      url: "https://github.com/another-org/private-repo/issues/91",
    });
    expect(
      issueFromGitHub(
        { ...issue, user: { id: 999, login: "somebody-else" } },
        facts
      )
    ).toBeNull();
    expect(issueFromGitHub({ ...issue, pull_request: {} }, facts)).toBeNull();
    expect(
      issueFromGitHub({ ...issue, html_url: "https://example.com/91" }, facts)
    ).toBeNull();
  });

  test("accepts only an opened issues webhook and attributes the author", () => {
    expect(
      issueFromWebhook({
        action: "opened",
        issue,
        repository: webhookRepository,
        sender: { login: "somebody-else" },
      })
    ).toMatchObject({ account: "f0rr0", nodeId: "I_kwDOExample" });
    expect(
      issueFromWebhook({
        action: "edited",
        issue,
        repository: webhookRepository,
      })
    ).toBeNull();
    expect(
      issueFromWebhook({
        action: "opened",
        issue: { ...issue, user: { id: 999, login: "somebody-else" } },
        repository: webhookRepository,
      })
    ).toBeNull();
    expect(issueActionFromWebhook({ action: "Opened" })).toBe("opened");
    expect(issueActionFromWebhook({ action: "not valid" })).toBeNull();
  });
});

describe("pull request observation normalization", () => {
  test("preserves authored PR facts and provider timestamps", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      pullRequestFromGitHub(pullRequest, normalizedRepository, "synchronize")
    ).toEqual({
      action: "synchronize",
      additions: 120,
      author: "f0rr0",
      authorAccount: "f0rr0",
      authorUserId: "456",
      baseRef: "main",
      baseRepository: {
        fullName: "another-org/private-repo",
        htmlUrl: null,
        id: "123",
        ownerAvatarUrl: null,
        ownerId: null,
        ownerLogin: "another-org",
        ownerType: null,
        visibility: "private",
      },
      baseSha: before,
      body: pullRequest.body,
      changedFiles: 7,
      closedAt: null,
      commitCount: 3,
      createdAt: "2026-08-26T11:00:00.000Z",
      draft: false,
      deletions: 35,
      headRef: "durable-intake",
      headRepository: {
        fullName: "another-org/private-repo",
        htmlUrl: null,
        id: "123",
        ownerAvatarUrl: null,
        ownerId: null,
        ownerLogin: "another-org",
        ownerType: null,
        visibility: "private",
      },
      headSha: sha,
      id: "987",
      mergeCommitSha: null,
      merged: false,
      mergedAt: null,
      nodeId: "PR_kwDOExample",
      number: 42,
      providerUpdatedAt: "2026-08-26T12:02:00.000Z",
      repository: {
        fullName: "another-org/private-repo",
        htmlUrl: null,
        id: "123",
        ownerAvatarUrl: null,
        ownerId: null,
        ownerLogin: "another-org",
        ownerType: null,
        visibility: "private",
      },
      state: "open",
      title: "Persist webhook facts exactly",
      url: pullRequest.html_url,
    });
  });

  test("accepts the REST 2026 merged PR shape with merge_commit_sha absent", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    const {
      merge_commit_sha: _removedLegacyMergeSha,
      ...rest2026MergedPullRequest
    } = {
      ...pullRequest,
      closed_at: "2026-08-26T13:00:00Z",
      merged: true,
      merged_at: "2026-08-26T13:00:00Z",
      state: "closed",
      updated_at: "2026-08-26T13:00:00Z",
    };
    expect(Object.hasOwn(rest2026MergedPullRequest, "merge_commit_sha")).toBe(
      false
    );

    const normalized = pullRequestFromGitHub(
      rest2026MergedPullRequest,
      normalizedRepository
    );
    expect(normalized).not.toBeNull();
    expect(normalized?.merged).toBe(true);
    expect(normalized?.mergeCommitSha).toBeUndefined();
  });

  test("discards the synthetic REST test merge SHA while a PR is open", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      pullRequestFromGitHub(
        { ...pullRequest, merge_commit_sha: "c".repeat(40) },
        normalizedRepository
      )
    ).toMatchObject({ mergeCommitSha: null, merged: false, state: "open" });
  });

  test("rejects a malformed merge SHA when a PR is merged", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      pullRequestFromGitHub(
        {
          ...pullRequest,
          closed_at: "2026-08-26T13:00:00Z",
          merge_commit_sha: "not-a-sha",
          merged: true,
          merged_at: "2026-08-26T13:00:00Z",
          state: "closed",
          updated_at: "2026-08-26T13:00:00Z",
        },
        normalizedRepository
      )
    ).toBeNull();
  });

  test("uses PR authorship rather than webhook sender identity", () => {
    expect(
      pullRequestFromWebhook({
        action: "closed",
        pull_request: {
          ...pullRequest,
          closed_at: "2026-08-26T13:00:00Z",
          merge_commit_sha: "c".repeat(40),
          merged: true,
          merged_at: "2026-08-26T13:00:00Z",
          state: "closed",
          updated_at: "2026-08-26T13:00:00Z",
        },
        repository,
        sender: { login: "somebody-else" },
      })
    ).toMatchObject({
      action: "closed",
      author: "f0rr0",
      mergeCommitSha: "c".repeat(40),
      merged: true,
    });
  });

  test("derives merged state when an associated-PR response omits it", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    const { merged: _merged, ...withoutMerged } = {
      ...pullRequest,
      closed_at: "2026-08-26T13:00:00Z",
      merge_commit_sha: "c".repeat(40),
      merged_at: "2026-08-26T13:00:00Z",
      state: "closed",
      updated_at: "2026-08-26T13:00:00Z",
    };
    expect(
      pullRequestFromGitHub(withoutMerged, normalizedRepository)
    ).toMatchObject({ merged: true, mergedAt: "2026-08-26T13:00:00.000Z" });
  });

  test("normalizes authenticated PullRequestEvent observations", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:03:00Z",
          id: "123456793",
          payload: { action: "opened", pull_request: pullRequest },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PullRequestEvent",
        },
        "f0rr0"
      )
    ).toMatchObject({
      id: "123456793",
      occurredAt: "2026-08-26T12:03:00.000Z",
      pullRequest: { author: "f0rr0", id: "987", number: 42 },
      push: null,
    });
  });

  test("checkpoints the sparse PullRequestEvent shape returned by the user Events API", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:03:00Z",
          id: "123456797",
          payload: {
            action: "merged",
            number: 42,
            pull_request: sparsePullRequest,
          },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PullRequestEvent",
        },
        "f0rr0"
      )
    ).toEqual({
      id: "123456797",
      issue: null,
      occurredAt: "2026-08-26T12:03:00.000Z",
      pullRequest: null,
      pullRequestSignal: {
        action: "merged",
        number: 42,
        repository: {
          fullName: "another-org/private-repo",
          id: "123",
        },
      },
      push: null,
    });
  });

  test("rejects malformed events that resemble sparse pull request signals", () => {
    expect(
      sparsePullRequestEventFrom({ ...sparsePullRequest, number: 41 })
    ).toBeNull();
    expect(
      sparsePullRequestEventFrom({
        ...sparsePullRequest,
        url: "https://example.com/repos/another-org/private-repo/pulls/42",
      })
    ).toBeNull();
    expect(
      sparsePullRequestEventFrom({
        ...sparsePullRequest,
        base: {
          ...sparsePullRequest.base,
          repo: { ...sparsePullRequest.base.repo, id: 999 },
        },
      })
    ).toBeNull();
    expect(
      sparsePullRequestEventFrom({ ...sparsePullRequest, head: null })
    ).toBeNull();
    expect(
      sparsePullRequestEventFrom(sparsePullRequest, { action: "not valid" })
    ).toBeNull();
    expect(
      sparsePullRequestEventFrom({
        ...sparsePullRequest,
        updated_at: "not-a-date",
        user: null,
      })
    ).toBeNull();
  });

  test("retains foreign authors but rejects malformed provider timestamps", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      pullRequestFromGitHub(
        { ...pullRequest, user: { id: 999, login: "somebody-else" } },
        normalizedRepository
      )
    ).toMatchObject({
      author: "somebody-else",
      authorAccount: null,
      authorUserId: "999",
    });
    expect(
      pullRequestFromGitHub(
        { ...pullRequest, updated_at: "not-a-date" },
        normalizedRepository
      )
    ).toBeNull();
    expect(
      pullRequestFromGitHub(
        { ...pullRequest, user: { id: 999, login: "dependabot[bot]" } },
        normalizedRepository
      )
    ).toMatchObject({ author: "dependabot[bot]", authorAccount: null });
  });

  test("does not treat a tracked webhook sender as PR provenance", () => {
    const foreignPullRequest = {
      ...pullRequest,
      user: { id: 999, login: "somebody-else" },
    };
    expect(
      pullRequestObservationFromWebhook({
        action: "synchronize",
        pull_request: foreignPullRequest,
        repository,
        sender: { login: "yuppiestechdev" },
      })
    ).toMatchObject({
      account: null,
      pullRequest: { author: "somebody-else", authorAccount: null },
    });
    expect(
      pullRequestObservationFromWebhook({
        action: "synchronize",
        pull_request: foreignPullRequest,
        repository,
        sender: { login: "untracked" },
      })
    ).toMatchObject({
      account: null,
      pullRequest: { author: "somebody-else", authorAccount: null },
    });
  });

  test("retains a foreign-authored PR event for known-only persistence", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:03:00Z",
          id: "123456794",
          payload: {
            action: "synchronize",
            pull_request: {
              ...pullRequest,
              user: { id: 999, login: "somebody-else" },
            },
          },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PullRequestEvent",
        },
        "f0rr0"
      )
    ).toMatchObject({
      id: "123456794",
      pullRequest: {
        author: "somebody-else",
        authorAccount: null,
        nodeId: "PR_kwDOExample",
      },
      push: null,
    });
  });
});

describe("GitHub delivery identity", () => {
  test("accepts only a complete delivery UUID", () => {
    expect(githubDeliveryIdFrom("A1B2C3D4-1234-5678-9ABC-1234567890AB")).toBe(
      "a1b2c3d4-1234-5678-9abc-1234567890ab"
    );
    expect(githubDeliveryIdFrom("123456789")).toBeNull();
    expect(githubDeliveryIdFrom(null)).toBeNull();
  });
});

describe("token identity", () => {
  test("recognizes only the two configured GitHub accounts", () => {
    expect(authenticatedGitHubAccountFrom({ login: "F0RR0" })).toBe("f0rr0");
    expect(authenticatedGitHubAccountFrom({ login: "yuppiestechdev" })).toBe(
      "yuppiestechdev"
    );
    expect(authenticatedGitHubAccountFrom({ login: "someone" })).toBeNull();
  });

  test("verifies the authenticated account before an inventory scan", async () => {
    globalThis.fetch = async (input, init) => {
      expect(new Request(input).url).toBe("https://api.github.com/user");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer token"
      );
      return Response.json({ login: "F0RR0" });
    };

    await expect(
      assertGitHubTokenIdentity("f0rr0", "token")
    ).resolves.toBeUndefined();
  });

  test("rejects a token authenticated as the wrong account", async () => {
    globalThis.fetch = async () => Response.json({ login: "someone-else" });

    await expect(assertGitHubTokenIdentity("f0rr0", "token")).rejects.toThrow(
      "GITHUB_F0RR0_TOKEN is not authenticated as f0rr0"
    );
  });
});

describe("account pause state", () => {
  test("skips only checkpoints explicitly marked as paused", () => {
    expect(
      isGitHubAccountPaused({ latestEventId: "123456789", paused: true })
    ).toBe(true);
    expect(
      isGitHubAccountPaused({ latestEventId: "123456789", paused: false })
    ).toBe(false);
    expect(isGitHubAccountPaused(null)).toBe(false);
  });
});

describe("bounded event collection", () => {
  test("uses cache freshness when a 304 omits the poll interval", async () => {
    globalThis.fetch = async (_input, init) => {
      expect(new Headers(init?.headers).get("if-none-match")).toBe(
        'W/"events"'
      );
      return new Response(null, {
        headers: {
          "Cache-Control": "private, max-age=300, s-maxage=300",
          etag: 'W/"events"',
        },
        status: 304,
      });
    };

    const startedAt = Date.now();
    const collected = await collectGitHubEvents(
      "f0rr0",
      "token",
      "12",
      'W/"events"'
    );
    expect(collected).toMatchObject({
      etag: 'W/"events"',
      events: [],
      gap: null,
      latestEventId: "12",
      notModified: true,
    });
    expect(collected.nextPollAt.getTime()).toBeGreaterThanOrEqual(
      startedAt + 299_000
    );
    expect(collected.nextPollAt.getTime()).toBeLessThanOrEqual(
      startedAt + 301_000
    );
  });

  test("collects a real sparse pull request event without poisoning its page", async () => {
    globalThis.fetch = async () =>
      githubEventResponse([
        {
          actor: { login: "f0rr0" },
          created_at: "2026-08-26T12:03:00Z",
          id: "13",
          payload: {
            action: "merged",
            number: 42,
            pull_request: sparsePullRequest,
          },
          repo: { id: 123, name: "another-org/private-repo" },
          type: "PullRequestEvent",
        },
        accountEvent("12"),
      ]);

    const collected = await collectGitHubEvents("f0rr0", "token", "12");
    expect(collected.latestEventId).toBe("13");
    expect(collected.events).toHaveLength(1);
    expect(collected.events[0]?.pullRequestSignal).toEqual({
      action: "merged",
      number: 42,
      repository: {
        fullName: "another-org/private-repo",
        id: "123",
      },
    });
  });

  test("stops at the saved checkpoint without replaying it", async () => {
    globalThis.fetch = async () =>
      githubEventResponse([
        accountEvent("12"),
        accountEvent("11"),
        accountEvent("10"),
        accountEvent("9"),
      ]);
    const collected = await collectGitHubEvents("f0rr0", "token", "10");
    expect(collected.latestEventId).toBe("12");
    expect(collected.events.map(({ id }) => id)).toEqual(["12", "11"]);
    expect(collected.gap).toBeNull();
  });

  test("records the bounded feed discontinuity and keeps available events", async () => {
    globalThis.fetch = async () =>
      githubEventResponse([
        accountEvent("12"),
        accountEvent("11"),
        accountEvent("9"),
      ]);
    const collected = await collectGitHubEvents("f0rr0", "token", "10");
    expect(collected.events.map(({ id }) => id)).toEqual(["12", "11", "9"]);
    expect(collected.gap).toEqual({
      expectedEventId: "10",
      oldestAvailableEventId: "9",
    });
    expect(collected.latestEventId).toBe("12");
  });

  test("rejects a missing provider poll interval", async () => {
    globalThis.fetch = async () => Response.json([accountEvent("12")]);
    expect(collectGitHubEvents("f0rr0", "token", null)).rejects.toBeInstanceOf(
      TypeError
    );
  });

  test("does not replace a malformed poll interval with cache freshness", async () => {
    globalThis.fetch = async () =>
      Response.json([accountEvent("12")], {
        headers: {
          "Cache-Control": "private, max-age=300",
          "X-Poll-Interval": "later",
        },
      });
    expect(collectGitHubEvents("f0rr0", "token", null)).rejects.toBeInstanceOf(
      TypeError
    );
  });

  test("applies the cron deadline to every Events page", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return githubEventResponse([]);
    };

    await expect(
      collectGitHubEvents("f0rr0", "token", null, null, {
        deadlineAt: Date.now() - 1,
      })
    ).rejects.toBeInstanceOf(GitHubRequestDeadlineError);
    expect(calls).toBe(0);
  });
});

describe("GitHub request deferral", () => {
  test("fails before a provider call when its absolute deadline has passed", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({});
    };

    await expect(
      fetchGitHub(githubApiUrl("/user"), {
        deadlineAt: Date.now() - 1,
        token: "token",
      })
    ).rejects.toBeInstanceOf(GitHubRequestDeadlineError);
    expect(calls).toBe(0);
  });

  test("aborts an in-flight provider call at its absolute deadline", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      await delay(60_000, undefined, { signal: init.signal });
      return Response.json({});
    };

    const startedAt = Date.now();
    await expect(
      fetchGitHub(githubApiUrl("/user"), {
        deadlineAt: startedAt + 50,
        token: "token",
      })
    ).rejects.toBeInstanceOf(GitHubRequestDeadlineError);
    expect(calls).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  test("does not immediately retry a rate-limited request", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("rate limited", {
        headers: { "Retry-After": "60" },
        status: 429,
      });
    };

    const startedAt = Date.now();
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubResponseError);
    expect(caught).toMatchObject({ retryable: true, status: 429 });
    expect(caught.retryAt.getTime()).toBeGreaterThanOrEqual(startedAt + 59_000);
    expect(calls).toBe(1);
  });

  test("classifies exhausted-primary-limit 403 responses as retryable", async () => {
    globalThis.fetch = async () =>
      new Response("rate limited", {
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "2000000000",
        },
        status: 403,
      });
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubResponseError);
    expect(caught).toMatchObject({ retryable: true, status: 403 });
    expect(caught.retryAt.toISOString()).toBe("2033-05-18T03:33:20.000Z");
  });

  test("defers a headerless secondary-limit response for at least one minute", async () => {
    globalThis.fetch = async () =>
      Response.json(
        {
          documentation_url:
            "https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits",
          message: "You have exceeded a secondary rate limit.",
        },
        { status: 403 }
      );
    const startedAt = Date.now();
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubResponseError);
    expect(caught).toMatchObject({ retryable: true, status: 403 });
    expect(caught.retryAt.getTime()).toBeGreaterThanOrEqual(startedAt + 59_000);
  });

  test("keeps a real permission 403 terminal", async () => {
    globalThis.fetch = async () =>
      Response.json(
        {
          documentation_url:
            "https://docs.github.com/rest/repos/repos#get-a-repository",
          message: "Resource not accessible by personal access token",
        },
        { status: 403 }
      );
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubResponseError);
    expect(caught).toMatchObject({
      retryAt: null,
      retryable: false,
      status: 403,
    });
  });

  test("fails closed when a 403 error body exceeds the inspection bound", async () => {
    globalThis.fetch = async () =>
      Response.json(
        { message: `${"x".repeat(17_000)} secondary rate limit` },
        { status: 403 }
      );
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      retryAt: null,
      retryable: false,
      status: 403,
    });
  });

  test("gives a headerless 429 a usable retry time", async () => {
    globalThis.fetch = async () =>
      Response.json({ message: "Too many requests" }, { status: 429 });
    const startedAt = Date.now();
    let caught;
    try {
      await fetchGitHub(githubApiUrl("/user"), { token: "token" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ retryable: true, status: 429 });
    expect(caught.retryAt.getTime()).toBeGreaterThanOrEqual(startedAt + 59_000);
  });

  test("allows authenticated GraphQL query POSTs", async () => {
    let requestInit;
    globalThis.fetch = async (_input, init) => {
      requestInit = init;
      return Response.json({ data: {} });
    };
    const body = JSON.stringify({ query: "query { viewer { login } }" });
    await fetchGitHub(githubApiUrl("/graphql"), {
      body,
      method: "POST",
      token: "token",
    });
    expect(requestInit.method).toBe("POST");
    expect(requestInit.body).toBe(body);
    expect(requestInit.headers["Content-Type"]).toBe("application/json");
  });
});
