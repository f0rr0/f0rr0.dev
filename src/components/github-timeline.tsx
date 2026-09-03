import { GitHubActivityDays } from "@/components/github-activity-days";
import {
  GitHubActivityLiveProvider,
  GitHubActivityStatus,
} from "@/components/github-activity-status";
import { GitHubTimelinePager } from "@/components/github-timeline-pager";
import type { PublicGitHubActivityPage } from "@/lib/github-activity-types";

export function GitHubTimeline({
  initialPage,
}: Readonly<{ initialPage: PublicGitHubActivityPage }>) {
  return (
    <section
      aria-labelledby="timeline-title"
      className="home-section"
      id="timeline"
    >
      <h2
        className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        id="timeline-title"
      >
        GitHub activity
      </h2>

      <GitHubActivityLiveProvider
        feedRevision={initialPage.head.feedRevision}
        orderingRevision={initialPage.orderingRevision}
      >
        <GitHubActivityStatus initialHead={initialPage.head} />
        {initialPage.days.length === 0 ? (
          <p className="mt-6 border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
            No work is currently visible.
          </p>
        ) : (
          <div className="mt-6 grid gap-[clamp(2.75rem,6vw,4.5rem)]">
            <GitHubActivityDays days={initialPage.days} />
            {initialPage.nextCursor === null ? null : (
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
