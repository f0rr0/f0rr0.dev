import { setTimeout as delay } from "node:timers/promises";

import {
  fetchGitHub,
  GitHubRequestDeadlineError,
  GitHubResponseError,
  githubApiUrl,
  nextGitHubPage,
} from "@/lib/github-api";
import {
  commitShaFrom,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type {
  GitHubCommit,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import { persistGitHubCommitReferences } from "@/lib/github-commits-store";
import type { GitHubRepositoryRefSnapshot } from "@/lib/github-commits-store";
import {
  collectAccessibleGitHubRepositories,
  collectGitHubRepositoryRefs,
} from "@/lib/github-reconciliation";

const DEADLINE_MARGIN_MS = 30_000;
const GITHUB_PAGE_SIZE = 100;
const PERSISTENCE_BATCH_SIZE = 1000;
const RATE_LIMIT_RESET_PADDING_MS = 1000;
const PERMANENT_RESOURCE_STATUSES = new Set([403, 404, 410, 422]);

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const repositoryApiPath = (repository: string, suffix: string) => {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new TypeError("GitHub returned an invalid repository name.");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
};

const deadlineReached = (deadlineAt: number) =>
  Date.now() + DEADLINE_MARGIN_MS >= deadlineAt;

const permanentlyUnavailableResource = (error: unknown) =>
  error instanceof GitHubResponseError &&
  !error.retryable &&
  PERMANENT_RESOURCE_STATUSES.has(error.status);

const withRateLimitWait = async <Value>(
  operation: () => Promise<Value>,
  input: {
    deadlineAt: number;
    onRateLimitWait?: (retryAt: Date) => void;
  }
) => {
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof GitHubResponseError) ||
        !error.retryable ||
        error.retryAt === null
      ) {
        throw error;
      }
      const waitMilliseconds = Math.max(
        0,
        error.retryAt.getTime() - Date.now() + RATE_LIMIT_RESET_PADDING_MS
      );
      if (
        Date.now() + waitMilliseconds + DEADLINE_MARGIN_MS >=
        input.deadlineAt
      ) {
        throw error;
      }
      input.onRateLimitWait?.(error.retryAt);
      await delay(waitMilliseconds);
    }
  }
};

const commitReferenceFrom = (
  value: unknown,
  account: TrackedGitHubAccount,
  repository: GitHubRepositoryFacts
) => {
  if (!isObject(value) || !isObject(value.commit)) {
    throw new TypeError("GitHub returned an invalid commit page.");
  }
  const sha = commitShaFrom(value.sha);
  const returnedAuthor = isObject(value.author)
    ? trackedGitHubAccountFrom(value.author.login)
    : null;
  if (
    sha === null ||
    (value.author !== null && returnedAuthor !== account) ||
    !isObject(value.commit.committer) ||
    typeof value.commit.committer.date !== "string" ||
    typeof value.commit.message !== "string"
  ) {
    throw new TypeError("GitHub returned an invalid filtered commit.");
  }
  const committedAt = new Date(value.commit.committer.date);
  if (Number.isNaN(committedAt.getTime())) {
    throw new TypeError("GitHub returned an invalid commit timestamp.");
  }
  const message = (value.commit.message.split(/\r?\n/, 1)[0] ?? "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return {
    author: account,
    committedAt: committedAt.toISOString(),
    message,
    repository: repository.fullName,
    repositoryId: repository.id,
    sha,
    url: `https://github.com/${repository.fullName}/commit/${sha}`,
  } satisfies GitHubCommit;
};

const validateNextCommitPage = (
  next: URL,
  currentPage: number,
  input: {
    account: TrackedGitHubAccount;
    headSha: string;
    repository: GitHubRepositoryFacts;
    sinceAt: Date;
    untilAt: Date;
  }
) => {
  const expectedPath = repositoryApiPath(input.repository.fullName, "/commits");
  if (
    next.pathname !== expectedPath ||
    next.searchParams.get("author") !== input.account ||
    next.searchParams.get("page") !== String(currentPage + 1) ||
    next.searchParams.get("per_page") !== String(GITHUB_PAGE_SIZE) ||
    next.searchParams.get("sha") !== input.headSha ||
    next.searchParams.get("since") !== input.sinceAt.toISOString() ||
    next.searchParams.get("until") !== input.untilAt.toISOString()
  ) {
    throw new TypeError("GitHub returned invalid commit pagination.");
  }
};

export const collectGitHubCommitsFromHead = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  headSha: string;
  onRateLimitWait?: (retryAt: Date) => void;
  repository: GitHubRepositoryFacts;
  sinceAt: Date;
  token: string;
  untilAt: Date;
}) => {
  let page = 1;
  let url: URL | null = githubApiUrl(
    repositoryApiPath(input.repository.fullName, "/commits")
  );
  url.searchParams.set("author", input.account);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("sha", input.headSha);
  url.searchParams.set("since", input.sinceAt.toISOString());
  url.searchParams.set("until", input.untilAt.toISOString());
  const commits: GitHubCommit[] = [];
  const seenPages = new Set<string>();
  let pages = 0;

  while (url !== null) {
    if (deadlineReached(input.deadlineAt)) {
      throw new GitHubRequestDeadlineError();
    }
    if (seenPages.has(url.href)) {
      throw new TypeError("GitHub returned cyclic commit pagination.");
    }
    seenPages.add(url.href);
    const requestUrl = url;
    const response = await withRateLimitWait(
      async () =>
        await fetchGitHub(requestUrl, {
          deadlineAt: input.deadlineAt,
          token: input.token,
        }),
      input
    );
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new TypeError("GitHub returned an invalid commit page.");
    }
    for (const value of payload) {
      const commit = commitReferenceFrom(
        value,
        input.account,
        input.repository
      );
      const committedAt = new Date(commit.committedAt).getTime();
      if (
        committedAt >= input.sinceAt.getTime() &&
        committedAt <= input.untilAt.getTime()
      ) {
        commits.push(commit);
      }
    }
    pages += 1;
    const next = nextGitHubPage(response);
    if (next !== null) {
      validateNextCommitPage(next, page, input);
      page += 1;
    }
    url = next;
  }
  return { commits, pages };
};

