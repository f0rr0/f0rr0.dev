import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import { readRuntimeCache, writeRuntimeCache } from "../src/lib/runtime-cache";
import { installRuntimeCache } from "./helpers";

test("explicit keys, compression and provider limits preserve large evidence without caching oversized entries", async () => {
  const cache = installRuntimeCache();
  try {
    const value = {
      patch: "@@ diff with repeatable context\n".repeat(350_000),
      empty: [],
      absent: null,
    };
    await writeRuntimeCache("evidence", value, 3600);
    expect(await readRuntimeCache<typeof value>("evidence")).toEqual(value);
    expect(cache.set.mock.calls[0]?.[0]).toMatch(
      /^f0rr0-v1-[\w-]+\$[a-f0-9]{64}$/u
    );
    expect(cache.set.mock.calls[0]?.[2]).toEqual({ name: "f0rr0", ttl: 3600 });
    await writeRuntimeCache(
      "too-large",
      randomBytes(2_000_000).toString("base64"),
      3600
    );
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(await readRuntimeCache("too-large")).toBeNull();
    cache.values.set(cache.set.mock.calls[0][0], "broken gzip");
    expect(await readRuntimeCache("evidence")).toBeNull();
  } finally {
    cache.restore();
  }
});

test("failed and stalled cache I/O remains optional and bounded", async () => {
  const cache = installRuntimeCache();
  const release = Promise.withResolvers<null>();
  try {
    cache.get.mockRejectedValue(new Error("Cache offline"));
    expect(await readRuntimeCache("offline")).toBeNull();
    cache.set.mockRejectedValue(new Error("Cache offline"));
    await writeRuntimeCache("offline", "valid data", 60);
    cache.get.mockReturnValue(release.promise);
    const started = performance.now();
    expect(await readRuntimeCache("stalled")).toBeNull();
    expect(performance.now() - started).toBeLessThan(750);
  } finally {
    release.resolve(null);
    cache.restore();
  }
});
