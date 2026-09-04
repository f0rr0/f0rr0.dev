import Link from "next/link";

import { GitHubActivityDays } from "@/components/github-activity-days";
import {
  GitHubActivityLiveProvider,
  GitHubActivityStatus,
} from "@/components/github-activity-status";
import { GitHubTimelinePager } from "@/components/github-timeline-pager";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

export function GitHubTimeline({
  initialPage,
  preview = false,
}: Readonly<{ initialPage: PublicGitHubActivityPage; preview?: boolean }>) {
  const Heading = preview ? "h2" : "h1";
  const days = preview ? initialPage.days.slice(0, 3) : initialPage.days;
  return (
    <section
      aria-labelledby="timeline-title"
      className={preview ? "home-section" : undefined}
      id="timeline"
    >
      <div className="flex items-baseline justify-between gap-4">
        <Heading
          className={
            preview
              ? "font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              : "font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          }
          id="timeline-title"
        >
          Work Log
        </Heading>
        {preview ? (
          <Link
            className="shrink-0 font-ui text-sm text-muted-foreground transition-colors hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            href="/work-log"
            prefetch={false}
          >
            All work
          </Link>
        ) : null}
      </div>
      {preview ? null : (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          A day-by-day record of what I’m building, fixing, and shipping.
        </p>
      )}

      <GitHubActivityLiveProvider
        feedRevision={initialPage.head.feedRevision}
        orderingRevision={initialPage.orderingRevision}
      >
        <GitHubActivityStatus initialHead={initialPage.head} />
        {days.length === 0 ? (
          <p className="mt-6 border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
            No work is currently visible.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            <GitHubActivityDays
              days={days}
              itemLimit={preview ? 2 : undefined}
            />
            {preview || initialPage.nextCursor === null ? null : (
              <GitHubTimelinePager
                initialCursor={initialPage.nextCursor}
                key={`${initialPage.head.feedRevision}:${initialPage.orderingRevision}`}
                orderingRevision={initialPage.orderingRevision}
              />
            )}
          </div>
        )}
      </GitHubActivityLiveProvider>
    </section>
  );
}
