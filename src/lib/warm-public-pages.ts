import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { env } from "@/env";
import { reportOperationalError } from "@/lib/operational-error";
import { readPublicSnapshot } from "@/lib/public-snapshot";
import { readRuntimeCache, writeRuntimeCache } from "@/lib/runtime-cache";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

// Warming data alone leaves the next visitor to regenerate invalidated HTML.
export const warmPublicPages = async (
  paths: readonly ("/" | "/work" | "/tokens")[],
  deadlineAt: number
) => {
  const timeoutMs = Math.min(10_000, deadlineAt - Date.now());
  // A preview must never warm or regenerate production pages.
  if (env.VERCEL_ENV !== "production" || timeoutMs <= 0) {
    return;
  }
  await Promise.all(
    paths.map(async (path) => {
      try {
        const response = await fetch(new URL(path, CANONICAL_SITE_URL), {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        await response.arrayBuffer();
        if (!response.ok) {
          throw new Error("Public page warming failed");
        }
      } catch (error) {
        reportOperationalError("public_page_warm", error);
      }
    })
  );
};

export const publishPublicPages = async (
  paths: readonly ("/" | "/work" | "/tokens")[],
  readContent: () => Promise<unknown>,
  deadlineAt: number
) => {
  // Leave a second for the two bounded publication-cache operations.
  const timeoutMs = deadlineAt - Date.now() - 1000;
  if (timeoutMs <= 0) {
    return;
  }
  const content = await readPublicSnapshot(readContent, timeoutMs).catch(
    (error: unknown) => {
      reportOperationalError("public_page_prepare", error);
      return null;
    }
  );
  if (content === null || Date.now() >= deadlineAt) {
    return;
  }
  const key = JSON.stringify(["published-pages-v1", paths]);
  // Source fetch times order merges but do not change the rendered statistics.
  const version = createHash("sha256")
    .update(
      JSON.stringify(content, (name, value: unknown) =>
        name === "fetchedAt" ? undefined : value
      )
    )
    .digest("hex");
  if ((await readRuntimeCache<string>(key)) === version) {
    return;
  }
  for (const path of paths) {
    revalidatePath(path);
  }
  await writeRuntimeCache(key, version);
  after(async () => {
    await warmPublicPages(paths, deadlineAt);
  });
};
