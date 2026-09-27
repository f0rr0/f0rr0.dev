import { expect, test } from "bun:test";

import type { githubActivitySnapshots } from "../src/db/schema";
import { mergeAnalyticsSnapshots } from "../src/lib/codex/analytics";
import {
  liveCodexSnapshot,
  mutableCodexStart,
  partitionCodexHistory,
  restoreCodexHistory,
} from "../src/lib/codex/daily-history";
import {
  createCodexAccountSnapshot,
  buildPublicCodexStats,
} from "../src/lib/codex/stats";
import { buildPublicGitHubActivityDays } from "../src/lib/github-activity-feed-core";
import { githubSnapshotChanged } from "../src/lib/github-activity-snapshots";

test("daily storage round-trips explicit zeros, gaps, source units and archived units", () => {
  const snapshot = createCodexAccountSnapshot({ stats: {} }, {});
  snapshot.dailyUsageBuckets = [
    { startDate: "2026-09-25", tokens: 200 },
    { startDate: "2026-09-27", tokens: 0 },
  ];
  snapshot.cumulativeDailyUsageBuckets = [
    { startDate: "2026-09-27", tokens: 200 },
  ];
  const source = (date: string, units: string, value: number) => ({
    start: date,
    end: date,
    fetchedAt: `${date}T12:00:00Z`,
    response: {
      units,
      data: [{ date, product_surface_usage_values: { cli: value } }],
    },
  });
  snapshot.analytics = {
    delegation: source("2026-09-27", "credits", 3),
    archivedDelegation: [
      {
        ...source("2026-09-24", "percent", 5),
        response: {
          units: "percent",
          data: [
            ...source("2026-09-24", "percent", 5).response.data,
            ...source("2026-09-25", "percent", 6).response.data,
          ],
        },
      },
    ],
  };
  const days = partitionCodexHistory(snapshot);
  expect(days.has("2026-09-26")).toBe(false);
  expect(days.get("2026-09-27")?.dailyUsageBuckets?.[0].tokens).toBe(0);
  const restored = restoreCodexHistory(liveCodexSnapshot(snapshot), [
    ...days.values(),
  ]);
  expect(restored.dailyUsageBuckets).toEqual(snapshot.dailyUsageBuckets);
  expect(restored.cumulativeDailyUsageBuckets).toEqual(
    snapshot.cumulativeDailyUsageBuckets
  );
  expect(restored.analytics?.delegation?.response).toEqual(
    snapshot.analytics.delegation?.response
  );
  expect(restored.analytics?.archivedDelegation?.[0].response).toEqual(
    snapshot.analytics.archivedDelegation?.[0].response
  );
  const cycle = mergeAnalyticsSnapshots(
    mergeAnalyticsSnapshots(
      { delegation: source("2026-09-24", "credits", 1) },
      { delegation: source("2026-09-25", "percent", 2) }
    ),
    { delegation: source("2026-09-27", "credits", 3) }
  );
  expect(cycle.delegation?.response.data.map((row) => row.date)).toEqual([
    "2026-09-24",
    "2026-09-27",
  ]);
  expect(
    cycle.archivedDelegation?.map((entry) => entry.response.units)
  ).toEqual(["percent"]);
  const stats = buildPublicCodexStats(
    [{ snapshot: restored }],
    new Date("2026-09-27T12:00:00Z")
  );
  expect(stats?.totals.todayTokens).toEqual({ value: 0, partial: false });
  expect(stats?.totals.last7Days).toEqual({ value: 200, partial: true });
});

test("an older optional-source response cannot overwrite a newer explicit report", () => {
  const source = (fetchedAt: string, turns: number) => ({
    activity: {
      start: "2026-09-27",
      end: "2026-09-27",
      fetchedAt,
      response: { data: [{ date: "2026-09-27", totals: { turns } }] },
    },
  });
  const merged = mergeAnalyticsSnapshots(
    source("2026-09-27T12:00:00Z", 10),
    source("2026-09-27T11:00:00Z", 2)
  );
  expect(merged.activity?.response.data[0].totals.turns).toBe(10);
  expect(merged.activity?.fetchedAt).toBe("2026-09-27T12:00:00Z");
  expect(mutableCodexStart(new Date("2026-10-01T00:00:00Z"))).toBe(
    "2026-09-30"
  );
});

const saved = (
  outcomeDigest: string | null,
  additions = 200
): typeof githubActivitySnapshots.$inferInsert => ({
  identityKey: "pr:example",
  day: "2026-09-27",
  repositoryId: "1",
  outcomeDigest,
  attributionMode: "tracked_authored_pr",
  payload: {
    day: "2026-09-27",
    activityAt: "2026-09-27T12:00:00Z",
    id: "2026-09-27:pr:example",
    kind: "pull-request",
    destination: {
      label: "Open PR",
      url: "https://github.com/example/repo/pull/1",
    },
    repository: {
      key: "1",
      label: "example/repo",
      avatarUrl: null,
      url: "https://github.com/example/repo",
    },
    facts: {
      additions,
      deletions: 10,
      languages: [],
      ownedCommitCount: 1,
      uniqueFileCount: 1,
      dateRange: null,
    },
    headline: null,
    summary: null,
    summarizing: false,
  },
});

test("work snapshots compare the latest outcome; rebases and first digest acquisition do not repost work", () => {
  expect(githubSnapshotChanged(saved("A"), saved("A", 240))).toBe(false);
  expect(githubSnapshotChanged(saved("A"), saved("B", 240))).toBe(true);
  expect(githubSnapshotChanged(saved("B", 240), saved("A"))).toBe(true);
  expect(githubSnapshotChanged(saved(null), saved("A"))).toBe(false);
  expect(githubSnapshotChanged(saved("A"), saved(null, 240))).toBe(false);
  expect(githubSnapshotChanged(saved(null), saved(null, 240))).toBe(true);
  const fromDatabase = saved(null);
  if (!("facts" in fromDatabase.payload)) {
    throw new Error("Expected a work card");
  }
  // jsonb reorders object keys when a saved card is read back from PostgreSQL.
  fromDatabase.payload.facts = Object.fromEntries(
    Object.entries(fromDatabase.payload.facts).toReversed()
  ) as typeof fromDatabase.payload.facts;
  expect(githubSnapshotChanged(fromDatabase, saved(null))).toBe(false);
  expect(githubSnapshotChanged(fromDatabase, saved("A"))).toBe(false);
  expect(githubSnapshotChanged(fromDatabase, saved(null, 240))).toBe(true);
  expect(
    githubSnapshotChanged(saved("A"), {
      ...saved("A"),
      attributionMode: "foreign_pr_contribution",
    })
  ).toBe(true);
});

test("saved display days keep both sides of IST midnight in their own page", () => {
  const base = saved("A").payload;
  if (!("facts" in base)) {
    throw new Error("Expected a work card");
  }
  const rows = [
    { ...base, day: "2026-09-27", activityAt: "2026-09-27T18:29:59Z" },
    {
      ...base,
      id: "next-day",
      day: "2026-09-28",
      activityAt: "2026-09-27T18:30:00Z",
    },
  ];
  const page = buildPublicGitHubActivityDays({
    days: ["2026-09-28", "2026-09-27"],
    workUnits: rows,
    issues: [],
  });
  expect(
    page.map((day) => [day.day, day.repositories[0].items.length])
  ).toEqual([
    ["2026-09-28", 1],
    ["2026-09-27", 1],
  ]);
});
