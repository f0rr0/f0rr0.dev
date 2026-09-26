"use client";

import { CircleDot, FolderGit2, LockKeyhole } from "lucide-react";
import Image from "next/image";

import { LanguageIcon } from "@/components/language-icon";
import { LocalDateTime } from "@/components/local-date-time";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DisclosureChevron,
} from "@/components/site-collapsible";
import {
  TooltipContent,
  TooltipGroup,
  TooltipTrigger,
} from "@/components/site-tooltip";
import { dateKey, formatDate, WORK_LOG_TIME_ZONE } from "@/lib/date";
import {
  getVisibleGitHubActivityDays,
  localizeGitHubActivityDays,
} from "@/lib/github-activity-feed-core";
import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
  PublicGitHubActivityRepositoryGroup,
  PublicGitHubWorkUnitActivity,
  PublicGitHubWorkUnitFacts,
} from "@/lib/github-activity-types";

const countFormatter = new Intl.NumberFormat("en-US");
const workUnitLabels = {
  branch: "Active branch work",
  "canonical-day": "Direct canonical-branch work",
  "pull-request": "Pull request",
} as const;

function RepositoryIdentity({
  repository,
}: Readonly<{ repository: PublicGitHubActivityRepository }>) {
  const isPrivate = repository.label === null || repository.url === null;
  const Identity = isPrivate ? "span" : "a";
  return (
    <Identity
      className="inline-flex min-h-7 min-w-0 items-center gap-2 rounded-sm text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      href={isPrivate ? undefined : (repository.url ?? undefined)}
      rel={isPrivate ? undefined : "noopener noreferrer"}
      target={isPrivate ? undefined : "_blank"}
    >
      <span
        aria-hidden="true"
        className="relative grid size-7 shrink-0 place-items-center"
      >
        {repository.avatarUrl === null ? (
          isPrivate ? (
            <LockKeyhole className="size-5" />
          ) : (
            <FolderGit2 className="size-5" />
          )
        ) : (
          <Image
            alt=""
            className={`size-full rounded-full object-cover ${isPrivate ? "blur-[2px]" : ""}`}
            height={28}
            sizes="28px"
            src={repository.avatarUrl}
            width={28}
          />
        )}
        {isPrivate && repository.avatarUrl !== null ? (
          <span className="absolute -inset-e-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-background ring-1 ring-background">
            <LockKeyhole className="size-2.5" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 wrap-anywhere font-mono font-normal">
        {repository.label ?? "Private"}
      </span>
      {isPrivate ? null : (
        <span className="sr-only"> (opens on GitHub in a new tab)</span>
      )}
    </Identity>
  );
}

function DiffCounters({
  facts,
}: Readonly<{
  facts: Pick<PublicGitHubWorkUnitFacts, "additions" | "deletions">;
}>) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
      <span className="text-[light-dark(oklch(0.48_0.12_155),oklch(0.75_0.13_155))]">
        <span className="sr-only">Added </span>+
        {countFormatter.format(facts.additions)}
      </span>
      <span className="text-[light-dark(oklch(0.52_0.16_25),oklch(0.76_0.13_25))]">
        <span className="sr-only">Deleted </span>−
        {countFormatter.format(facts.deletions)}
      </span>
    </span>
  );
}

function WorkUnitFacts({
  facts,
}: Readonly<{ facts: PublicGitHubWorkUnitFacts }>) {
  const commits = `${countFormatter.format(facts.ownedCommitCount)} ${facts.ownedCommitCount === 1 ? "commit" : "commits"}`;
  const files = `${countFormatter.format(facts.uniqueFileCount)} ${facts.uniqueFileCount === 1 ? "file" : "files"}`;
  return (
    <div className="site-row-meta flex min-h-6 shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums flex-wrap justify-start">
      <span>
        {commits} · {files}
      </span>
      <span className="inline-flex sm:hidden">
        <DiffCounters facts={facts} />
      </span>
      {facts.languages?.map((language) => (
        <LanguageIcon key={language} language={language} />
      ))}
    </div>
  );
}

