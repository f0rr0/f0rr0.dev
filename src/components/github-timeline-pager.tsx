"use client";

import { useState, useTransition } from "react";

import { GitHubActivityDays } from "@/components/github-activity-days";
import { useGitHubActivityLive } from "@/components/github-activity-status";
import { track } from "@/lib/analytics";
import { publicActivityHeadFrom } from "@/lib/github-activity-status";
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
  const { feedRevision, markLatestAvailable } = useGitHubActivityLive();
  const [cursor, setCursor] = useState<string | null>(initialPage.nextCursor);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pages, setPages] = useState<readonly PublicGitHubActivityPage[]>([]);
  const [status, setStatus] = useState("");

  const loadMore = () => {
    if (cursor === null || isPending) {
      return;
    }
    const requestedCursor = cursor;
    setError(false);
    setStatus("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/github/activity?cursor=${encodeURIComponent(requestedCursor)}`
        );
        if (!response.ok) {
          throw new Error("The activity page could not be loaded.");
        }
        const page = (await response.json()) as unknown;
        if (!validPage(page)) {
          throw new Error("The activity page was invalid.");
        }
        if (page.head.feedRevision !== feedRevision) {
          markLatestAvailable();
        }
        setPages((current) => [...current, page]);
        setCursor(page.nextCursor);
        track("github_activity_loaded", { days_loaded: page.days.length });
        setStatus(
          `Loaded ${page.days.length} earlier ${page.days.length === 1 ? "day" : "days"}.`
        );
      } catch {
        setError(true);
      }
    });
  };

  return (
    <>
      <div className="contents" id="github-activity-paginated-days">
        <GitHubActivityDays
          days={[...initialPage.days, ...pages.flatMap((page) => page.days)]}
          itemLimit={preview ? 2 : undefined}
          preview={preview}
          now={now}
        />
      </div>
      {preview || cursor === null ? null : (
        <div className="flex flex-col items-start gap-3">
          <button
            aria-controls="github-activity-paginated-days"
            className="site-text-link inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={isPending}
            onClick={loadMore}
            type="button"
          >
            {isPending ? "Loading earlier work…" : "Load earlier work"}
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
