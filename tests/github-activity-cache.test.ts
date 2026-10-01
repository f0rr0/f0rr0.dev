import { expect, mock, spyOn, test } from "bun:test";

import { getInitialGitHubActivity } from "../src/lib/github-activity-feed";
import * as store from "../src/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "../src/lib/github-activity-types";

for (const fallbackCached of [true, false]) {
  test(`cache reads overlap and share fresh content with fallback ${fallbackCached ? "cached" : "missing"}`, async () => {
    const cached: PublicGitHubActivityPage = {
      days: [],
      head: {
        feedRevision: "10",
        lastPublishedAt: null,
        revision: "7",
        summarizing: false,
      },
      nextCursor: null,
      orderingRevision: "4",
    };
    const head = { ...cached.head, revision: "8", summarizing: true };
    const readHead = spyOn(
      store,
      "readPublicGitHubActivityHead"
    ).mockResolvedValue({
      etag: "fresh-head",
      head,
      orderingRevision: "4",
    });
    const readBody = spyOn(
      store,
      "readPublicGitHubActivityPage"
    ).mockRejectedValue(new Error("Unexpected database read"));
    const bothStarted = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    const started = new Set<string>();
    const set = mock(async () => {});
    const previousCache: unknown = Reflect.get(
      globalThis,
      "__incrementalCache"
    );
    Object.assign(globalThis, {
      __incrementalCache: {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => {
          const fallback = key.includes("public-github-activity-fallback-v2");
          started.add(fallback ? "fallback" : "content");
          if (started.size === 2) {
            bothStarted.resolve(null);
          }
          await release.promise;
          return fallback && !fallbackCached
            ? null
            : {
                value: {
                  kind: "FETCH",
                  data: { body: JSON.stringify(cached) },
                },
              };
        },
        set,
      },
    });
    const result = getInitialGitHubActivity();
    try {
      // Neither cache lookup completes until both have started.
      await bothStarted.promise;
      release.resolve(null);
      expect(await result).toEqual({ ...cached, head });
      expect(readBody).not.toHaveBeenCalled();
      if (!fallbackCached) {
        expect(set).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            data: expect.objectContaining({
              body: JSON.stringify({ ...cached, head }),
            }),
          }),
          expect.anything()
        );
      }
    } finally {
      release.resolve(null);
      await result;
      readHead.mockRestore();
      readBody.mockRestore();
      if (previousCache === undefined) {
        Reflect.deleteProperty(globalThis, "__incrementalCache");
      } else {
        Reflect.set(globalThis, "__incrementalCache", previousCache);
      }
    }
  });
}
