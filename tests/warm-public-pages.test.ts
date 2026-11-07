import { expect, mock, spyOn, test } from "bun:test";

import * as nextCache from "next/cache";
import * as nextServer from "next/server";

import { CANONICAL_SITE_URL } from "../src/lib/site-url";
import {
  publishPublicPages,
  warmPublicPages,
} from "../src/lib/warm-public-pages";
import { env, installRuntimeCache, mockFetch } from "./helpers";

test("publication ignores fetch timestamps and leaves timed-out content retryable", async () => {
  const cache = installRuntimeCache();
  const invalidate = spyOn(nextCache, "revalidatePath").mockImplementation(
    () => {}
  );
  const after = spyOn(nextServer, "after").mockImplementation(() => {});
  const late = Promise.withResolvers<{ tokens: number }>();
  try {
    for (const fetchedAt of ["2026-11-07T01:00Z", "2026-11-07T02:00Z"]) {
      await publishPublicPages(
        ["/", "/tokens"],
        async () => ({ tokens: 100, fetchedAt }),
        Date.now() + 10_000
      );
    }
    expect(invalidate.mock.calls).toEqual([["/"], ["/tokens"]]);
    expect(after).toHaveBeenCalledTimes(1);
    await publishPublicPages(
      ["/", "/tokens"],
      async () => ({ tokens: 101 }),
      Date.now() + 10_000
    );
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(after).toHaveBeenCalledTimes(2);
    const read = mock(async () => await late.promise);
    await publishPublicPages(["/", "/tokens"], read, 0);
    expect(read).not.toHaveBeenCalled();
    const startedAt = performance.now();
    await publishPublicPages(["/", "/tokens"], read, Date.now() + 1050);
    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(invalidate).toHaveBeenCalledTimes(4);
    late.resolve({ tokens: 102 });
    await publishPublicPages(["/", "/tokens"], read, Date.now() + 10_000);
    expect(invalidate).toHaveBeenCalledTimes(6);
    expect(after).toHaveBeenCalledTimes(3);
  } finally {
    late.resolve({ tokens: 102 });
    invalidate.mockRestore();
    after.mockRestore();
    cache.restore();
  }
});

test("only production warms pages concurrently; failures cannot fail publication", async () => {
  const original = env.VERCEL_ENV;
  const release = Promise.withResolvers<null>();
  const started = Promise.withResolvers<null>();
  let requests = 0;
  const drained: string[] = [];
  const request = spyOn(globalThis, "fetch").mockImplementation(
    mockFetch(async (url, options) => {
      expect(options?.cache).toBe("no-store");
      expect(options?.redirect).toBe("error");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      if (!(url instanceof URL)) {
        throw new Error("Expected a canonical URL");
      }
      const path = url.pathname;
      expect(url.origin).toBe(CANONICAL_SITE_URL);
      requests++;
      if (requests === 2) {
        started.resolve(null);
      }
      await release.promise;
      const response = new Response("Rendered HTML");
      spyOn(response, "arrayBuffer").mockImplementation(async () => {
        drained.push(path);
        return new ArrayBuffer(0);
      });
      return response;
    })
  );
  let pending: Promise<void> | undefined;
  try {
    for (const deployment of ["preview", "development", undefined] as const) {
      env.VERCEL_ENV = deployment;
      await warmPublicPages(["/", "/work"], Date.now() + 60_000);
    }
    expect(request).not.toHaveBeenCalled();
    env.VERCEL_ENV = "production";
    await warmPublicPages(["/", "/work"], Date.now() - 1);
    expect(request).not.toHaveBeenCalled();
    pending = warmPublicPages(["/", "/work"], Date.now() + 60_000);
    expect(
      await Promise.race([
        started.promise.then(() => true),
        Bun.sleep(200).then(() => false),
      ])
    ).toBe(true);
    release.resolve(null);
    await pending;
    expect(drained.toSorted()).toEqual(["/", "/work"]);
    request.mockRejectedValue(new Error("Network unavailable"));
    await warmPublicPages(["/", "/tokens"], Date.now() + 60_000);
    request.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await warmPublicPages(["/work"], Date.now() + 60_000);
    expect(request).toHaveBeenCalledTimes(5);
  } finally {
    release.resolve(null);
    await pending;
    env.VERCEL_ENV = original;
    request.mockRestore();
  }
});

test("page warming aborts within the invocation's remaining time", async () => {
  const original = env.VERCEL_ENV;
  const signalTimeout = spyOn(AbortSignal, "timeout");
  const request = spyOn(globalThis, "fetch").mockImplementation(
    mockFetch(async (_url, options) => {
      const aborted = Promise.withResolvers<never>();
      options?.signal?.addEventListener(
        "abort",
        () => {
          aborted.reject(new Error("Invocation deadline"));
        },
        { once: true }
      );
      return await aborted.promise;
    })
  );
  try {
    env.VERCEL_ENV = "production";
    await warmPublicPages(["/work"], Date.now() + 50);
    expect(request).toHaveBeenCalledTimes(1);
    const [[timeoutMs]] = signalTimeout.mock.calls;
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(50);
  } finally {
    env.VERCEL_ENV = original;
    request.mockRestore();
    signalTimeout.mockRestore();
  }
});
