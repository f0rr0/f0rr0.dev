"use client";

import {
  CircleDot,
  CircleCheck,
  CircleSlash,
  FolderGit2,
  LockKeyhole,
} from "lucide-react";
import Image from "next/image";

import { DateTime } from "@/components/date-time";
import { LanguageIcon } from "@/components/language-icon";
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
import { sitePreferences } from "@/content/site";
import { dateKey, formatDate } from "@/lib/date";
import { getVisibleGitHubActivityDays } from "@/lib/github-activity-feed-core";
import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
  PublicGitHubActivityRepository,
  PublicGitHubActivityRepositoryGroup,
  PublicGitHubWorkUnitActivity,
  GitHubPullRequestDisplay,
} from "@/lib/github-activity-types";
import { githubIconPaths } from "@/lib/github-icons";

const countFormatter = new Intl.NumberFormat("en-US");
const workUnitLabels = {
  branch: "Branch work",
  "canonical-day": "Repository updates",
  "pull-request": "Pull request",
} as const;

const statusColor = (status: string) => {
  if (status === "merged" || status === "completed") {
    return "text-[light-dark(oklch(0.5_0.18_300),oklch(0.76_0.13_300))]";
  }
  if (status === "open") {
    return "text-[light-dark(oklch(0.48_0.12_155),oklch(0.75_0.13_155))]";
  }
  if (status === "closed") {
    return "text-[light-dark(oklch(0.52_0.16_25),oklch(0.76_0.13_25))]";
  }
  return "text-muted-foreground";
};

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
  facts: NonNullable<GitHubPullRequestDisplay["diff"]>;
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
  item,
}: Readonly<{ item: PublicGitHubWorkUnitActivity }>) {
  const { facts } = item;
  const commits = `${countFormatter.format(facts.ownedCommitCount)} ${facts.ownedCommitCount === 1 ? "commit" : "commits"}`;
  const files = `${countFormatter.format(facts.uniqueFileCount)} ${facts.uniqueFileCount === 1 ? "file" : "files"}`;
  return (
    <div className="site-row-meta flex min-h-6 shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums flex-wrap justify-start">
      <span>
        {commits} · {files}
      </span>
      <span className="inline-flex sm:hidden">
        {item.pullRequest?.diff ? (
          <DiffCounters facts={item.pullRequest.diff} />
        ) : null}
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
  const headline =
    item.headline ?? item.pullRequest?.title ?? workUnitLabels[item.kind];
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
            <WorkUnitFacts item={item} />
          </TooltipContent>
        }
        render={
          <CollapsibleTrigger className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group cursor-pointer" />
        }
      >
        <span className="min-w-0 font-normal disclosure-title group-hover:underline">
          {headline}
        </span>
        <span className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
          <span className="hidden sm:inline-flex">
            {item.pullRequest?.diff ? (
              <DiffCounters facts={item.pullRequest.diff} />
            ) : null}
          </span>
          {item.kind === "pull-request" && item.pullRequest ? (
            <span
              title={`Pull request ${item.pullRequest.status}`}
              className={statusColor(item.pullRequest.status)}
            >
              <svg
                aria-hidden="true"
                className="size-4"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d={githubIconPaths[item.pullRequest.status]} />
              </svg>
              <span className="sr-only">
                Pull request {item.pullRequest.status}
              </span>
            </span>
          ) : null}
          <DateTime
            className="whitespace-nowrap"
            dateTime={item.activityAt}
            format="time"
            timeZone={sitePreferences.timeZone}
          />
          <DisclosureChevron />
        </span>
      </TooltipTrigger>
      <CollapsibleContent hiddenUntilFound>
        <div className="space-y-2 pb-2.5 text-muted-foreground">
          {item.summary === null ? null : (
            <p className="wrap-anywhere">{item.summary}</p>
          )}
          <WorkUnitFacts item={item} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function IssueRow({
  item,
}: Readonly<{
  item: Extract<PublicGitHubActivityItem, { kind: "issue" }>;
}>) {
  const Row = item.destination === null ? "div" : "a";
  const status = item.status ?? "open";
  const Icon =
    status === "open"
      ? CircleDot
      : status === "completed"
        ? CircleCheck
        : CircleSlash;
  const label =
    status === "not-planned"
      ? "Issue closed as not planned"
      : `Issue ${status}`;
  return (
    <li>
      <Row
        className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group"
        href={item.destination?.url}
        rel={item.destination === null ? undefined : "noopener noreferrer"}
        target={item.destination === null ? undefined : "_blank"}
        title={item.title}
      >
        <span className="min-w-0 truncate font-normal group-hover:underline">
          {item.title}
        </span>
        <span className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums">
          <span title={label} className={statusColor(status)}>
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{label}</span>
          </span>
          <DateTime
            className="whitespace-nowrap"
            dateTime={item.activityAt}
            format="time"
            timeZone={sitePreferences.timeZone}
          />
        </span>
      </Row>
    </li>
  );
}

function ActivityItem({ item }: Readonly<{ item: PublicGitHubActivityItem }>) {
  return item.kind === "issue" ? (
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
            <span className="min-w-0 truncate font-normal text-muted-foreground">
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
  const workUnits = day.repositories.flatMap(({ items }) => items);
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
        </h3>
        <dl
          aria-label={`Updates for ${day.day}`}
          className="site-row-meta flex min-h-6 shrink-0 items-center justify-end gap-2 text-sm text-muted-foreground tabular-nums ms-auto whitespace-nowrap"
        >
          <div>
            <dt className="sr-only">Updates across repositories</dt>
            <dd>
              {countFormatter.format(workUnits.length)}{" "}
              {workUnits.length === 1 ? "update" : "updates"} across{" "}
              {countFormatter.format(repositoryCount)}{" "}
              {repositoryCount === 1 ? "repo" : "repos"}
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
  const today = dateKey(now);
  const activeDays = getVisibleGitHubActivityDays(days, today);
  const visibleDays = preview ? activeDays.slice(0, 1) : activeDays;
  return (
    <TooltipGroup>
      {visibleDays.map((day) => (
        <GitHubActivityDay day={day} itemLimit={itemLimit} key={day.day} />
      ))}
    </TooltipGroup>
  );
}
