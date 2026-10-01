import { env } from "@/env";
import { reportOperationalError } from "@/lib/operational-error";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

// Warming data alone leaves the next visitor to regenerate invalidated HTML.
export const warmPublicPages = async (
  paths: readonly ("/" | "/work" | "/tokens")[]
) => {
  // A preview must never warm or regenerate production pages.
  if (env.VERCEL_ENV !== "production") {
    return;
  }
  await Promise.all(
    paths.map(async (path) => {
      try {
        const response = await fetch(new URL(path, CANONICAL_SITE_URL), {
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
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
