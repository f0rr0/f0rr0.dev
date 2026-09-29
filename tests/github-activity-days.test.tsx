import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { GitHubActivityDays } from "../src/components/github-activity-days";
import { dateKey } from "../src/lib/date";
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
      day: dateKey(String(activityAt)),
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
  expect(html).not.toContain('href="https://github.com/example/site/pull/1"');
  expect(html).toContain("2 updates across 2 repos");
  expect(html).not.toContain("+4,474");
  expect(html).not.toContain("−3,427");
  expect(html).not.toContain("Asia/Kolkata");
  expect(html).toContain("5:53 AM");
  expect(html).toContain("5:08 AM");
  expect(html).not.toContain("yesterday");
});

test("work uses accessible status icons, PR totals and useful title fallbacks; issues count as updates", () => {
  const repository = { key: "1", label: "Private", url: null, avatarUrl: null };
  const days = buildPublicGitHubActivityDays({
    days: ["2026-09-28"],
    workUnits: ["open", "draft", "merged", "closed"].map((status) => ({
      activityAt: "2026-09-28T12:00:00Z",
      day: "2026-09-28",
      destination: null,
      id: status,
      kind: "pull-request" as const,
      headline: null,
      summary: null,
      summarizing: false,
      repository,
      facts: {
        additions: 100,
        deletions: 80,
        ownedCommitCount: 2,
        uniqueFileCount: 1,
        languages: null,
        dateRange: null,
      },
      pullRequest: {
        title: "Add filtering",
        status: status as "open" | "draft" | "merged" | "closed",
        statusChangedAt: "2026-09-28T12:00:00Z",
        diff: { additions: 20, deletions: 0, files: 1 },
      },
    })),
    issues: ["open", "completed", "not-planned", "closed"].map((status) => ({
      activityAt: "2026-09-28T12:00:00Z",
      day: "2026-09-28",
      destination: null,
      id: `issue-${status}`,
      title: "Improve filtering",
      repository,
      status: status as "open" | "completed" | "not-planned" | "closed",
    })),
  });
  const html = renderToStaticMarkup(
    <GitHubActivityDays days={days} now="2026-09-28T12:00:00Z" />
  );
  for (const label of [
    "Pull request open",
    "Pull request draft",
    "Pull request merged",
    "Pull request closed",
    "Issue open",
    "Issue completed",
    "Issue closed as not planned",
    "Issue closed",
    "Add filtering",
    "PR total",
    "8 updates across 1 repo",
  ]) {
    expect(html).toContain(label);
  }
  expect(html).not.toContain("+100");
  expect(html).not.toContain("−80");
  expect(html).not.toContain("Direct canonical");
});
