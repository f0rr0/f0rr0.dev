import { describe, expect, test } from "bun:test";

import {
  dedentCode,
  githubTransformer,
  parseGitHubUrl,
} from "../src/lib/remark-embed-github.mjs";
import { mockFetch } from "./helpers";

const commit = "3e5eed1208b9b444830febcfeecb82a8f3259a3d";
describe("GitHub code reference embeds", () => {
  test("removes indentation shared by the selected lines", () => {
    expect(
      dedentCode(
        [
          "        let score = calculate();",
          "        if score > 0 {",
          "            store(score);",
          "        }",
        ].join("\n")
      )
    ).toBe(
      [
        "let score = calculate();",
        "if score > 0 {",
        "    store(score);",
        "}",
      ].join("\n")
    );
  });

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

    expect(parsed).toMatchObject({ kind: "code", startLine: 14, endLine: 14 });
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
});

test("GitHub previews preserve PR states, numbers, and escaped remote content", async () => {
  const originalFetch = globalThis.fetch;
  const url = "https://github.com/example/repository/pull/3086";
  try {
    for (const [state, draft, merged, label] of [
      ["open", false, false, "Open"],
      ["open", true, false, "Draft"],
      ["closed", true, false, "Closed"],
      ["closed", false, true, "Merged"],
    ] as const) {
      globalThis.fetch = mockFetch(async () =>
        Response.json({
          state,
          draft,
          merged_at: merged ? "2026-03-11T00:00:00Z" : null,
          updated_at: "2026-03-11T00:00:00Z",
          number: 3086,
          title: "Handle <files> & media",
          user: { login: "author" },
          additions: 20,
          deletions: 3,
          changed_files: 1,
        })
      );
      const html = await githubTransformer.getHTML(url);
      expect(html).toContain(`#3086`);
      expect(html).not.toContain("#3,086");
      expect(html).toContain(`</svg>${label}</span>`);
      expect(html).toContain("Handle &lt;files&gt; &amp; media");
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain("1 file changed");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
