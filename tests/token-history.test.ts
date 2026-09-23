import { expect, test } from "bun:test";

import type { TokenHistory } from "../src/lib/codex/history";
import { summarizeTokenHistory } from "../src/lib/codex/history";
import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
} from "../src/lib/codex/stats";

const make = (lifetime: number) =>
  buildPublicCodexStats(
    [
      {
        snapshot: createCodexAccountSnapshot(
          {
            stats: {
              lifetime_tokens: lifetime,
              daily_usage_buckets: [{ start_date: "2026-09-22", tokens: 10 }],
            },
          },
          {}
        ),
      },
    ],
    new Date("2026-09-23T12:00:00Z")
  );

test("history distinguishes unreported dates from zero and excludes future dates", () => {
  expect(make(10)?.history.values.at(-1)).toEqual({
    day: "2026-09-23",
    tokens: 0,
  });
  expect(make(20)?.history.values.at(-1)).toEqual({
    day: "2026-09-23",
    tokens: null,
  });
  expect(make(20)?.history.partial).toBe(true);
  expect(make(10)?.history.values).toHaveLength(365);
});

test("daily history keeps gaps and finds the peak without counting future dates", () => {
  const history: TokenHistory = {
    partial: false,
    values: [
      { day: "2026-09-20", tokens: 5 },
      { day: "2026-09-21", tokens: null },
      { day: "2026-09-22", tokens: 0 },
      { day: "2026-09-23", tokens: 7 },
      { day: "2026-09-24", tokens: 100 },
    ],
  };
  const result = summarizeTokenHistory(history, "2026-09-23");
  expect(result.total).toBe(12);
  expect(result.cumulativeRows.map((row) => row.tokens)).toEqual([
    5,
    null,
    5,
    12,
  ]);
  expect(result.peak).toEqual({ day: "2026-09-23", tokens: 7 });
  expect(result.rows).toHaveLength(4);
  expect(result.rows[1].tokens).toBeNull();
  expect(result.partial).toBe(true);
  expect(
    summarizeTokenHistory(
      { partial: true, values: [{ day: "2026-09-23", tokens: null }] },
      "2026-09-23"
    ).peak
  ).toBeUndefined();
});
