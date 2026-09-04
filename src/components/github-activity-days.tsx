import { ChevronRight, CircleDot, Code2, LockKeyhole } from "lucide-react";
import Image from "next/image";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const countFormatter = new Intl.NumberFormat("en-US");
const workUnitLabels = {
  branch: "Active branch work",
  "canonical-day": "Direct canonical-branch work",
  "pull-request": "Pull request",
} as const;

const languageIconSlugs: Readonly<Record<string, string>> = {
  C: "c",
  "C#": "sharp",
  "C++": "cplusplus",
  CSS: "css",
  Dart: "dart",
  Elixir: "elixir",
  "F#": "fsharp",
  Go: "go",
  GraphQL: "graphql",
  HTML: "html5",
  Java: "openjdk",
  JavaScript: "javascript",
  Kotlin: "kotlin",
  Lua: "lua",
  MDX: "mdx",
  PHP: "php",
  "Protocol Buffers": "protobuf",
  Python: "python",
  R: "r",
  Ruby: "ruby",
  Rust: "rust",
  SCSS: "sass",
  SQL: "postgresql",
  Scala: "scala",
  Shell: "gnubash",
  Svelte: "svelte",
  Swift: "swift",
  TypeScript: "typescript",
  Vue: "vuedotjs",
  Zig: "zig",
};

