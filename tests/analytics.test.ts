import { expect, test } from "bun:test";

import {
  articleDepth,
  classifyLink,
  sanitizeProperties,
} from "../src/lib/analytics";

test("analytics removes URL secrets without losing attribution or page identity", () => {
  expect(
    sanitizeProperties({
      $current_url:
        "https://f0rr0.dev/writing/example?email=private@example.com#secret",
      $referrer: "https://www.google.com/search?q=private",
      $initial_referrer: "$direct",
      $prev_pageview_pathname: "/writing/previous?private=1",
      utm_source: "linkedin",
      utm_campaign: "article-launch",
      utm_content: "person@example.com",
      gclid: "private-id",
      $search_keyword: "private query",
      $pageview_id: "page-1",
      $prev_pageview_max_scroll_percentage: 0.75,
    })
  ).toEqual({
    $current_url: "https://f0rr0.dev/writing/example",
    $referrer: "https://www.google.com",
    $initial_referrer: "$direct",
    $prev_pageview_pathname: "/writing/previous",
    utm_source: "linkedin",
    utm_campaign: "article-launch",
    $pageview_id: "page-1",
    $prev_pageview_max_scroll_percentage: 0.75,
  });
});

test("link classification records AI intent without the prompt and ignores ordinary navigation", () => {
  const origin = "https://f0rr0.dev";
  expect(classifyLink("https://chatgpt.com/?q=private", origin)).toEqual({
    event: "ask_ai_clicked",
    properties: { provider: "chatgpt" },
  });
  expect(
    classifyLink("https://www.google.com/search?udm=50&q=private", origin)
  ).toEqual({
    event: "ask_ai_clicked",
    properties: { provider: "google_ai_mode" },
  });
  expect(
    classifyLink("https://www.google.com/search?q=private", origin)?.event
  ).toBe("outbound_link_clicked");
  expect(
    classifyLink("https://www.perplexity.ai/search?q=private", origin)
  ).toEqual({
    event: "ask_ai_clicked",
    properties: { provider: "perplexity" },
  });
  expect(classifyLink("/writing/example.md?private=1", origin)).toBeNull();
  expect(
    classifyLink("https://github.com/f0rr0/repo?token=private", origin)
  ).toEqual({
    event: "outbound_link_clicked",
    properties: {
      destination_host: "github.com",
      destination_path: "/f0rr0/repo",
    },
  });
  expect(classifyLink("/resume/sid.pdf", origin)?.event).toBe(
    "resume_download_clicked"
  );
  expect(classifyLink("/journey", origin)).toBeNull();
  expect(classifyLink("http://[", origin)).toBeNull();
  expect(classifyLink("https://constructor/", origin)?.event).toBe(
    "outbound_link_clicked"
  );
  expect(classifyLink("mailto:private@example.com", origin)).toBeNull();
  expect(articleDepth(1000, 2000, 800)).toBe(0);
  expect(articleDepth(-700, 2000, 800)).toBe(75);
  expect(articleDepth(-1500, 2000, 800)).toBe(100);
  expect(articleDepth(0, 0, 800)).toBe(0);
});
