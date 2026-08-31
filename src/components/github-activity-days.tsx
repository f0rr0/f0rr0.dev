import { ChevronDown, CircleDot, Code2, LockKeyhole } from "lucide-react";
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
import { cn } from "@/lib/utils";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

const countFormatter = new Intl.NumberFormat("en-US");
const inlineMarkdownPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/gu;
const activityFactsClassName =
  "mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-[0.7rem] font-mono text-[0.6875rem] tracking-[0.02em] text-muted-foreground";
const activityTimeClassName =
  "flex-none font-mono text-[0.6875rem] tracking-[0.03em] text-muted-foreground";
const repositoryLabelClassName =
  "inline-flex min-w-0 items-center gap-[0.3rem] font-mono text-xs leading-[1.35] text-muted-foreground";
const workTitleClassName =
  "max-w-[50rem] wrap-anywhere font-sans text-base font-normal leading-[1.625] tracking-normal text-foreground";

function InlineSummary({ children }: Readonly<{ children: string }>) {
  return children.split(inlineMarkdownPattern).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          className="rounded-[0.3rem] border border-border/85 bg-muted/[62%] px-[0.25em] py-[0.05em] font-mono text-[0.86em] font-medium"
          key={`${index}:${part}`}
        >
          {part.slice(1, -1)}
        </code>
      );
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
    <div className="flex min-w-0 items-center gap-2.5">
      {repository.avatarUrl === null ? null : (
        <span aria-hidden="true" className="relative size-[1.375rem] flex-none">
          <span className="block size-full overflow-hidden rounded-full bg-muted">
            <Image
              alt=""
              className={cn(
                "size-full object-cover",
                repository.url === null && "scale-110 blur-[2px]"
              )}
              height={22}
              sizes="22px"
              src={repository.avatarUrl}
              unoptimized
              width={22}
            />
          </span>
          {repository.url === null ? (
            <span className="absolute -right-[0.175rem] -bottom-[0.175rem] grid size-3.5 place-items-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_1px_var(--background)]">
              <LockKeyhole className="size-2.5" />
            </span>
          ) : null}
        </span>
      )}
      {repository.url === null ? (
        <span className={repositoryLabelClassName}>
          {repository.avatarUrl === null ? (
            <LockKeyhole aria-hidden="true" className="size-3" />
          ) : null}
          <span className="min-w-0 wrap-anywhere">{repositoryLabel}</span>
        </span>
      ) : (
        <a
          className={cn(
            repositoryLabelClassName,
            "transition-[color] duration-[160ms] ease-[ease] hover:text-brand-hover motion-reduce:transition-none"
          )}
          href={repository.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="min-w-0 wrap-anywhere">{repositoryLabel}</span>
          <span className="sr-only"> (opens on GitHub in a new tab)</span>
        </a>
      )}
    </div>
  );
}

