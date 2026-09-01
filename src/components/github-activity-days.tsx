import {
  CircleDot,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  LockKeyhole,
} from "lucide-react";
import Image from "next/image";

import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
  PublicGitHubActivityRepositoryGroup,
  PublicGitHubWorkUnitActivity,
  PublicGitHubWorkUnitFacts,
} from "@/lib/github-activity-types";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const countFormatter = new Intl.NumberFormat("en-US");
const workUnitIcons = {
  branch: GitBranch,
  "canonical-day": GitCommitHorizontal,
  "pull-request": GitPullRequest,
} as const;
const workUnitLabels = {
  branch: "Active branch work",
  "canonical-day": "Direct canonical-branch work",
  "pull-request": "Pull request",
} as const;

function RepositoryIdentity({
  repository,
}: Readonly<{ repository: PublicGitHubActivityRepository }>) {
  return (
    <a
      className="inline-flex min-w-0 items-center gap-2.5 rounded-sm font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
      href={repository.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {repository.avatarUrl === null ? null : (
        <span
          aria-hidden="true"
          className="size-5 flex-none overflow-hidden rounded-full bg-muted"
        >
          <Image
            alt=""
            className="size-full object-cover"
            height={20}
            sizes="20px"
            src={repository.avatarUrl}
            unoptimized
            width={20}
          />
        </span>
      )}
      <span className="min-w-0 wrap-anywhere">{repository.label}</span>
      <span className="sr-only"> (opens on GitHub in a new tab)</span>
    </a>
  );
}

function WorkUnitIcon({
  kind,
}: Readonly<{ kind: PublicGitHubWorkUnitActivity["kind"] }>) {
  const Icon = workUnitIcons[kind];
  return <Icon aria-hidden="true" className="size-4" />;
}

function DateRange({ end, start }: Readonly<{ end: string; start: string }>) {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return <span>{rangeFormatter.formatRange(startDate, endDate)}</span>;
}

function WorkUnitFacts({
  facts,
}: Readonly<{ facts: PublicGitHubWorkUnitFacts }>) {
  return (
    <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[0.6875rem] text-muted-foreground">
      <div>
        <dt className="sr-only">Owned commits</dt>
        <dd>
          {countFormatter.format(facts.ownedCommitCount)}{" "}
          {facts.ownedCommitCount === 1 ? "commit" : "commits"}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Unique files changed</dt>
        <dd>
          {countFormatter.format(facts.uniqueFileCount)}{" "}
          {facts.uniqueFileCount === 1 ? "file" : "files"}
        </dd>
      </div>
      <div className="inline-flex items-center gap-2">
        <dt className="sr-only">Authored line churn</dt>
        <dd className="inline-flex items-center gap-2">
          <span className="text-[light-dark(oklch(0.48_0.12_155),oklch(0.75_0.13_155))]">
            <span className="sr-only">Added </span>+
            {countFormatter.format(facts.additions)}
          </span>
          <span className="text-[light-dark(oklch(0.52_0.16_25),oklch(0.76_0.13_25))]">
            <span className="sr-only">Deleted </span>−
            {countFormatter.format(facts.deletions)}
          </span>
        </dd>
      </div>
      {facts.languages === null || facts.languages.length === 0 ? null : (
        <div>
          <dt className="sr-only">Languages</dt>
          <dd>{facts.languages.join(", ")}</dd>
        </div>
      )}
      {facts.dateRange === null ? null : (
        <div>
          <dt className="sr-only">Authored date range</dt>
          <dd>
            <DateRange {...facts.dateRange} />
          </dd>
        </div>
      )}
    </dl>
  );
}

function WorkUnitRow({
  item,
}: Readonly<{ item: PublicGitHubWorkUnitActivity }>) {
  return (
    <li className="py-3">
      <article className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          {item.outcome === null ? null : (
            <p className="max-w-[50rem] wrap-anywhere text-base leading-relaxed text-foreground">
              {item.outcome}
            </p>
          )}
          <WorkUnitFacts facts={item.facts} />
        </div>
        <a
          aria-label={`${workUnitLabels[item.kind]}: ${item.destination.label}`}
          className="mt-0.5 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          href={item.destination.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <WorkUnitIcon kind={item.kind} />
        </a>
      </article>
    </li>
  );
}

function IssueRow({
  item,
}: Readonly<{
  item: Extract<PublicGitHubActivityItem, { kind: "issue-opened" }>;
}>) {
  return (
    <li className="py-3">
      <article className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <p className="max-w-[50rem] wrap-anywhere text-base leading-relaxed text-foreground">
          {item.title}
        </p>
        <a
          aria-label={`Issue opened: ${item.destination.label}`}
          className="mt-0.5 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          href={item.destination.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <CircleDot aria-hidden="true" className="size-4" />
        </a>
      </article>
    </li>
  );
}

function ActivityItem({ item }: Readonly<{ item: PublicGitHubActivityItem }>) {
  return item.kind === "issue-opened" ? (
    <IssueRow item={item} />
  ) : (
    <WorkUnitRow item={item} />
  );
}

function RepositoryGroup({
  group,
}: Readonly<{ group: PublicGitHubActivityRepositoryGroup }>) {
  return (
    <li className="border-b border-border py-5 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]">
      <article aria-label={`${group.repository.label} activity`}>
        <header>
          <RepositoryIdentity repository={group.repository} />
        </header>
        <ol className="mt-1 divide-y divide-border/60">
          {group.items.map((item) => (
            <ActivityItem item={item} key={item.id} />
          ))}
        </ol>
      </article>
    </li>
  );
}

function PrivateWork() {
  return (
    <li className="border-b border-border py-5">
      <div className="inline-flex min-h-6 items-center gap-2 font-mono text-xs text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="size-3.5" />
        <span>Private work</span>
      </div>
    </li>
  );
}

function GitHubActivityDay({
  day,
}: Readonly<{ day: PublicGitHubActivityDay }>) {
  const repositoryCount = day.repositories.length;
  return (
    <section
      aria-labelledby={`activity-day-${day.day}`}
      className="[contain-intrinsic-size:auto_28rem] [content-visibility:auto]"
    >
      <div className="grid gap-2">
        <h3 className="grid grid-cols-[auto_minmax(2rem,1fr)] items-center gap-4 font-mono text-[0.6875rem] font-medium tracking-[0.11em] text-muted-foreground uppercase">
          <time dateTime={day.day} id={`activity-day-${day.day}`}>
            {dayFormatter.format(new Date(`${day.day}T00:00:00.000Z`))}
          </time>
          <span aria-hidden="true" className="h-px bg-border" />
        </h3>
        {repositoryCount === 0 ? null : (
          <p className="font-mono text-[0.6875rem] text-muted-foreground">
            Across {countFormatter.format(repositoryCount)}{" "}
            {repositoryCount === 1 ? "repository" : "repositories"}
          </p>
        )}
      </div>
      <ol aria-label={`Activity for ${day.day}`} className="mt-2">
        {day.repositories.map((group) => (
          <RepositoryGroup group={group} key={group.repository.key} />
        ))}
        {day.privateWork ? <PrivateWork /> : null}
      </ol>
    </section>
  );
}

export function GitHubActivityDays({
  days,
}: Readonly<{ days: readonly PublicGitHubActivityDay[] }>) {
  return days.map((day) => <GitHubActivityDay day={day} key={day.day} />);
}