export const distinctGitHubCurrentRefHeads = (
  refs: readonly GitHubRepositoryRefSnapshot[]
) => {
  const distinct = new Map<string, string>();
  for (const ref of refs.toSorted((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "head" ? -1 : 1;
    }
    return left.refName < right.refName
      ? -1
      : left.refName > right.refName
        ? 1
        : 0;
  })) {
    if (!distinct.has(ref.headSha)) {
      distinct.set(ref.headSha, ref.refName);
    }
  }
  return [...distinct].map(([headSha, refName]) => ({ headSha, refName }));
};

export type GitHubDirectBackfillStopReason =
  | "complete"
  | "deadline"
  | "provider_retry";

export interface GitHubDirectBackfillResult {
  complete: boolean;
  duplicateCommits: number;
  duplicateReachability: number;
  heads: number;
  insertedCommits: number;
  pages: number;
  refs: number;
  repositories: number;
  retryAt: Date | null;
  stopReason: GitHubDirectBackfillStopReason;
  unavailableRepositories: number;
  uniqueCommits: number;
}

const emptyResult = (): GitHubDirectBackfillResult => ({
  complete: true,
  duplicateCommits: 0,
  duplicateReachability: 0,
  heads: 0,
  insertedCommits: 0,
  pages: 0,
  refs: 0,
  repositories: 0,
  retryAt: null,
  stopReason: "complete",
  unavailableRepositories: 0,
  uniqueCommits: 0,
});

const stoppedResult = (result: GitHubDirectBackfillResult, error: unknown) => {
  if (error instanceof GitHubRequestDeadlineError) {
    return { ...result, complete: false, stopReason: "deadline" as const };
  }
  if (error instanceof GitHubResponseError && error.retryable) {
    return {
      ...result,
      complete: false,
      retryAt: error.retryAt,
      stopReason: "provider_retry" as const,
    };
  }
  throw error;
};

/**
 * Discovers tracked commits directly from every distinct current ref head.
 * Refs are inventoried once for the whole requested window; heads precede tags
 * and all traversal is deterministic so an idempotent rerun repeats safely.
 */
export const backfillGitHubCommitsFromCurrentRefs = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  onRateLimitWait?: (retryAt: Date) => void;
  repositoryId: string | null;
  sinceAt: Date;
  token: string;
  untilAt: Date;
}): Promise<GitHubDirectBackfillResult> => {
  if (
    Number.isNaN(input.sinceAt.getTime()) ||
    Number.isNaN(input.untilAt.getTime()) ||
    input.sinceAt > input.untilAt
  ) {
    throw new RangeError("The GitHub direct backfill window is invalid.");
  }
  const result = emptyResult();
  const buffered: GitHubCommit[] = [];
  const seenCommits = new Set<string>();
  const flush = async () => {
    if (buffered.length === 0) {
      return;
    }
    const persisted = await persistGitHubCommitReferences({
      commits: buffered.splice(0),
    });
    result.insertedCommits += persisted.inserted;
    result.duplicateCommits += persisted.duplicates;
  };

  try {
    const repositories = await withRateLimitWait(
      async () =>
        await collectAccessibleGitHubRepositories(
          input.token,
          input.repositoryId,
          { deadlineAt: input.deadlineAt, pushedSinceAt: input.sinceAt }
        ),
      input
    );
    for (const repository of repositories) {
      if (deadlineReached(input.deadlineAt)) {
        throw new GitHubRequestDeadlineError();
      }
      let refs: readonly GitHubRepositoryRefSnapshot[] | null;
      try {
        refs = await withRateLimitWait(
          async () =>
            await collectGitHubRepositoryRefs(repository, input.token, {
              deadlineAt: input.deadlineAt,
            }),
          input
        );
      } catch (error) {
        if (permanentlyUnavailableResource(error)) {
          result.unavailableRepositories += 1;
          continue;
        }
        throw error;
      }
      if (refs === null) {
        result.unavailableRepositories += 1;
        continue;
      }
      result.repositories += 1;
      result.refs += refs.length;
      const distinctHeads = distinctGitHubCurrentRefHeads(refs);
      let repositoryHasUnavailableHead = false;
      for (const { headSha } of distinctHeads) {
        if (deadlineReached(input.deadlineAt)) {
          throw new GitHubRequestDeadlineError();
        }
        let page: Awaited<ReturnType<typeof collectGitHubCommitsFromHead>>;
        try {
          page = await collectGitHubCommitsFromHead({
            ...input,
            headSha,
            repository,
          });
        } catch (error) {
          if (permanentlyUnavailableResource(error)) {
            if (!repositoryHasUnavailableHead) {
              repositoryHasUnavailableHead = true;
              result.unavailableRepositories += 1;
            }
            continue;
          }
          throw error;
        }
        result.heads += 1;
        result.pages += page.pages;
        for (const commit of page.commits) {
          const identity = `${commit.repositoryId}:${commit.sha}`;
          if (seenCommits.has(identity)) {
            result.duplicateReachability += 1;
            continue;
          }
          seenCommits.add(identity);
          buffered.push(commit);
          result.uniqueCommits += 1;
          if (buffered.length >= PERSISTENCE_BATCH_SIZE) {
            await flush();
          }
        }
      }
    }
    await flush();
    return result;
  } catch (error) {
    await flush();
    return stoppedResult(result, error);
  }
};
