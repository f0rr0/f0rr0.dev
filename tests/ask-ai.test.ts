import { describe, expect, test } from "bun:test";

import { buildAssistantActions, buildAskAiPrompt } from "../src/lib/ask-ai.ts";
import { buildAskAboutMePrompt } from "../src/lib/resume.ts";
import { publicUrl } from "../src/lib/site.ts";

const context = {
  sourceUrl: "https://f0rr0.dev/writing/a-post.md",
  title: "A post & its source",
};

describe("Ask AI links", () => {
  test("gives every provider the same canonical context", () => {
    const prompt = buildAskAiPrompt(context);
    const actions = buildAssistantActions(prompt);

    expect(prompt).toContain(context.title);
    expect(prompt).toContain(context.sourceUrl);
    for (const action of actions) {
      expect(new URL(action.href).searchParams.get("q")).toBe(prompt);
    }
  });
});

test("portfolio assistants share the visible prompt and use regular web chats", () => {
  const prompt = buildAskAboutMePrompt();
  const actions = buildAssistantActions(prompt);
  expect(prompt).toContain(publicUrl("/llms.txt"));
  expect(actions.map((action) => action.label)).toEqual([
    "ChatGPT",
    "Claude",
    "Google AI Mode",
    "Perplexity",
  ]);
  for (const action of actions) {
    const url = new URL(action.href);
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("q")).toBe(prompt);
    expect(url.pathname).not.toBe("/code");
  }
  const google = new URL(actions[2].href);
  expect(google.hostname).toBe("www.google.com");
  expect(google.searchParams.get("udm")).toBe("50");
});
