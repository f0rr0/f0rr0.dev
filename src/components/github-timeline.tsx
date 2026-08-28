"use client";

import { ArrowUpRight, Code2, GitBranch, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { Fragment, useState, useTransition } from "react";

import type {
  PublicGitHubActivityItem,
  PublicGitHubActivityPage,
} from "@/lib/github-activity-types";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const inlineMarkdownPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/gu;

function InlineSummary({ children }: Readonly<{ children: string }>) {
  return children.split(inlineMarkdownPattern).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${index}:${part}`}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${index}:${part}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${index}:${part}`}>{part}</Fragment>;
  });
}

interface ActivityDay {
  date: Date;
  id: string;
  items: PublicGitHubActivityItem[];
}

const groupActivityByDay = (
  items: readonly PublicGitHubActivityItem[]
): readonly ActivityDay[] => {
  const groups = new Map<string, ActivityDay>();
  for (const item of items) {
    const id = item.committedAt.slice(0, 10);
    const existing = groups.get(id);
    if (existing === undefined) {
      groups.set(id, {
        date: new Date(`${id}T00:00:00.000Z`),
        id,
        items: [item],
      });
    } else {
      existing.items.push(item);
    }
  }
  return [...groups.values()];
};

const mergeActivity = (
  current: readonly PublicGitHubActivityItem[],
  incoming: readonly PublicGitHubActivityItem[]
) => {
  const ids = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (ids.has(item.id)) {
        return false;
      }
      ids.add(item.id);
      return true;
    }),
  ];
};

function ActivityEntry({ item }: Readonly<{ item: PublicGitHubActivityItem }>) {
  const visibleLanguages = item.languages.slice(0, 6);
  const hiddenLanguageCount = item.languages.length - visibleLanguages.length;
  const repositoryLabel = item.repositoryLabel ?? "Private contribution";

  return (
    <li className="github-activity-entry">
      <article>
        <div className="github-activity-entry-header">
          <div className="github-activity-repository">
            {item.avatarUrl === null ? (
              <span
                aria-hidden="true"
                className="github-activity-avatar-fallback"
              >
                <GitBranch className="size-3.5" />
              </span>
            ) : (
              <Image
                alt=""
                className="github-activity-avatar"
                height={28}
                sizes="28px"
                src={item.avatarUrl}
                unoptimized
                width={28}
              />
            )}
            {item.url === null ? (
              <span className="github-activity-repository-label">
                {item.repositoryLabel === null ? (
                  <LockKeyhole aria-hidden="true" className="size-3" />
                ) : null}
                {repositoryLabel}
              </span>
            ) : (
              <a
                className="group/link github-activity-repository-link"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {repositoryLabel}
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
                />
                <span className="sr-only"> (opens commit in a new tab)</span>
              </a>
            )}
          </div>
          <time className="github-activity-time" dateTime={item.committedAt}>
            {timeFormatter.format(new Date(item.committedAt))}
          </time>
        </div>

        {item.summaryKind === "headline" ? (
          <h4 className="github-activity-headline">
            <InlineSummary>{item.summary}</InlineSummary>
          </h4>
        ) : (
          <p className="github-activity-summary">
            <InlineSummary>{item.summary}</InlineSummary>
          </p>
        )}

        <div className="github-activity-facts">
          <span
            className="github-activity-loc"
            title={
              item.providerFileCapReached
                ? "Total lines added and deleted according to GitHub. Per-language line counts cover only the file details GitHub returned and may be incomplete."
                : "Lines added and deleted according to GitHub"
            }
          >
            <span aria-hidden="true" className="github-activity-additions">
              +{item.additions}
            </span>
            <span aria-hidden="true" className="github-activity-deletions">
              −{item.deletions}
            </span>
            <span className="sr-only">
              {item.additions} lines added and {item.deletions} lines deleted
              according to GitHub.
              {item.providerFileCapReached
                ? " Per-language line counts cover only the file details GitHub returned and may be incomplete."
                : null}
            </span>
          </span>
          <span
            title={
              item.providerFileCapReached
                ? "At least 3,000 changed files; GitHub capped the returned file details"
                : undefined
            }
          >
            {item.providerFileCapReached ? (
              <>
                <span aria-hidden="true">{item.changedFiles}+ files</span>
                <span className="sr-only">
                  {item.changedFiles} or more changed files; GitHub caps
                  returned file details at 3,000 files
                </span>
              </>
            ) : (
              `${item.changedFiles} ${item.changedFiles === 1 ? "file" : "files"}`
            )}
          </span>
          {visibleLanguages.length === 0 ? null : (
            <ul
              aria-label={
                item.providerFileCapReached
                  ? "Languages found in the first 3,000 files returned by GitHub; the full commit may include more"
                  : "Languages"
              }
              className="github-activity-languages"
            >
              {visibleLanguages.map((language) => (
                <li
                  key={language.id}
                  title={
                    item.providerFileCapReached
                      ? `${language.changedLines} changed lines in the returned file details; incomplete because GitHub capped them at 3,000 files`
                      : `${language.changedLines} changed lines`
                  }
                >
                  {language.iconUrl === null ? (
                    <Code2 aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Image
                      alt=""
                      height={14}
                      sizes="14px"
                      src={language.iconUrl}
                      unoptimized
                      width={14}
                    />
                  )}
                  <span>{language.label}</span>
                </li>
              ))}
              {hiddenLanguageCount > 0 ? <li>+{hiddenLanguageCount}</li> : null}
            </ul>
          )}
        </div>
      </article>
    </li>
  );
}

export function GitHubTimeline({
  initialPage,
}: Readonly<{ initialPage: PublicGitHubActivityPage }>) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const days = groupActivityByDay(items);

  const loadMore = () => {
    if (nextCursor === null || isPending) {
      return;
    }
    const cursor = nextCursor;
    setError(false);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/github/activity?cursor=${encodeURIComponent(cursor)}`
        );
        if (!response.ok) {
          throw new Error("The activity page could not be loaded.");
        }
        const page = (await response.json()) as PublicGitHubActivityPage;
        setItems((current) => mergeActivity(current, page.items));
        setNextCursor(page.nextCursor);
      } catch {
        setError(true);
      }
    });
  };

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
          A patch-level record of what I’m building, fixing, and refining.
        </p>
      </div>

      {days.length === 0 ? (
        <p className="mt-8 border-y border-border py-5 text-sm leading-relaxed text-muted-foreground">
          The activity feed is being prepared. Projects and writing remain
          available below.
        </p>
      ) : (
        <div className="github-activity-days">
          {days.map((day) => (
            <section
              aria-labelledby={`activity-day-${day.id}`}
              className="github-activity-day"
              key={day.id}
            >
              <h3 className="github-activity-day-heading">
                <time dateTime={day.id} id={`activity-day-${day.id}`}>
                  {dayFormatter.format(day.date)}
                </time>
                <span aria-hidden="true" />
              </h3>
              <ol className="github-activity-list">
                {day.items.map((item) => (
                  <ActivityEntry item={item} key={item.id} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {nextCursor === null ? null : (
        <div className="mt-10 flex flex-col items-start gap-3">
          <button
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
    </section>
  );
}
