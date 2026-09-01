import { describe, expect, test } from "bun:test";

import {
  PUBLIC_ACTIVITY_MAX_SETTLED_REQUESTS,
  PUBLIC_ACTIVITY_MAX_STATUS_REQUESTS,
  PUBLIC_ACTIVITY_SETTLED_POLL_MS,
  PUBLIC_ACTIVITY_SUMMARY_POLL_MS,
  comparePublicActivityRevisions,
  nextPublicActivityPoll,
  publicActivityHeadFrom,
  publicActivityStatusText,
} from "../src/lib/github-activity-status.ts";

const settledHead = {
  feedRevision: "7",
  lastPublishedAt: "2026-09-01T11:57:00.000Z",
  revision: "42",
  summarizing: false,
};

describe("public GitHub activity status", () => {
  test("accepts only the complete canonical public head", () => {
    expect(publicActivityHeadFrom(settledHead)).toEqual(settledHead);
    for (const invalid of [
      null,
      { ...settledHead, feedRevision: "feed-7" },
      { ...settledHead, lastPublishedAt: "yesterday" },
      { ...settledHead, revision: "0042" },
      { ...settledHead, summarizing: "yes" },
    ]) {
      expect(publicActivityHeadFrom(invalid)).toBeNull();
    }
  });

  test("compares decimal revisions without numeric precision loss", () => {
    expect(
      comparePublicActivityRevisions(
        "900719925474099300000",
        "900719925474099299999"
      )
    ).toBe(1);
    expect(comparePublicActivityRevisions("42", "42")).toBe(0);
    expect(comparePublicActivityRevisions("41", "42")).toBe(-1);
  });

  test("bounds settled checks and polls actual summary work more frequently", () => {
    expect(
      nextPublicActivityPoll(settledHead, {
        requestCount: 0,
        settledRequestCount: 0,
      })
    ).toEqual({ delayMs: PUBLIC_ACTIVITY_SETTLED_POLL_MS, kind: "settled" });
    expect(
      nextPublicActivityPoll(settledHead, {
        requestCount: PUBLIC_ACTIVITY_MAX_SETTLED_REQUESTS,
        settledRequestCount: PUBLIC_ACTIVITY_MAX_SETTLED_REQUESTS,
      })
    ).toBeNull();
    expect(
      nextPublicActivityPoll(
        { ...settledHead, summarizing: true },
        { requestCount: 0, settledRequestCount: 3 }
      )
    ).toEqual({
      delayMs: PUBLIC_ACTIVITY_SUMMARY_POLL_MS,
      kind: "summarizing",
    });
    expect(
      nextPublicActivityPoll(
        { ...settledHead, summarizing: true },
        {
          requestCount: PUBLIC_ACTIVITY_MAX_STATUS_REQUESTS,
          settledRequestCount: 0,
        }
      )
    ).toBeNull();
  });

  test("uses one quiet status phrase for real summary work", () => {
    expect(
      publicActivityStatusText(
        { ...settledHead, summarizing: true },
        Date.parse("2026-09-01T12:00:00.000Z")
      )
    ).toBe("Shaping the latest update");
  });
});
