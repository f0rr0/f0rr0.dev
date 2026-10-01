"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { GitHubActivityDays } from "@/components/github-activity-days";
import { useGitHubActivityLive } from "@/components/github-activity-status";
import { track } from "@/lib/analytics";
import { refreshGitHubActivityPages } from "@/lib/github-activity-pagination";
import {
  hasNewPublicActivity,
  publicActivityHeadFrom,
} from "@/lib/github-activity-status";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

const validPage = (value: unknown): value is PublicGitHubActivityPage => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const page = value as Record<string, unknown>;
  const head = publicActivityHeadFrom(page.head);
  return (
    Array.isArray(page.days) &&
    (typeof page.nextCursor === "string" || page.nextCursor === null) &&
    typeof page.orderingRevision === "string" &&
    head !== null
  );
};

export function GitHubTimelinePager({
  initialPage,
  preview,
  now,
}: Readonly<{
  initialPage: PublicGitHubActivityPage;
  preview: boolean;
  now: string;
}>) {
  const { feedRevision, orderingRevision, markLatestAvailable } =
    useGitHubActivityLive();
  const revision = `${initialPage.head.feedRevision}:${initialPage.orderingRevision}`;
  const [loaded, setLoaded] = useState({
    revision,
    cursor: initialPage.nextCursor,
    initialDays: initialPage.days,
    pages: [] as readonly PublicGitHubActivityPage[],
  });
  const [error, setError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const currentRevision = useRef(revision);
  // Only committed props may supersede an in-flight request.
  useLayoutEffect(() => {
    currentRevision.current = revision;
    return () => {
      request.current?.abort();
    };
  }, [revision]);

  const loadPages = async (refresh: boolean) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(false);
    setStatus("");
    setIsPending(true);
    const readPage = async (cursor: string) => {
      const response = await fetch(
        `/api/github/activity?cursor=${encodeURIComponent(cursor)}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error("The activity page could not be loaded.");
      }
      const page = (await response.json()) as unknown;
      if (!validPage(page)) {
        throw new Error("The activity page was invalid.");
      }
      if (
        hasNewPublicActivity(
          { ...page.head, orderingRevision: page.orderingRevision },
          feedRevision,
          orderingRevision
        )
      ) {
        markLatestAvailable();
      }
      return page;
    };
    try {
      const next = refresh
        ? await refreshGitHubActivityPages(
            initialPage,
            preview
              ? undefined
              : [
                  ...loaded.initialDays,
                  ...loaded.pages.flatMap((page) => page.days),
                ].at(-1)?.day,
            readPage
          )
        : loaded.cursor === null
          ? loaded
          : await readPage(loaded.cursor).then((page) => ({
              pages: [...loaded.pages, page],
              cursor: page.nextCursor,
            }));
      if (controller.signal.aborted || currentRevision.current !== revision) {
        return;
      }
      setLoaded({ ...next, revision, initialDays: initialPage.days });
      const count = next.pages.at(-1)?.days.length ?? 0;
      if (!refresh) {
        track("github_activity_loaded", { days_loaded: count });
      }
      setStatus(
        refresh
          ? "Loaded activity is up to date."
          : `Loaded ${count} earlier ${count === 1 ? "day" : "days"}.`
      );
    } catch {
      if (!controller.signal.aborted && currentRevision.current === revision) {
        setError(true);
      }
    } finally {
      if (request.current === controller) {
        setIsPending(false);
      }
    }
  };

  useEffect(() => {
    if (loaded.revision !== revision) {
      void loadPages(true);
    }
    // Reconcile only on publication. Loaded pages are retained until all refresh reads succeed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const days = [
    ...new Map(
      [
        ...initialPage.days,
        ...[
          ...loaded.initialDays,
          ...loaded.pages.flatMap((page) => page.days),
        ].filter(
          (day) => !initialPage.days.some((initial) => initial.day === day.day)
        ),
      ].map((day) => [day.day, day])
    ).values(),
  ];
  const cursor =
    loaded.revision === revision ? loaded.cursor : initialPage.nextCursor;
  const loadMore = () => {
    if (!isPending) {
      void loadPages(loaded.revision !== revision);
    }
  };

  return (
    <>
      <div className="contents" id="github-activity-paginated-days">
        <GitHubActivityDays
          days={days}
          itemLimit={preview ? 2 : undefined}
          preview={preview}
          now={now}
        />
      </div>
      {preview || (cursor === null && !error) ? null : (
        <div className="flex flex-col items-start gap-3">
          <button
            aria-controls="github-activity-paginated-days"
            className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={isPending}
            onClick={loadMore}
            type="button"
          >
            {loaded.revision === revision
              ? isPending
                ? "Loading earlier work…"
                : "Load earlier work"
              : isPending
                ? "Refreshing loaded work…"
                : "Retry refreshing work"}
          </button>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              Earlier activity could not be loaded. Please try again.
            </p>
          ) : null}
        </div>
      )}
      <p aria-live="polite" className="sr-only" role="status">
        {status}
      </p>
    </>
  );
}