function CommitLoc({
  commit,
}: Readonly<{ commit: PublicGitHubActivityCommit }>) {
  return (
    <span className={cn(activityFactsClassName, "mt-0")}>
      <span
        className="inline-flex items-center gap-[0.45rem]"
        title={
          commit.providerFileCapReached
            ? "Total lines added and deleted according to GitHub. Per-language line counts cover only the file details GitHub returned and may be incomplete."
            : "Lines added and deleted according to GitHub"
        }
      >
        <span
          aria-hidden="true"
          className="text-[light-dark(oklch(0.48_0.12_155),oklch(0.75_0.13_155))]"
        >
          +{countFormatter.format(commit.additions)}
        </span>
        <span
          aria-hidden="true"
          className="text-[light-dark(oklch(0.52_0.16_25),oklch(0.76_0.13_25))]"
        >
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
    <div className={activityFactsClassName}>
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
          className="inline-flex flex-wrap items-center gap-[0.45rem]"
        >
          {visibleLanguages.map((language) => (
            <li
              className="inline-flex items-center gap-[0.3rem]"
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
                  className="opacity-[0.82] dark:invert"
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
            <li
              aria-label={`${hiddenLanguageCount} more languages`}
              className="inline-flex items-center gap-[0.3rem]"
            >
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
  const nested = headingLevel === "h5";
  return (
    <details className="group/disclosure">
      <summary
        className={cn(
          "grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0 focus-visible:rounded-[0.25rem] focus-visible:outline-2 focus-visible:outline-offset-[0.35rem] focus-visible:outline-ring [&::-webkit-details-marker]:hidden",
          occurredAt === undefined
            ? null
            : "grid-cols-[minmax(0,1fr)_auto_auto_auto]"
        )}
      >
        <Heading className="min-w-0 max-w-[50rem] overflow-hidden text-ellipsis whitespace-nowrap wrap-anywhere font-sans text-base font-normal leading-[1.625] tracking-normal text-foreground">
          <InlineSummary>{commit.headline}</InlineSummary>
        </Heading>
        <CommitLoc commit={commit} />
        {occurredAt === undefined ? null : (
          <LocalTime className={activityTimeClassName} dateTime={occurredAt} />
        )}
        <span
          aria-hidden="true"
          className="inline-flex items-center text-muted-foreground group-open/disclosure:text-primary"
        >
          <ChevronDown className="size-3.5 transition-[rotate] duration-[160ms] ease-[ease] group-open/disclosure:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      {commit.summary === null ? null : (
        <p
          className={cn(
            "max-w-[50rem] whitespace-pre-wrap wrap-anywhere text-muted-foreground",
            nested
              ? "mt-2 text-[0.925rem] leading-[1.75]"
              : "mt-2.5 text-[0.975rem] leading-[1.75]"
          )}
        >
          <InlineSummary>{commit.summary}</InlineSummary>
        </p>
      )}
      <CommitDetails commit={commit} />
    </details>
  );
}

interface RepositoryActivityGroup {
  id: string;
  items: PublicGitHubActivityItem[];
  occurredAt: string;
  repository: PublicGitHubActivityRepository;
}

type NonCommitActivityItem = Exclude<
  PublicGitHubActivityItem,
  PublicGitHubStandaloneCommitActivity
>;

function compareIsoTimestampsDescending(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
}

function compareActivityItemsDescending(
  left: PublicGitHubActivityItem,
  right: PublicGitHubActivityItem
) {
  const byTime = compareIsoTimestampsDescending(
    left.occurredAt,
    right.occurredAt
  );
  return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
}

function groupActivitiesByRepository(
  items: readonly PublicGitHubActivityItem[]
): RepositoryActivityGroup[] {
  const groups = new Map<string, RepositoryActivityGroup>();

  for (const item of items) {
    const repositoryKey = item.repository.key;
    const existingGroup = groups.get(repositoryKey);
    if (existingGroup !== undefined) {
      existingGroup.items.push(item);
      continue;
    }

    groups.set(repositoryKey, {
      id: `repository-activity:${repositoryKey}`,
      items: [item],
      occurredAt: item.occurredAt,
      repository: item.repository,
    });
  }

  for (const group of groups.values()) {
    group.items.sort(compareActivityItemsDescending);
    const [newestItem] = group.items;
    if (newestItem !== undefined) {
      group.occurredAt = newestItem.occurredAt;
      const repositoryHeaderItem =
        group.items.find((item) => item.kind === "commit") ?? newestItem;
      group.repository = repositoryHeaderItem.repository;
    }
  }

  return [...groups.values()].toSorted((left, right) => {
    const byTime = compareIsoTimestampsDescending(
      left.occurredAt,
      right.occurredAt
    );
    return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
  });
}

function ActivityTitle({
  className,
  item,
}: Readonly<{ className?: string; item: NonCommitActivityItem }>) {
  return (
    <h4 className={cn(workTitleClassName, className)}>
      {item.repository.url === null ? (
        item.title
      ) : (
        <a
          className="rounded-[0.125rem] text-inherit transition-[color] duration-[160ms] ease-[ease] hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-[0.2rem] focus-visible:outline-ring motion-reduce:transition-none"
          href={item.repository.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {item.title}
          <span className="sr-only"> (opens on GitHub in a new tab)</span>
        </a>
      )}
    </h4>
  );
}

function RepositoryActivityItem({
  item,
}: Readonly<{ item: PublicGitHubActivityItem }>) {
  if (item.kind === "commit") {
    return (
      <li className="py-[0.45rem]">
        <CommitDisclosure
          commit={item.commit}
          headingLevel="h4"
          occurredAt={item.occurredAt}
        />
      </li>
    );
  }

  if (item.kind === "pull-request-commits") {
    return (
      <li className="py-[0.45rem]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <ActivityTitle item={item} />
          <LocalTime
            className={activityTimeClassName}
            dateTime={item.occurredAt}
          />
        </div>
        <ol className="mt-4 grid gap-4 border-l border-border/[86%] pl-[clamp(1rem,3vw,1.5rem)]">
          {item.commits.map((commit) => (
            <li key={commit.id}>
              <CommitDisclosure commit={commit} headingLevel="h5" />
            </li>
          ))}
        </ol>
      </li>
    );
  }

  return (
    <li className="py-[0.45rem]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div>
          <p className="inline-flex items-center gap-[0.35rem] font-ui text-[0.6875rem] font-[650] tracking-[0.08em] text-primary uppercase">
            <CircleDot aria-hidden="true" className="size-3.5" />
            Issue opened
          </p>
          <ActivityTitle className="mt-[0.35rem]" item={item} />
        </div>
        <LocalTime
          className={activityTimeClassName}
          dateTime={item.occurredAt}
        />
      </div>
    </li>
  );
}

function RepositoryActivityGroupEntry({
  group,
}: Readonly<{ group: RepositoryActivityGroup }>) {
  const repositoryLabel = group.repository.label ?? "Private";
  return (
    <li className="border-b border-border py-5 [contain-intrinsic-size:auto_11rem] [content-visibility:auto]">
      <article aria-label={`${repositoryLabel} activity`}>
        <header className="flex items-center">
          <RepositoryIdentity repository={group.repository} />
        </header>
        <ol className="mt-[0.35rem] grid">
          {group.items.map((item) => (
            <RepositoryActivityItem item={item} key={item.id} />
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
      className="flex flex-wrap gap-x-4 gap-y-[0.45rem] font-mono text-[0.6875rem] tracking-[0.02em] text-muted-foreground"
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
      className="[contain-intrinsic-size:auto_28rem] [content-visibility:auto]"
      key={day.day}
    >
      <div className="grid gap-[0.65rem]">
        <h3 className="grid grid-cols-[auto_minmax(2rem,1fr)] items-center gap-4 font-mono text-[0.6875rem] font-medium leading-[1.5] tracking-[0.11em] text-muted-foreground uppercase">
          <time dateTime={day.day} id={`activity-day-${day.day}`}>
            {dayFormatter.format(new Date(`${day.day}T00:00:00.000Z`))}
          </time>
          <span aria-hidden="true" className="h-px bg-border/[86%]" />
        </h3>
        <DayTotals day={day} />
      </div>
      {day.items.length === 0 ? null : (
        <ol aria-label={`Activity for ${day.day}`} className="mt-2">
          {groupActivitiesByRepository(day.items).map((group) => (
            <RepositoryActivityGroupEntry group={group} key={group.id} />
          ))}
        </ol>
      )}
    </section>
  ));
}
