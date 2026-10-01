import "server-only";
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
import { readRuntimeCache, writeRuntimeCache } from "@/lib/runtime-cache";

type PublicViews = Awaited<ReturnType<typeof readCodexPublicViews>>;
const preferencesKey = JSON.stringify(tokenPreferences);
const viewsKey = (
  today: string,
  revision: Pick<PublicViews, "viewsRevision" | "historyRevision">
) =>
  JSON.stringify([
    "public-codex-v2",
    today,
    preferencesKey,
    revision.viewsRevision,
    revision.historyRevision,
  ]);
const historyKey = (today: string, historyRevision: string) =>
  JSON.stringify(["codex-closed-history-v2", today, historyRevision]);

const getViews = cache(async () => {
  if (!tokenPreferences.enabled || !isDatabaseConfigured()) {
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const fallbackKey = JSON.stringify([
    "public-codex-fallback-v2",
    today,
    preferencesKey,
  ]);
  const fallbackRead = readRuntimeCache<PublicViews>(fallbackKey);
  const cacheWrites: Promise<void>[] = [];
  let bodyRead: Promise<PublicViews> | undefined;
  const readBody = async (closed?: ClosedCodexHistory) =>
    await (bodyRead ??= readCodexPublicViews(today, closed));
  const healthyRead = (async () => {
    const revision = await readCodexPublicRevision(today);
    const [versioned, fallback] = await Promise.all([
      readRuntimeCache<PublicViews>(viewsKey(today, revision)),
      fallbackRead,
    ]);
    const covers = (value: PublicViews | null) =>
      value !== null &&
      BigInt(value.viewsRevision) >= BigInt(revision.viewsRevision) &&
      BigInt(value.historyRevision) >= BigInt(revision.historyRevision);
    const cached = covers(fallback) ? fallback : versioned;
    let value = cached;
    if (!covers(value)) {
      let closed = await readRuntimeCache<ClosedCodexHistory>(
        historyKey(today, revision.historyRevision)
      );
      if (closed === null) {
        closed = await readClosedCodexHistory(today);
        cacheWrites.push(
          writeRuntimeCache(
            historyKey(today, closed.historyRevision),
            closed,
            86_400
          )
        );
      }
      value = await readBody(closed);
      // Both store reads stamp their actual transaction revision. A publication
      // between reads must never put newer data under an older revision key.
      cacheWrites.push(writeRuntimeCache(viewsKey(today, value), value, 900));
    }
    if (value === null) {
      throw new Error("Missing Codex public views");
    }
    if (
      fallback?.viewsRevision !== value.viewsRevision ||
      fallback.historyRevision !== value.historyRevision
    ) {
      cacheWrites.push(writeRuntimeCache(fallbackKey, value));
    }
    return value.views;
  })();
  try {
    const views = await readPublicSnapshot(async () => await healthyRead);
    // Cache writes are optional, and must not trigger an older outage snapshot.
    await Promise.all(cacheWrites);
    return views;
  } catch (error) {
    reportOperationalError("public_codex_stats", error);
    const fallback = await fallbackRead;
    if (fallback !== null) {
      return fallback.views;
    }
    try {
      // Keep a cold timeout on the same history/body read already in flight.
      const views = await healthyRead;
      await Promise.all(cacheWrites);
      return views;
    } catch {
      try {
        const value = await readBody();
        await writeRuntimeCache(fallbackKey, value);
        return value.views;
      } catch {
        return null;
      }
    }
  }
});

export const getPublicCodexStats = async () =>
  (await getViews())?.stats ?? null;
export const getPublicTokenDetails = async (days: number) =>
  (await getViews())?.details[days] ?? null;
