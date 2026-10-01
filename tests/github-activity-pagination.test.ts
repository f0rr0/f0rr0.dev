import { expect, test } from "bun:test";
import assert from "node:assert/strict";

import { refreshGitHubActivityPages } from "../src/lib/github-activity-pagination";
import type { PublicGitHubActivityPage } from "../src/lib/github-activity-types";

const page = (
  days: string[],
  nextCursor: string | null
): PublicGitHubActivityPage => ({
  days: days.map((day) => ({ day, repositories: [] })),
  nextCursor,
  orderingRevision: "1",
  head: {
    feedRevision: "1",
    revision: "1",
    lastPublishedAt: null,
    summarizing: false,
  },
});

test("publication rebuilds the loaded range with current day cursors", async () => {
  const requests: string[] = [];
  const initial = page(["2026-10-01", "2026-09-30"], "new-boundary");
  const result = await refreshGitHubActivityPages(
    initial,
    "2026-09-27",
    async (cursor) => {
      requests.push(cursor);
      return cursor === "new-boundary"
        ? page(["2026-09-29", "2026-09-28"], "next")
        : page(["2026-09-27"], "remaining");
    }
  );
  expect(requests).toEqual(["new-boundary", "next"]);
  expect(result.cursor).toBe("remaining");
  expect(
    result.pages.flatMap((value) => value.days.map((day) => day.day))
  ).toEqual(["2026-09-29", "2026-09-28", "2026-09-27"]);
  expect(
    await refreshGitHubActivityPages(initial, undefined, async () => {
      throw new Error("unexpected read");
    })
  ).toEqual({ pages: [], cursor: "new-boundary" });
  await assert.rejects(
    refreshGitHubActivityPages(initial, "2026-09-27", async () =>
      page([], "new-boundary")
    ),
    /did not advance/u
  );
  await assert.rejects(
    refreshGitHubActivityPages(initial, "2026-09-27", async () => {
      throw new Error("outage");
    }),
    /outage/u
  );
  expect(initial.days).toHaveLength(2);
});
