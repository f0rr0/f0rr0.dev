import { describe, expect, test } from "bun:test";

import { buildBlogPostMarkdown } from "../src/lib/blog-markdown.ts";

describe("blog Markdown", () => {
  test("adds article context once before the authored body", () => {
    const markdown = buildBlogPostMarkdown({
      body: "First paragraph.\n\n## Detail",
      canonicalUrl: "https://f0rr0.dev/blog/a-post",
      post: {
        date: new Date("2026-08-01T00:00:00.000Z"),
        importPath: "a-post/page.mdx",
        metadata: {
          author: "Sid Jain",
          date: "2026-08-01",
          summary: "A concise summary.",
          title: "A post",
          updated: "2026-08-04",
        },
        readingTime: "1 min read",
        slug: "a-post",
        updatedAt: new Date("2026-08-04T00:00:00.000Z"),
        wordCount: 20,
      },
    });

    expect(markdown).toBe(`# A post

> A concise summary.

Sid Jain · Published 2026-08-01 · updated 2026-08-04

Canonical post: https://f0rr0.dev/blog/a-post

---

First paragraph.

## Detail
`);
  });
});
