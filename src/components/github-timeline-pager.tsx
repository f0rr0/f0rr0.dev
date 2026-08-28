"use client";

import { useState, useTransition } from "react";

import { GitHubActivityDays } from "@/components/github-activity-days";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

const validPage = (value: unknown): value is PublicGitHubActivityPage => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.days) &&
    (typeof page.nextCursor === "string" || page.nextCursor === null) &&
    typeof page.snapshotAt === "string"
  );
};

export function GitHubTimelinePager({
  initialCursor,
  snapshotAt,
}: Readonly<{ initialCursor: string; snapshotAt: string }>) {
  const [cursor, setCursor] = useState<string | null>(initialCursor);
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
        if (!validPage(page) || page.snapshotAt !== snapshotAt) {
          throw new Error("The activity page was invalid.");
        }
        setPages((current) => [...current, page]);
        setCursor(page.nextCursor);
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
      <div id="github-activity-paginated-days">
        {pages.map((page) => (
          <GitHubActivityDays
            days={page.days}
            key={page.days[0]?.day ?? page.snapshotAt}
          />
        ))}
      </div>
      {cursor === null ? null : (
        <div className="github-activity-pager">
          <button
            aria-controls="github-activity-paginated-days"
            className="site-action-link"
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
