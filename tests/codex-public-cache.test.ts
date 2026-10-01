import { expect, spyOn, test } from "bun:test";

import { tokenPreferences } from "../src/content/tokens";
import * as database from "../src/db/client";
import { buildTokenDetails } from "../src/lib/codex/analytics";
import {
  getPublicCodexStats,
  getPublicTokenDetails,
} from "../src/lib/codex/public-stats";
import * as store from "../src/lib/codex/public-stats-store";
import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
} from "../src/lib/codex/stats";
import { readRuntimeCache } from "../src/lib/runtime-cache";
import { installRuntimeCache } from "./helpers";

const today = new Date().toISOString().slice(0, 10);
const now = new Date(`${today}T12:00:00Z`);
const stats = (tokens: number) =>
  buildPublicCodexStats(
    [
      {
        label: "one",
        snapshot: createCodexAccountSnapshot(
          {
            stats: {
              lifetime_tokens: tokens,
              daily_usage_buckets: [{ start_date: today, tokens }],
            },
          },
          {}
        ),
      },
    ],
    now,
    1
  );
const initial = {
  viewsRevision: "9007199254740992",
  historyRevision: "1",
  views: {
    stats: stats(100),
    details: Object.fromEntries(
      [7, 30, 365].map((days) => [
        days,
        buildTokenDetails([], days, now, tokenPreferences),
      ])
    ),
  },
};
const closed = {
  today,
  viewsRevision: initial.viewsRevision,
  historyRevision: initial.historyRevision,
  rows: [],
};

const setup = () => ({
  cache: installRuntimeCache(),
  configured: spyOn(database, "isDatabaseConfigured").mockReturnValue(true),
  revision: spyOn(store, "readCodexPublicRevision").mockResolvedValue({
    viewsRevision: initial.viewsRevision,
    historyRevision: "1",
  }),
  history: spyOn(store, "readClosedCodexHistory").mockResolvedValue(closed),
  body: spyOn(store, "readCodexPublicViews").mockResolvedValue(initial),
});
const restore = (state: ReturnType<typeof setup>) => {
  state.configured.mockRestore();
  state.revision.mockRestore();
  state.history.mockRestore();
  state.body.mockRestore();
  state.cache.restore();
};

test("views and token details share content; recent updates reuse history, backfills refresh it", async () => {
  const state = setup();
  try {
    expect(await getPublicCodexStats()).toEqual(initial.views.stats);
    expect(await getPublicTokenDetails(7)).toEqual(initial.views.details[7]);
    expect(state.body).toHaveBeenCalledTimes(1);
    expect(state.history).toHaveBeenCalledTimes(1);
    const recent = {
      ...initial,
      viewsRevision: "9007199254740993",
      views: { ...initial.views, stats: stats(101) },
    };
    state.revision.mockResolvedValue({
      viewsRevision: recent.viewsRevision,
      historyRevision: "1",
    });
    state.body.mockResolvedValue(recent);
    expect(await getPublicCodexStats()).toEqual(recent.views.stats);
    expect(state.body).toHaveBeenLastCalledWith(today, closed);
    expect(state.history).toHaveBeenCalledTimes(1);
    const backfill = {
      ...recent,
      viewsRevision: "9007199254740994",
      historyRevision: "2",
      views: { ...initial.views, stats: stats(107) },
    };
    state.revision.mockResolvedValue({
      viewsRevision: backfill.viewsRevision,
      historyRevision: "2",
    });
    state.history.mockResolvedValue({ ...closed, historyRevision: "2" });
    state.body.mockResolvedValue(backfill);
    expect((await getPublicCodexStats())?.totals.last7Days.value).toBe(107);
    expect(state.history).toHaveBeenCalledTimes(2);
    expect(state.body).toHaveBeenCalledTimes(3);
    state.revision.mockRejectedValue(new Error("Database offline"));
    expect(await getPublicCodexStats()).toEqual(backfill.views.stats);
    expect(state.body).toHaveBeenCalledTimes(3);
  } finally {
    restore(state);
  }
});

