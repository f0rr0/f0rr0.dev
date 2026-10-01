import { expect, spyOn, test } from "bun:test";

import { CANONICAL_SITE_URL } from "../src/lib/site-url";
import { warmPublicPages } from "../src/lib/warm-public-pages";
import { env, mockFetch } from "./helpers";

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
