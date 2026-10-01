import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { tokenPreferences } from "@/content/tokens";
import { isDatabaseConfigured } from "@/db/client";
import {
  readClosedCodexHistory,
  readCodexPublicRevision,
  readCodexPublicViews,
} from "@/lib/codex/public-stats-store";
import type { ClosedCodexHistory } from "@/lib/codex/public-stats-store";
import { reportOperationalError } from "@/lib/operational-error";
import { readPublicSnapshot } from "@/lib/public-snapshot";

const readVersionedClosedDays = unstable_cache(
  async (today: string, _historyRevision: string) =>
    await readClosedCodexHistory(today),
  ["codex-closed-history-versioned-v1"],
  { revalidate: 86_400, tags: ["codex-history"] }
);

const readViews = async (
  today: string,
  closedHint?: ClosedCodexHistory,
  revision?: Awaited<ReturnType<typeof readCodexPublicRevision>>
) =>
  await unstable_cache(
    // History is only a validated query-saving hint. The transaction stamps
    // the result with the revision of the data it actually read.
    async () => await readCodexPublicViews(today, closedHint),
    [
      revision === undefined
        ? "public-codex-fallback-v1"
        : "public-codex-versioned-v1",
      today,
      JSON.stringify(tokenPreferences),
      ...(revision === undefined
        ? []
        : [revision.viewsRevision, revision.historyRevision]),
    ],
    {
      revalidate: 900,
      ...(revision === undefined ? {} : { tags: ["public-codex-stats"] }),
    }
  )();

const getViews = cache(async () => {
  if (!tokenPreferences.enabled || !isDatabaseConfigured()) {
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    return await readPublicSnapshot(async () => {
      const revision = await readCodexPublicRevision(today);
      // Next bypasses nested unstable_cache reads. Prefetch history outside the views cache.
      const closed = await readVersionedClosedDays(
        today,
        revision.historyRevision
      );
      const fallback = await readViews(today, closed);
      if (
        BigInt(fallback.viewsRevision) >= BigInt(revision.viewsRevision) &&
        BigInt(fallback.historyRevision) >= BigInt(revision.historyRevision)
      ) {
        return fallback.views;
      }
      return (await readViews(today, closed, revision)).views;
    });
  } catch (error) {
    reportOperationalError("public_codex_stats", error);
    // Publication never invalidates this successful outage snapshot. Failed
    // rebuilds throw rather than replacing it with null.
    try {
      return (await readViews(today)).views;
    } catch {
      return null;
    }
  }
});

export const getPublicCodexStats = async () =>
  (await getViews())?.stats ?? null;
export const getPublicTokenDetails = async (days: number) =>
  (await getViews())?.details[days] ?? null;
