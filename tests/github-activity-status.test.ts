import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";

import {
  comparePublicActivityRevisions,
  fetchPublicActivityHead,
  publicActivityHeadFrom,
} from "../src/lib/github-activity-status.ts";
import { mockFetch } from "./helpers.ts";

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

  test("passive refresh rejects invalid responses and never regresses the server head", async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const [response, expected] of [
        [settledHead, settledHead],
        [{ ...settledHead, revision: "41" }, settledHead],
        [
          { ...settledHead, revision: "43", feedRevision: "8" },
          { ...settledHead, revision: "43", feedRevision: "8" },
        ],
      ]) {
        globalThis.fetch = mockFetch(async () => Response.json(response));
        expect(await fetchPublicActivityHead(settledHead)).toEqual(expected);
      }
      globalThis.fetch = mockFetch(async () =>
        Response.json({ revision: "bad" })
      );
      await assert.rejects(fetchPublicActivityHead(settledHead), /invalid/u);
      globalThis.fetch = mockFetch(
        async () => new Response(null, { status: 503 })
      );
      await assert.rejects(
        fetchPublicActivityHead(settledHead),
        /unavailable/u
      );
      globalThis.fetch = mockFetch(async () => {
        throw new TypeError("offline");
      });
      await assert.rejects(fetchPublicActivityHead(settledHead), /offline/u);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
