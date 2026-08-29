import {
  ChevronDown,
  CircleDot,
  Code2,
  GitMerge,
  GitPullRequest,
  LockKeyhole,
} from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";

import { LocalTime } from "@/components/local-time";
import type {
  PublicGitHubActivityCommit,
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
  PublicGitHubStandaloneCommitActivity,
} from "@/lib/github-activity-types";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
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

function RepositoryIdentity({
  repository,
}: Readonly<{
  repository: PublicGitHubActivityRepository;
}>) {
  const repositoryLabel = repository.label ?? "Private";
  return (
    <div className="github-activity-repository">
      {repository.avatarUrl === null ? null : (
        <span aria-hidden="true" className="github-activity-avatar-frame">
          <span className="github-activity-avatar-image-frame">
            <Image
              alt=""
              className={
                repository.url === null
                  ? "github-activity-avatar github-activity-avatar-private"
                  : "github-activity-avatar"
              }
              height={22}
              sizes="22px"
              src={repository.avatarUrl}
              unoptimized
              width={22}
            />
          </span>
          {repository.url === null ? (
            <span className="github-activity-avatar-lock">
              <LockKeyhole className="size-2.5" />
            </span>
          ) : null}
        </span>
      )}
      {repository.url === null ? (
        <span className="github-activity-repository-label">
          {repository.avatarUrl === null ? (
            <LockKeyhole aria-hidden="true" className="size-3" />
          ) : null}
          <span className="github-activity-repository-name">
            {repositoryLabel}
          </span>
        </span>
      ) : (
        <a
          className="github-activity-repository-link"
          href={repository.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="github-activity-repository-name">
            {repositoryLabel}
          </span>
          <span className="sr-only"> (opens on GitHub in a new tab)</span>
        </a>
      )}
    </div>
  );
}

function RepositoryHeader({
  occurredAt,
  repository,
}: Readonly<{
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
}>) {
  return (
    <div className="github-activity-entry-header">
      <RepositoryIdentity repository={repository} />
      <LocalTime className="github-activity-time" dateTime={occurredAt} />
    </div>
  );
}

function CommitLoc({
  commit,
}: Readonly<{ commit: PublicGitHubActivityCommit }>) {
  return (
    <span className="github-activity-facts github-activity-visible-facts">
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
    </span>
  );
}

function CommitDetails({
  commit,
}: Readonly<{ commit: PublicGitHubActivityCommit }>) {
  const visibleLanguages = commit.languages.slice(0, 6);
  const hiddenLanguageCount = commit.languages.length - visibleLanguages.length;
  return (
    <div className="github-activity-facts github-activity-expanded-facts">
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
  occurredAt,
}: Readonly<{
  commit: PublicGitHubActivityCommit;
  headingLevel: "h4" | "h5";
  occurredAt?: string;
}>) {
  const Heading = headingLevel;
  return (
    <details className="github-activity-commit github-activity-disclosure">
      <summary
        className={
          occurredAt === undefined
            ? undefined
            : "github-activity-timed-commit-row"
        }
      >
        <Heading className="github-activity-headline">
          <InlineSummary>{commit.headline}</InlineSummary>
        </Heading>
        <CommitLoc commit={commit} />
        {occurredAt === undefined ? null : (
          <LocalTime className="github-activity-time" dateTime={occurredAt} />
        )}
        <span className="github-activity-disclosure-label" aria-hidden="true">
          <ChevronDown className="github-activity-disclosure-chevron" />
        </span>
      </summary>
      {commit.summary === null ? null : (
        <p className="github-activity-summary">
          <InlineSummary>{commit.summary}</InlineSummary>
        </p>
      )}
      <CommitDetails commit={commit} />
    </details>
  );
}

interface RepositoryCommitGroup {
  commits: PublicGitHubStandaloneCommitActivity[];
  id: string;
  kind: "repository-commit-group";
  repository: PublicGitHubActivityRepository;
}

type NonCommitActivityItem = Exclude<
  PublicGitHubActivityItem,
  PublicGitHubStandaloneCommitActivity
>;

type GroupedActivityItem = NonCommitActivityItem | RepositoryCommitGroup;

function compareIsoTimestampsDescending(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
}

function groupedActivityTimestamp(item: GroupedActivityItem) {
  return item.kind === "repository-commit-group"
    ? (item.commits[0]?.commit.committedAt ?? "")
    : item.occurredAt;
}

function groupCommitsByRepository(
  items: readonly PublicGitHubActivityItem[]
): GroupedActivityItem[] {
  const groupedItems: GroupedActivityItem[] = [];
  const commitGroups = new Map<string, RepositoryCommitGroup>();

  for (const item of items) {
    if (item.kind !== "commit") {
      groupedItems.push(item);
      continue;
    }

    const repositoryKey = item.repository.label ?? "private";
    const existingGroup = commitGroups.get(repositoryKey);
    if (existingGroup !== undefined) {
      existingGroup.commits.push(item);
      continue;
    }

    const group: RepositoryCommitGroup = {
      commits: [item],
      id: `repository-commits:${item.id}`,
      kind: "repository-commit-group",
      repository: item.repository,
    };
    commitGroups.set(repositoryKey, group);
    groupedItems.push(group);
  }

  for (const group of commitGroups.values()) {
    group.commits.sort((left, right) =>
      compareIsoTimestampsDescending(
        left.commit.committedAt,
        right.commit.committedAt
      )
    );
  }

  return groupedItems.toSorted((left, right) =>
    compareIsoTimestampsDescending(
      groupedActivityTimestamp(left),
      groupedActivityTimestamp(right)
    )
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

function ActivityEntry({ item }: Readonly<{ item: NonCommitActivityItem }>) {
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

function RepositoryCommitGroupEntry({
  group,
}: Readonly<{ group: RepositoryCommitGroup }>) {
  const repositoryLabel = group.repository.label ?? "Private";
  return (
    <li className="github-activity-entry github-activity-commit-group">
      <article aria-label={`${repositoryLabel} commits`}>
        <div className="github-activity-commit-group-header">
          <RepositoryIdentity repository={group.repository} />
        </div>
        <ol className="github-activity-grouped-commits">
          {group.commits.map((item) => (
            <li key={item.id}>
              <CommitDisclosure
                commit={item.commit}
                headingLevel="h5"
                occurredAt={item.occurredAt}
              />
            </li>
          ))}
        </ol>
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
        {groupCommitsByRepository(day.items).map((item) =>
          item.kind === "repository-commit-group" ? (
            <RepositoryCommitGroupEntry group={item} key={item.id} />
          ) : (
            <ActivityEntry item={item} key={item.id} />
          )
        )}
      </ol>
    </section>
  ));
}
