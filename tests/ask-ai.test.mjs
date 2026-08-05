import { describe, expect, test } from "bun:test";

import { buildAskAiLinks, buildAskAiPrompt } from "../src/lib/ask-ai.ts";

const context = {
  sourceUrl: "https://f0rr0.dev/blog/a-post.md",
  title: "A post & its source",
};

describe("Ask AI links", () => {
  test("gives every provider the same canonical context", () => {
    const prompt = buildAskAiPrompt(context);
    const links = buildAskAiLinks(context);

    expect(prompt).toBe(
      'Read "A post & its source" at https://f0rr0.dev/blog/a-post.md. Answer my questions using the post as your primary source.'
    );
    expect(new URL(links.chatGpt).searchParams.get("q")).toBe(prompt);
    expect(new URL(links.claude).searchParams.get("q")).toBe(prompt);
    expect(new URL(links.gemini).searchParams.get("q")).toBe(prompt);
  });
});
