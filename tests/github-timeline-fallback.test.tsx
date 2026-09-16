import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { GitHubTimeline } from "../src/components/github-timeline.tsx";
import { primaryGitHubProfile } from "../src/content/resume.ts";

test("a cold outage omits the homepage preview and keeps the work page useful", () => {
  expect(
    renderToStaticMarkup(<GitHubTimeline initialPage={null} preview />)
  ).toBe("");
  const html = renderToStaticMarkup(<GitHubTimeline initialPage={null} />);
  expect(html).toContain(`href="${primaryGitHubProfile.url}"`);
  expect(html).toContain("Work activity is temporarily unavailable.");
  expect(html).not.toContain("github-activity-paginated-days");
});
