import { afterEach, describe, expect, test } from "bun:test";

import { fetchGitHubActivityCommitSource } from "../src/lib/github-activity-processor.ts";

const originalFetch = globalThis.fetch;
const originalF0rr0Token = process.env.GITHUB_F0RR0_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalF0rr0Token === undefined) {
    delete process.env.GITHUB_F0RR0_TOKEN;
  } else {
    process.env.GITHUB_F0RR0_TOKEN = originalF0rr0Token;
  }
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
        author: { login: "f0rr0" },
        commit: {
          author: { date: "2026-08-28T12:00:00Z" },
          message: "feat: process a very large commit",
        },
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
    expect(source.commit.files[0]?.filename).toBe("A.ts");
    expect(source.commit.files.at(-2)?.filename).toBe("z.ts");
    expect(source.commit.files.at(-1)?.filename).toBe("é.ts");
  });
});
