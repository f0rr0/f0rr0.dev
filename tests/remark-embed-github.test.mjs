import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";

import {
  githubTransformer,
  parseGitHubUrl,
} from "../src/lib/remark-embed-github.mjs";

const commit = "3e5eed1208b9b444830febcfeecb82a8f3259a3d";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GitHub code reference embeds", () => {
  test("accepts commit-pinned line permalinks", () => {
    const parsed = parseGitHubUrl(
      `https://github.com/f0rr0/zeroclaw/blob/${commit}/src/meal/store.rs#L603-L605`
    );

    expect(parsed).toEqual({
      commit,
      endLine: 605,
      filePath: "src/meal/store.rs",
      href: `https://github.com/f0rr0/zeroclaw/blob/${commit}/src/meal/store.rs#L603-L605`,
      kind: "code",
      owner: "f0rr0",
      repo: "zeroclaw",
      startLine: 603,
    });
  });

  test("accepts plain Markdown permalinks", () => {
    const parsed = parseGitHubUrl(
      `https://github.com/f0rr0/f0rr0.dev/blob/${commit}/README.md?plain=1#L14`
    );

    expect(parsed?.kind).toBe("code");
    expect(parsed?.startLine).toBe(14);
    expect(parsed?.endLine).toBe(14);
    expect(parsed?.href).toEndWith("README.md?plain=1#L14");
  });

  test("leaves mutable branch references as ordinary links", () => {
    expect(
      parseGitHubUrl(
        "https://github.com/f0rr0/zeroclaw/blob/main/src/meal/store.rs#L603-L605"
      )
    ).toBeNull();
  });

  test("leaves file links without a line selection as ordinary links", () => {
    expect(
      parseGitHubUrl(
        `https://github.com/f0rr0/zeroclaw/blob/${commit}/src/meal/store.rs`
      )
    ).toBeNull();
  });

  test("renders the selected lines with their original line numbers", async () => {
    let requestedUrl = "";
    const source = [
      "fn before() {}",
      "fn selected() {",
      '    println!("hello");',
      "}",
      "fn after() {}",
    ].join("\n");

    globalThis.fetch = async (url) => {
      if (typeof url === "string") {
        requestedUrl = url;
      } else if (url instanceof URL) {
        requestedUrl = url.href;
      } else {
        requestedUrl = url.url;
      }

      return Response.json(
        {
          content: Buffer.from(source).toString("base64"),
          encoding: "base64",
          type: "file",
        },
        {
          status: 200,
        }
      );
    };

    const html = await githubTransformer.getHTML(
      `https://github.com/f0rr0/zeroclaw/blob/${commit}/src/meal/store.rs#L2-L4`
    );

    expect(requestedUrl).toBe(
      `https://api.github.com/repos/f0rr0/zeroclaw/contents/src/meal/store.rs?ref=${commit}`
    );
    expect(html).toContain("github-code-embed");
    expect(html).toContain('data-line-number="2"');
    expect(html).toContain('data-line-number="4"');
    expect(html).not.toContain("fn before");
    expect(html).not.toContain("fn after");
  });
});
