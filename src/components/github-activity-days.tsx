import {
  ArrowUpRight,
  CircleDot,
  Code2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  LockKeyhole,
} from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";

import type {
  PublicGitHubActivityCommit,
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
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

const countFormatter = new Intl.NumberFormat("en-US");
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

function RepositoryHeader({
  occurredAt,
  repository,
}: Readonly<{
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
}>) {
  const repositoryLabel = repository.label ?? "Private contribution";
  return (
    <div className="github-activity-entry-header">
      <div className="github-activity-repository">
        {repository.avatarUrl === null ? (
          <span aria-hidden="true" className="github-activity-avatar-fallback">
            <GitBranch className="size-3.5" />
          </span>
        ) : (
          <Image
            alt=""
            className="github-activity-avatar"
            height={28}
            sizes="28px"
            src={repository.avatarUrl}
            unoptimized
            width={28}
          />
        )}
        {repository.url === null ? (
          <span className="github-activity-repository-label">
            {repository.label === null ? (
              <LockKeyhole aria-hidden="true" className="size-3" />
            ) : null}
            {repositoryLabel}
          </span>
        ) : (
          <a
            className="group/link github-activity-repository-link"
            href={repository.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {repositoryLabel}
            <ArrowUpRight
              aria-hidden="true"
              className="size-3 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
            />
            <span className="sr-only"> (opens on GitHub in a new tab)</span>
          </a>
        )}
      </div>
      <time className="github-activity-time" dateTime={occurredAt}>
        {timeFormatter.format(new Date(occurredAt))}
      </time>
    </div>
  );
}

function CommitFacts({
  commit,
}: Readonly<{ commit: PublicGitHubActivityCommit }>) {
  const visibleLanguages = commit.languages.slice(0, 6);
  const hiddenLanguageCount = commit.languages.length - visibleLanguages.length;
  return (
    <div className="github-activity-facts">
      <span
        className="github-activity-loc"
        title={
          commit.providerFileCapReached
            ? "Total lines added and deleted according to GitHub. Per-language line counts cover only the file details GitHub returned and may be incomplete."
            : "Lines added and deleted according to GitHub"
        }
      >
        <span aria-hidden="true" className="github-activity-additions">
          +{countFormatter.format(commit.additions)}
        </span>
        <span aria-hidden="true" className="github-activity-deletions">
          −{countFormatter.format(commit.deletions)}
        </span>
        <span className="sr-only">
          {countFormatter.format(commit.additions)} lines added and{" "}
          {countFormatter.format(commit.deletions)} lines deleted according to
          GitHub.
          {commit.providerFileCapReached
            ? " Per-language line counts cover only the file details GitHub returned and may be incomplete."
            : null}
        </span>
      </span>
      <span
        title={
          commit.providerFileCapReached
            ? "At least 3,000 changed files; GitHub capped the returned file details"
            : undefined
        }
      >
        {commit.providerFileCapReached ? (
          <>
            <span aria-hidden="true">
              {countFormatter.format(commit.changedFiles)}+ files
            </span>
            <span className="sr-only">
              {countFormatter.format(commit.changedFiles)} or more changed
              files; GitHub caps returned file details at 3,000 files
            </span>
          </>
        ) : (
          `${countFormatter.format(commit.changedFiles)} ${commit.changedFiles === 1 ? "file" : "files"}`
        )}
      </span>
      {visibleLanguages.length === 0 ? null : (
        <ul
          aria-label={
            commit.providerFileCapReached
              ? "Languages found in the first 3,000 files returned by GitHub; the full commit may include more"
              : "Languages"
          }
          className="github-activity-languages"
        >
          {visibleLanguages.map((language) => (
            <li
              key={language.id}
              title={
                commit.providerFileCapReached
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
          {hiddenLanguageCount > 0 ? (
            <li aria-label={`${hiddenLanguageCount} more languages`}>
              +{hiddenLanguageCount}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function CommitDisclosure({
  commit,
  headingLevel,
}: Readonly<{
  commit: PublicGitHubActivityCommit;
  headingLevel: "h4" | "h5";
}>) {
  const Heading = headingLevel;
  if (commit.summary === null) {
    return (
      <div className="github-activity-commit">
        <Heading className="github-activity-headline">
          <InlineSummary>{commit.headline}</InlineSummary>
        </Heading>
        <CommitFacts commit={commit} />
      </div>
    );
  }
  return (
    <details className="github-activity-commit github-activity-disclosure">
      <summary>
        <Heading className="github-activity-headline">
          <InlineSummary>{commit.headline}</InlineSummary>
        </Heading>
        <span className="github-activity-disclosure-label" aria-hidden="true">
          Details
        </span>
      </summary>
      <p className="github-activity-summary">
        <InlineSummary>{commit.summary}</InlineSummary>
      </p>
      <CommitFacts commit={commit} />
    </details>
  );
}

function ActivityKind({
  kind,
}: Readonly<{ kind: PublicGitHubActivityItem["kind"] }>) {
  const content =
    kind === "pull-request-commits" ? (
      <>
        <GitPullRequest aria-hidden="true" className="size-3.5" />
        Pull request work
      </>
    ) : kind === "pull-request-merged" ? (
      <>
        <GitMerge aria-hidden="true" className="size-3.5" />
        Pull request merged
      </>
    ) : kind === "issue-opened" ? (
      <>
        <CircleDot aria-hidden="true" className="size-3.5" />
        Issue opened
      </>
    ) : null;
  return content === null ? null : (
    <p className="github-activity-kind">{content}</p>
  );
}

function ActivityEntry({ item }: Readonly<{ item: PublicGitHubActivityItem }>) {
  if (item.kind === "commit") {
    return (
      <li className="github-activity-entry">
        <article>
          <RepositoryHeader
            occurredAt={item.occurredAt}
            repository={item.repository}
          />
          <CommitDisclosure commit={item.commit} headingLevel="h4" />
        </article>
      </li>
    );
  }

  if (item.kind === "pull-request-commits") {
    return (
      <li className="github-activity-entry">
        <article>
          <RepositoryHeader
            occurredAt={item.occurredAt}
            repository={item.repository}
          />
          <ActivityKind kind={item.kind} />
          <h4 className="github-activity-work-title">{item.title}</h4>
          <ol className="github-activity-nested-commits">
            {item.commits.map((commit) => (
              <li key={commit.id}>
                <CommitDisclosure commit={commit} headingLevel="h5" />
              </li>
            ))}
          </ol>
        </article>
      </li>
    );
  }

  return (
    <li className="github-activity-entry">
      <article>
        <RepositoryHeader
          occurredAt={item.occurredAt}
          repository={item.repository}
        />
        <ActivityKind kind={item.kind} />
        <h4 className="github-activity-work-title">{item.title}</h4>
      </article>
    </li>
  );
}

function DayTotal({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>{`${value} ${label}`}</dd>
    </div>
  );
}

function DayTotals({ day }: Readonly<{ day: PublicGitHubActivityDay }>) {
  const { totals } = day;
  return (
    <dl
      aria-label={`Summary for ${day.day}`}
      className="github-activity-day-totals"
    >
      <DayTotal
        label={totals.repositories === 1 ? "repository" : "repositories"}
        value={`Across ${countFormatter.format(totals.repositories)}`}
      />
      {totals.additions === 0 ? null : (
        <DayTotal
          label="lines added"
          value={`+${countFormatter.format(totals.additions)}`}
        />
      )}
      {totals.deletions === 0 ? null : (
        <DayTotal
          label="lines deleted"
          value={`−${countFormatter.format(totals.deletions)}`}
        />
      )}
      {totals.pullRequestsMerged === 0 ? null : (
        <DayTotal
          label={
            totals.pullRequestsMerged === 1
              ? "pull request merged"
              : "pull requests merged"
          }
          value={countFormatter.format(totals.pullRequestsMerged)}
        />
      )}
      {totals.issuesOpened === 0 ? null : (
        <DayTotal
          label={totals.issuesOpened === 1 ? "issue opened" : "issues opened"}
          value={countFormatter.format(totals.issuesOpened)}
        />
      )}
    </dl>
  );
}

export function GitHubActivityDays({
  days,
}: Readonly<{ days: readonly PublicGitHubActivityDay[] }>) {
  return days.map((day) => (
    <section
      aria-labelledby={`activity-day-${day.day}`}
      className="github-activity-day"
      key={day.day}
    >
      <div className="github-activity-day-header">
        <h3 className="github-activity-day-heading">
          <time dateTime={day.day} id={`activity-day-${day.day}`}>
            {dayFormatter.format(new Date(`${day.day}T00:00:00.000Z`))}
          </time>
          <span aria-hidden="true" />
        </h3>
        <DayTotals day={day} />
      </div>
      <ol className="github-activity-list">
        {day.items.map((item) => (
          <ActivityEntry item={item} key={item.id} />
        ))}
      </ol>
    </section>
  ));
}
