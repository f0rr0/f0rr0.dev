import { describe, expect, test } from "bun:test";

import {
  authenticatedGitHubAccountFrom,
  commitFromGitHub,
  githubEventFrom,
  pushFromWebhook,
  repositoryFrom,
} from "../src/lib/github-commits-core.ts";

const sha = "a".repeat(40);
const before = "b".repeat(40);
const repository = {
  full_name: "another-org/private-repo",
  id: 123,
  private: true,
};

const apiCommit = {
  author: { login: "somebody-else" },
  commit: {
    author: { date: "2026-08-26T12:00:00Z" },
    message: "feat: persist one commit\n\nLonger body",
  },
  html_url: `https://github.com/another-org/private-repo/commit/${sha}`,
  sha,
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

  test("stores a commit based on who pushed it, not who authored it", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(commitFromGitHub(apiCommit, normalizedRepository, "f0rr0")).toEqual({
      committedAt: "2026-08-26T12:00:00.000Z",
      message: "feat: persist one commit",
      pushedBy: "f0rr0",
      repository: "another-org/private-repo",
      repositoryId: "123",
      sha,
      url: apiCommit.html_url,
    });
  });

  test("rejects malformed commit data and forged URLs", () => {
    const normalizedRepository = repositoryFrom(repository);
    expect(normalizedRepository).not.toBeNull();
    expect(
      commitFromGitHub(
        { ...apiCommit, html_url: "https://example.com/commit/a" },
        normalizedRepository,
        "f0rr0"
      )
    ).toBeNull();
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
      push: {
        before,
        commits: [{ commit: null, sha }],
        head: sha,
        pushedBy: "f0rr0",
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
          id: "123456790",
          type: "PullRequestEvent",
        },
        "yuppiestechdev"
      )
    ).toEqual({ id: "123456790", push: null });
  });

  test("marks a compact PushEvent for API expansion when size is absent", () => {
    const event = githubEventFrom(
      {
        actor: { login: "f0rr0" },
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
    expect(event?.push?.commits).toEqual([]);
  });

  test("checkpoints tag pushes without treating them as new commits", () => {
    expect(
      githubEventFrom(
        {
          actor: { login: "f0rr0" },
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
    ).toEqual({ id: "123456792", push: null });
  });

  test("rejects an event returned for a different actor", () => {
    expect(
      githubEventFrom(
        { actor: { login: "someone" }, id: "123", type: "WatchEvent" },
        "f0rr0"
      )
    ).toBeNull();
  });
});

describe("push webhook routing", () => {
  test("accepts any branch when a tracked account performed the push", () => {
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
      commits: [
        {
          commit: {
            committedAt: "2026-08-26T12:00:00.000Z",
            message: "fix: private dependency",
            pushedBy: "yuppiestechdev",
            repository: "another-org/private-repo",
            repositoryId: "123",
            sha,
            url: `https://github.com/another-org/private-repo/commit/${sha}`,
          },
          sha,
        },
      ],
      head: sha,
      pushedBy: "yuppiestechdev",
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

    expect(push?.commits).toHaveLength(2048);
    expect(push?.size).toBeNull();
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
});
