import { ArrowUpRight, GitCommitHorizontal } from "lucide-react";

import type { GitHubCommit } from "@/lib/github-commits-core";
import { siteConfig } from "@/lib/site";

const dateFormatter = new Intl.DateTimeFormat(siteConfig.language, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const repositoryLabel = (repository: string) =>
  repository.split("/").at(-1) ?? repository;

export function GitHubTimeline({
  commits,
}: Readonly<{ commits: readonly GitHubCommit[] }>) {
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
          Recent commits
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Commits pushed from my GitHub accounts, persisted as they land.
        </p>
      </div>

      {commits.length === 0 ? (
        <p className="mt-8 border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
          The commit feed has not been populated yet. Projects and writing
          remain available below.
        </p>
      ) : (
        <ol className="sacred-timeline mt-10 sm:mt-12">
          {commits.map((commit) => (
            <li
              className="sacred-timeline-item group"
              key={`${commit.repositoryId}:${commit.sha}`}
            >
              <time
                className="sacred-timeline-date"
                dateTime={commit.committedAt}
              >
                {dateFormatter.format(new Date(commit.committedAt))}
              </time>
              <span aria-hidden="true" className="sacred-timeline-node" />
              <article className="sacred-timeline-content">
                <p className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-primary">
                  <GitCommitHorizontal aria-hidden="true" className="h-3 w-3" />
                  {repositoryLabel(commit.repository)}
                </p>
                <h3 className="sacred-timeline-title">{commit.message}</h3>
                <a
                  className="group/link mt-3 inline-flex items-center gap-1 rounded-sm font-ui text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand-hover hover:decoration-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  href={commit.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View commit
                  <span className="sr-only"> (opens in a new tab)</span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
                  />
                </a>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