function RepositoryIdentity({
  repository,
}: Readonly<{ repository: PublicGitHubActivityRepository }>) {
  if (repository.label === null || repository.url === null) {
    return (
      <span className="inline-flex min-h-[1.375rem] min-w-0 items-center gap-2.5 font-mono text-xs text-muted-foreground">
        {repository.avatarUrl === null ? (
          <LockKeyhole aria-hidden="true" className="size-3" />
        ) : (
          <span
            aria-hidden="true"
            className="relative size-[1.375rem] flex-none"
          >
            <span className="block size-full overflow-hidden rounded-full bg-muted">
              <Image
                alt=""
                className="size-full object-cover blur-[2px]"
                height={22}
                sizes="22px"
                src={repository.avatarUrl}
                unoptimized
                width={22}
              />
            </span>
            <span className="absolute -right-[0.175rem] -bottom-[0.175rem] grid size-3.5 place-items-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_1px_var(--background)]">
              <LockKeyhole className="size-2.5" />
            </span>
          </span>
        )}
        <span className="min-w-0 wrap-anywhere">
          {repository.label ?? "Private"}
        </span>
      </span>
    );
  }
  return (
    <a
      className="inline-flex min-h-[1.375rem] min-w-0 items-center gap-2.5 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring motion-reduce:transition-none"
      href={repository.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {repository.avatarUrl === null ? null : (
        <span
          aria-hidden="true"
          className="size-[1.375rem] flex-none overflow-hidden rounded-full bg-muted"
        >
          <Image
            alt=""
            className="size-full object-cover"
            height={22}
            sizes="22px"
            src={repository.avatarUrl}
            unoptimized
            width={22}
          />
        </span>
      )}
      <span className="min-w-0 wrap-anywhere">{repository.label}</span>
      <span className="sr-only"> (opens on GitHub in a new tab)</span>
    </a>
  );
}

function DiffCounters({
  facts,
}: Readonly<{ facts: PublicGitHubWorkUnitFacts }>) {
  return (
    <span className="mt-[0.3125rem] inline-flex items-center gap-2 font-mono text-[0.6875rem] text-muted-foreground">
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

function WorkUnitDetails({
  item,
}: Readonly<{ item: PublicGitHubWorkUnitActivity }>) {
  const headline = item.headline ?? workUnitLabels[item.kind];
  const commits = `${countFormatter.format(item.facts.ownedCommitCount)} ${item.facts.ownedCommitCount === 1 ? "commit" : "commits"}`;
  const files = `${countFormatter.format(item.facts.uniqueFileCount)} ${item.facts.uniqueFileCount === 1 ? "file" : "files"}`;
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger className="group/details grid min-h-6 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-3 text-start text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="truncate text-base leading-relaxed group-data-panel-open/details:overflow-visible group-data-panel-open/details:wrap-anywhere group-data-panel-open/details:text-clip group-data-panel-open/details:whitespace-normal">
          {headline}
        </span>
        <DiffCounters facts={item.facts} />
        <span className="mt-[0.3125rem] inline-flex items-center gap-1 text-muted-foreground">
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform duration-150 group-data-panel-open/details:rotate-90 motion-reduce:transition-none"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent hiddenUntilFound>
        <div className="max-w-[50rem] pt-2 ps-0 text-sm leading-relaxed text-muted-foreground">
          {item.summary === null ? null : (
            <p className="wrap-anywhere">{item.summary}</p>
          )}
          <p className={item.summary === null ? undefined : "mt-2"}>
            {commits} touching {files}
            {item.facts.languages === null ||
            item.facts.languages.length === 0 ? null : (
              <TooltipProvider>
                <span
                  aria-label="Languages"
                  className="relative -top-[0.5px] ms-1.5 inline-flex items-center gap-0.5 align-middle"
                  role="group"
                >
                  {item.facts.languages.map((language) => {
                    const slug = languageIconSlugs[language];
                    return (
                      <Tooltip key={language}>
                        <TooltipTrigger
                          render={
                            <button
                              aria-label={language}
                              className="inline-flex size-6 cursor-help items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                              type="button"
                            />
                          }
                        >
                          {slug === undefined ? (
                            <Code2 aria-hidden="true" className="size-3.5" />
                          ) : (
                            <Image
                              alt=""
                              className="size-3.5 opacity-[0.82] dark:invert"
                              height={14}
                              sizes="14px"
                              src={`https://cdn.jsdelivr.net/npm/simple-icons@16.12.0/icons/${slug}.svg`}
                              unoptimized
                              width={14}
                            />
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {language}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </span>
              </TooltipProvider>
            )}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function WorkUnitRow({
  item,
}: Readonly<{ item: PublicGitHubWorkUnitActivity }>) {
  return (
    <li className="py-1.5">
      <article>
        <WorkUnitDetails item={item} />
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
    <li className="py-1.5">
      <article className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <p className="max-w-[50rem] wrap-anywhere text-base leading-relaxed text-foreground">
          {item.title}
        </p>
        {item.destination === null ? null : (
          <a
            aria-label={`Issue opened: ${item.destination.label}`}
            className="mt-0.5 inline-flex size-6 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
            href={item.destination.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <CircleDot aria-hidden="true" className="size-4" />
          </a>
        )}
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
  itemLimit,
}: Readonly<{
  group: PublicGitHubActivityRepositoryGroup;
  itemLimit?: number;
}>) {
  const visibleItems =
    itemLimit === undefined ? group.items : group.items.slice(0, itemLimit);
  const hiddenItems = group.items.slice(visibleItems.length);
  return (
    <li className="pt-4 pb-1.5 first:pt-0 last:pb-0">
      <article aria-label={`${group.repository.label ?? "Private"} activity`}>
        <header className="flex">
          <RepositoryIdentity repository={group.repository} />
        </header>
        <ol className="pt-2.5">
          {visibleItems.map((item) => (
            <ActivityItem item={item} key={item.id} />
          ))}
        </ol>
        {hiddenItems.length === 0 ? null : (
          <Collapsible>
            <CollapsibleContent>
              <ol>
                {hiddenItems.map((item) => (
                  <ActivityItem item={item} key={item.id} />
                ))}
              </ol>
            </CollapsibleContent>
            <CollapsibleTrigger className="group/more inline-flex min-h-8 items-center gap-1.5 font-ui text-[0.8125rem] text-muted-foreground transition-colors duration-150 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none">
              <ChevronRight
                aria-hidden="true"
                className="-ms-1.5 size-4 transition-transform duration-150 group-data-panel-open/more:rotate-90 motion-reduce:transition-none"
              />
              <span className="group-data-panel-open/more:hidden">
                Show {countFormatter.format(hiddenItems.length)} more
              </span>
              <span className="hidden group-data-panel-open/more:inline">
                Show less
              </span>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </article>
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
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-y border-border py-3">
        <h3 className="font-mono text-[0.6875rem] font-medium tracking-[0.11em] text-muted-foreground uppercase">
          <time dateTime={day.day} id={`activity-day-${day.day}`}>
            {dayFormatter.format(new Date(`${day.day}T00:00:00.000Z`))}
          </time>
        </h3>
        <dl
          aria-label={`Totals for ${day.day}`}
          className="ms-auto flex flex-wrap items-center justify-end gap-x-3 font-mono text-[0.6875rem] text-muted-foreground"
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
          <div>
            <dt className="sr-only">Authored line churn</dt>
            <dd className="inline-flex items-center gap-2">
              <span className="text-[light-dark(oklch(0.48_0.12_155),oklch(0.75_0.13_155))]">
                <span className="sr-only">Added </span>+
                {countFormatter.format(additions)}
              </span>
              <span className="text-[light-dark(oklch(0.52_0.16_25),oklch(0.76_0.13_25))]">
                <span className="sr-only">Deleted </span>−
                {countFormatter.format(deletions)}
              </span>
            </dd>
          </div>
        </dl>
      </header>
      <ol aria-label={`Activity for ${day.day}`} className="mt-7">
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
}: Readonly<{
  days: readonly PublicGitHubActivityDay[];
  itemLimit?: number;
}>) {
  return days.map((day) => (
    <GitHubActivityDay day={day} itemLimit={itemLimit} key={day.day} />
  ));
}