test("racing publications store history and views under their actual transaction revisions", async () => {
  const state = setup();
  const newer = {
    ...initial,
    viewsRevision: "9007199254740993",
    historyRevision: "2",
  };
  state.history.mockResolvedValue({ ...closed, historyRevision: "2" });
  state.body.mockResolvedValue(newer);
  try {
    await getPublicCodexStats();
    const preferences = JSON.stringify(tokenPreferences);
    expect(
      await readRuntimeCache<typeof closed>(
        JSON.stringify(["codex-closed-history-v2", today, "1"])
      )
    ).toBeNull();
    expect(
      await readRuntimeCache<typeof closed>(
        JSON.stringify(["codex-closed-history-v2", today, "2"])
      )
    ).toEqual({ ...closed, historyRevision: "2" });
    expect(
      await readRuntimeCache<typeof initial>(
        JSON.stringify([
          "public-codex-v2",
          today,
          preferences,
          initial.viewsRevision,
          "1",
        ])
      )
    ).toBeNull();
    expect(
      await readRuntimeCache<typeof initial>(
        JSON.stringify([
          "public-codex-v2",
          today,
          preferences,
          newer.viewsRevision,
          "2",
        ])
      )
    ).toEqual(newer);
  } finally {
    restore(state);
  }
});

for (const warm of [false, true]) {
  test(`slow history preserves ${warm ? "warm availability" : "one cold history and body read"}`, async () => {
    const state = setup();
    const release = Promise.withResolvers<typeof closed>();
    let pending: ReturnType<typeof getPublicCodexStats> | undefined;
    try {
      if (warm) {
        await getPublicCodexStats();
      }
      state.revision.mockResolvedValue({
        viewsRevision: initial.viewsRevision,
        historyRevision: "2",
      });
      state.history.mockReturnValue(release.promise);
      state.body.mockResolvedValue({
        ...initial,
        historyRevision: "2",
        views: { ...initial.views, stats: stats(101) },
      });
      pending = getPublicCodexStats();
      await Bun.sleep(1100);
      if (warm) {
        expect(await pending).toEqual(initial.views.stats);
        expect(state.body).toHaveBeenCalledTimes(1);
        expect(state.history).toHaveBeenCalledTimes(2);
      } else {
        expect(state.body).not.toHaveBeenCalled();
        expect(state.history).toHaveBeenCalledTimes(1);
      }
      release.resolve({ ...closed, historyRevision: "2" });
      await pending;
      // Allow the original healthy read to finish after a warm fallback returned.
      await Bun.sleep(20);
      expect((await getPublicCodexStats())?.totals.last7Days.value).toBe(101);
      expect(state.body).toHaveBeenCalledTimes(warm ? 2 : 1);
      expect(state.history).toHaveBeenCalledTimes(warm ? 2 : 1);
    } finally {
      release.resolve(closed);
      await pending;
      restore(state);
    }
  });
}

test("cache outages keep Codex data available without duplicate history reads", async () => {
  const state = setup();
  try {
    state.cache.get.mockRejectedValue(new Error("Cache offline"));
    state.cache.set.mockRejectedValue(new Error("Cache offline"));
    expect(await getPublicCodexStats()).toEqual(initial.views.stats);
    expect(state.history).toHaveBeenCalledTimes(1);
    expect(state.body).toHaveBeenCalledTimes(1);
  } finally {
    restore(state);
  }
});

test("slow optional history and view cache writes cannot trigger older fallback stats", async () => {
  const state = setup();
  const release = Promise.withResolvers<null>();
  try {
    await getPublicCodexStats();
    const updated = {
      ...initial,
      viewsRevision: "9007199254740993",
      historyRevision: "2",
      views: { ...initial.views, stats: stats(101) },
    };
    state.revision.mockResolvedValue({
      viewsRevision: updated.viewsRevision,
      historyRevision: "2",
    });
    state.history.mockResolvedValue({ ...closed, historyRevision: "2" });
    state.body.mockResolvedValue(updated);
    state.cache.set.mockImplementation(async (key, value) => {
      await release.promise;
      state.cache.values.set(key, value);
    });
    expect(await getPublicCodexStats()).toEqual(updated.views.stats);
    expect(state.history).toHaveBeenCalledTimes(2);
    expect(state.body).toHaveBeenCalledTimes(2);
  } finally {
    release.resolve(null);
    await Bun.sleep(20);
    restore(state);
  }
});