function WorkUnitRow({
  item,
}: Readonly<{ item: PublicGitHubWorkUnitActivity }>) {
  const headline = item.headline ?? workUnitLabels[item.kind];
  return (
    <Collapsible
      analytics={{ section: "work", item_kind: item.kind }}
      className="min-w-0"
      render={<li />}
    >
      <TooltipTrigger
        payload={
          <TooltipContent
            className="space-y-2"
            preview
            side="left"
            sideOffset={24}
            align="start"
          >
            <p className="font-medium">{headline}</p>
            {item.summary === null ? null : (
              <p className="text-muted-foreground">{item.summary}</p>
            )}
            <WorkUnitFacts facts={item.facts} />
          </TooltipContent>
        }
        render={
          <CollapsibleTrigger className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group cursor-pointer" />
        }
      >
        <span className="min-w-0 truncate font-normal [.site-row[aria-expanded]_&]:[interpolate-size:allow-keywords] [.site-row[aria-expanded='false']_&]:block-lh [.site-row[aria-expanded]_&]:[transition:block-size_240ms_var(--ease-settle)] [.site-row[aria-expanded='true']_&]:wrap-anywhere [.site-row[aria-expanded='true']_&]:whitespace-normal [.site-row[aria-expanded='true']_&]:block-auto motion-reduce:[.site-row[aria-expanded]_&]:transition-none group-hover:underline">
          {headline}
        </span>
        <span className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
          <span className="hidden sm:inline-flex">
            <DiffCounters facts={item.facts} />
          </span>
          <LocalDateTime
            className="whitespace-nowrap"
            dateTime={item.activityAt}
            format="time"
          />
          <DisclosureChevron />
        </span>
      </TooltipTrigger>
      <CollapsibleContent hiddenUntilFound>
        <div className="space-y-2 pb-2.5 text-muted-foreground">
          {item.summary === null ? null : (
            <p className="wrap-anywhere">{item.summary}</p>
          )}
          <WorkUnitFacts facts={item.facts} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function IssueRow({
  item,
}: Readonly<{
  item: Extract<PublicGitHubActivityItem, { kind: "issue-opened" }>;
}>) {
  const Row = item.destination === null ? "div" : "a";
  return (
    <li>
      <Row
        className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group"
        href={item.destination?.url}
        rel={item.destination === null ? undefined : "noopener noreferrer"}
        target={item.destination === null ? undefined : "_blank"}
        title={item.title}
      >
        <span className="min-w-0 truncate font-normal [.site-row[aria-expanded]_&]:[interpolate-size:allow-keywords] [.site-row[aria-expanded='false']_&]:block-lh [.site-row[aria-expanded]_&]:[transition:block-size_240ms_var(--ease-settle)] [.site-row[aria-expanded='true']_&]:wrap-anywhere [.site-row[aria-expanded='true']_&]:whitespace-normal [.site-row[aria-expanded='true']_&]:block-auto motion-reduce:[.site-row[aria-expanded]_&]:transition-none group-hover:underline">
          {item.title}
        </span>
        <span className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
          <LocalDateTime
            className="whitespace-nowrap"
            dateTime={item.activityAt}
            format="time"
          />
          <CircleDot aria-hidden="true" className="size-4" />
        </span>
      </Row>
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
  itemLimit,
}: Readonly<{
  group: PublicGitHubActivityRepositoryGroup;
  itemLimit?: number;
}>) {
  const visibleItems =
    itemLimit === undefined ? group.items : group.items.slice(0, itemLimit);
  const hiddenItems = group.items.slice(visibleItems.length);
  return (
    <li className="pt-4">
      <h4 className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <RepositoryIdentity repository={group.repository} />
      </h4>
      <ol className="divide-y divide-border">
        {visibleItems.map((item) => (
          <ActivityItem item={item} key={item.id} />
        ))}
      </ol>
      {hiddenItems.length === 0 ? null : (
        <Collapsible>
          <CollapsibleContent>
            <ol className="divide-y divide-border border-t border-border">
              {hiddenItems.map((item) => (
                <ActivityItem item={item} key={item.id} />
              ))}
            </ol>
          </CollapsibleContent>
          <CollapsibleTrigger className="site-row grid min-h-11 w-full grid-cols-[minmax(0,max-content)_auto] items-start justify-start gap-x-1.5 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group/more cursor-pointer pt-0">
            <span className="min-w-0 truncate font-normal [.site-row[aria-expanded]_&]:[interpolate-size:allow-keywords] [.site-row[aria-expanded='false']_&]:block-lh [.site-row[aria-expanded]_&]:[transition:block-size_240ms_var(--ease-settle)] [.site-row[aria-expanded='true']_&]:wrap-anywhere [.site-row[aria-expanded='true']_&]:whitespace-normal [.site-row[aria-expanded='true']_&]:block-auto motion-reduce:[.site-row[aria-expanded]_&]:transition-none text-muted-foreground">
              <span className="group-data-panel-open/more:hidden">
                Show {countFormatter.format(hiddenItems.length)} more
              </span>
              <span className="hidden group-data-panel-open/more:inline">
                Show less
              </span>
            </span>
            <span className="site-row-meta flex translate-y-px min-h-6 shrink-0 items-center justify-end text-sm text-muted-foreground tabular-nums">
              <DisclosureChevron />
            </span>
          </CollapsibleTrigger>
        </Collapsible>
      )}
    </li>
  );
}

function GitHubActivityDay({
  day,
  itemLimit,
}: Readonly<{ day: PublicGitHubActivityDay; itemLimit?: number }>) {
  const repositoryCount = day.repositories.length;
  const workUnits = day.repositories
    .flatMap(({ items }) => items)
    .filter((item) => item.kind !== "issue-opened");
  const commitCount = workUnits.reduce(
    (total, item) => total + item.facts.ownedCommitCount,
    0
  );
  const additions = workUnits.reduce(
    (total, item) => total + item.facts.additions,
    0
  );
  const deletions = workUnits.reduce(
    (total, item) => total + item.facts.deletions,
    0
  );
  return (
    <section aria-labelledby={`activity-day-${day.day}`}>
      <header className="site-row min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring flex flex-wrap rounded-none border-y border-border py-2">
        <h3 className="site-row-meta flex min-h-6 shrink-0 items-center gap-1 text-sm text-muted-foreground tabular-nums justify-start font-medium sm:gap-2">
          <time
            className="font-sans font-normal"
            dateTime={day.day}
            id={`activity-day-${day.day}`}
          >
            {formatDate(day.day, "weekday")}
          </time>
          <span title={`Days are grouped in ${WORK_LOG_TIME_ZONE}`}>
            {WORK_LOG_TIME_ZONE}
          </span>
        </h3>
        <dl
          aria-label={`Totals for ${day.day}`}
          className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums ms-auto whitespace-nowrap"
        >
          <div>
            <dt className="sr-only">Commits across repositories</dt>
            <dd>
              {countFormatter.format(commitCount)}{" "}
              {commitCount === 1 ? "commit" : "commits"} across{" "}
              {countFormatter.format(repositoryCount)}{" "}
              {repositoryCount === 1 ? "repo" : "repos"}
            </dd>
          </div>
          <div className="hidden sm:block">
            <dt className="sr-only">Authored line churn</dt>
            <dd>
              <DiffCounters facts={{ additions, deletions }} />
            </dd>
          </div>
        </dl>
      </header>
      <ol aria-label={`Activity for ${day.day}`}>
        {day.repositories.map((group) => (
          <RepositoryGroup
            group={group}
            itemLimit={itemLimit}
            key={group.repository.key}
          />
        ))}
      </ol>
    </section>
  );
}

export function GitHubActivityDays({
  days,
  itemLimit,
  preview = false,
  now,
}: Readonly<{
  days: readonly PublicGitHubActivityDay[];
  itemLimit?: number;
  preview?: boolean;
  now: string;
}>) {
  const localDays = localizeGitHubActivityDays(days, WORK_LOG_TIME_ZONE);
  const today = dateKey(now, WORK_LOG_TIME_ZONE);
  const activeDays = getVisibleGitHubActivityDays(localDays, today);
  const visibleDays = preview ? activeDays.slice(0, 1) : activeDays;
  return (
    <TooltipGroup>
      {visibleDays.map((day) => (
        <GitHubActivityDay day={day} itemLimit={itemLimit} key={day.day} />
      ))}
    </TooltipGroup>
  );
}
