import { GitHubActivityDays } from "@/components/github-activity-days";
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
      <div className="max-w-2xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-muted-foreground">
          GitHub activity
        </p>
        <h2
          className="mt-2 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          id="timeline-title"
        >
          Work, as it happens
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          A concise record of what I’m building, fixing, and refining.
        </p>
      </div>

      {initialPage.days.length === 0 ? (
        <p className="mt-8 border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
          The activity feed is being prepared. Projects and writing remain
          available below.
        </p>
      ) : (
        <div className="mt-[clamp(2.25rem,5vw,3.5rem)] grid gap-[clamp(2.75rem,6vw,4.5rem)]">
          <GitHubActivityDays days={initialPage.days} />
          {initialPage.nextCursor === null ? null : (
            <GitHubTimelinePager
              initialCursor={initialPage.nextCursor}
              snapshotAt={initialPage.snapshotAt}
            />
          )}
        </div>
      )}
    </section>
  );
}
