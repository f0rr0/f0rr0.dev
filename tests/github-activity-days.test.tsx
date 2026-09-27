import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { GitHubActivityDays } from "../src/components/github-activity-days";
import { dateKey, WORK_LOG_TIME_ZONE } from "../src/lib/date";
import { buildPublicGitHubActivityDays } from "../src/lib/github-activity-feed-core";

test("the initial homepage HTML includes saved IST work across UTC midnight without adding PR totals", () => {
  const days = buildPublicGitHubActivityDays({
    days: ["2026-09-07", "2026-09-06"],
    issues: [],
    workUnits: [
      ["site", "2026-09-07T00:23:00.000Z", 3, 4429, 3415],
      ["oliphaunt", "2026-09-06T23:38:00.000Z", 2, 45, 12],
      ["yesterday", "2026-09-06T18:29:59.000Z", 1, 100, 100],
    ].map(([id, activityAt, count, additions, deletions]) => ({
      id: String(id),
      activityAt: String(activityAt),
      day: dateKey(String(activityAt), WORK_LOG_TIME_ZONE),
      destination:
        id === "site"
          ? {
              label: "Open pull request 1 on GitHub",
              url: "https://github.com/example/site/pull/1",
            }
          : null,
      facts: {
        additions: Number(additions),
        deletions: Number(deletions),
        ownedCommitCount: Number(count),
        uniqueFileCount: 1,
        languages: [],
        dateRange: null,
      },
      headline: String(id),
      kind: "pull-request" as const,
      repository: {
        key: String(id),
        label: String(id),
        url: null,
        avatarUrl: null,
      },
      summarizing: false,
      summary: null,
    })),
  });
  const html = renderToStaticMarkup(
    <GitHubActivityDays days={days} preview now="2026-09-07T01:00:00.000Z" />
  );
  expect(html).toContain("oliphaunt");
  expect(html).toContain('href="https://github.com/example/site/pull/1"');
  expect(html).toContain("Open pull request 1 on GitHub");
  expect(html).toContain("2 updates across 2 repos");
  expect(html).not.toContain("+4,474");
  expect(html).not.toContain("−3,427");
  expect(html).not.toContain("Asia/Kolkata");
  expect(html).toContain("5:53 AM");
  expect(html).toContain("5:08 AM");
  expect(html).not.toContain("yesterday");
});
