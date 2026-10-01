import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

import { getCache } from "@vercel/functions";

// Explicit keys are shared by separately compiled cron and page bundles.
const cache = getCache({
  // Hobby teams share a cache; previews can also use different databases.
  namespace: `f0rr0-v1-${createHash("sha256")
    .update(
      JSON.stringify([process.env.VERCEL_PROJECT_ID, process.env.DATABASE_URL])
    )
    .digest("hex")}`,
  keyHashFunction: (key) => createHash("sha256").update(key).digest("hex"),
});

const withCacheDeadline = async <T>(operation: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      // oxlint-disable-next-line promise/avoid-new -- Bound optional cache I/O independently of database reads.
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Cache timeout"));
        }, 400);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const readRuntimeCache = async <T>(key: string): Promise<T | null> => {
  try {
    const value = await withCacheDeadline(cache.get(key));
    return typeof value === "string"
      ? (JSON.parse(
          gunzipSync(Buffer.from(value, "base64"), {
            maxOutputLength: 64 * 1024 * 1024,
          }).toString("utf-8")
        ) as T)
      : null;
  } catch {
    return null;
  }
};

export const writeRuntimeCache = async (
  key: string,
  value: unknown,
  ttl?: number
) => {
  try {
    const compressed = gzipSync(JSON.stringify(value)).toString("base64");
    // Vercel limits entries to 2 MB. Oversized values remain ordinary DB reads.
    if (compressed.length < 1_900_000) {
      await withCacheDeadline(
        cache.set(key, compressed, { name: "f0rr0", ttl })
      );
    }
  } catch {
    // A cache outage must not turn a successful database read into a failure.
  }
};
