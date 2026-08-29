import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { APICallError, generateText } from "ai";

import {
  formatPublicCommitSummaryMarkdown,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
} from "@/lib/github-activity-public-summary";
import type {
  PublicCommitEvidence,
  PublicCommitFileEvidence,
} from "@/lib/github-activity-public-summary";
import { buildCommitPublicSummaryModelInput } from "@/lib/github-activity-public-summary-input";
import {
  fetchGitHub,
  GitHubResponseError,
  githubApiUrl,
  nextGitHubPage,
} from "@/lib/github-api";
import {
  commitShaFrom,
  pullRequestFromGitHub,
  repositoryFrom,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubRepository,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";

export const GITHUB_ACTIVITY_SUMMARY_MODEL = "gpt-5-nano-2025-08-07";
const GITHUB_FILE_PAGE_SIZE = 100;
const MAXIMUM_GITHUB_FILE_PAGES = 30;
const MAXIMUM_GITHUB_PULL_REQUEST_PAGES = 10;
const MAXIMUM_GITHUB_PULL_REQUEST_COMMIT_PAGES = 3;
const MAXIMUM_GITHUB_PULL_REQUEST_GRAPHQL_PAGES = 30;
const ZERO_SHA = "0".repeat(40);

type JsonObject = Record<string, unknown>;

export interface GitHubActivityRepositoryEvidence {
  avatarUrl: string | null;
  description: string | null;
  fullName: string;
  homepageUrl: string | null;
  ownerLogin: string;
  ownerType: "Organization" | "User";
  private: boolean;
  topics: readonly string[];
}

export interface GitHubActivityCommitSource {
  authorUserId: string;
  authoredAt: string;
  commit: PublicCommitEvidence & { treeSha: string };
  committerAt: string;
  committerUserId: string | null;
  repository: GitHubActivityRepositoryEvidence;
}

export interface GitHubActivityCommitReference {
  author: TrackedGitHubAccount;
  committedAt: string;
  message: string;
  repository: string;
  repositoryId: string;
  sha: string;
}

export interface GitHubActivityPushObservationReference {
  account: TrackedGitHubAccount;
  afterSha: string;
  beforeSha: string;
  expectedCommitCount: number | null;
  historySinceAt: Date;
  historyUntilAt: Date | null;
  knownShas: readonly string[];
  observedAt: Date;
  refName: string;
  repository: string;
  repositoryId: string;
}

export interface GitHubActivityPushObservationSource {
  commitShas: readonly string[];
  commits: readonly GitHubCommit[];
}

export interface GitHubActivityPullRequestReference {
  account: TrackedGitHubAccount;
  number: number;
  repository: string;
  repositoryId: string;
}

export interface GitHubActivityPullRequestSource {
  commitShas: readonly string[];
  membershipComplete: boolean;
  pullRequest: GitHubPullRequest;
}

export interface GitHubActivityPullRequestSnapshot {
  expectedCommitCount: number;
  pullRequest: GitHubPullRequest;
}

export class ActivityProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ActivityProcessingError";
    this.code = code;
  }
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ActivityProcessingError(
      "source_invalid",
      `GitHub returned an invalid ${label}.`
    );
  }
  return value;
};

const requiredText = (value: unknown, label: string) => {
  if (typeof value !== "string") {
    throw new ActivityProcessingError(
      "source_invalid",
      `GitHub returned an invalid ${label}.`
    );
  }
  return value;
};

const requiredInteger = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ActivityProcessingError(
      "source_invalid",
      `GitHub returned invalid ${label}.`
    );
  }
  return Number(value);
};

const requiredProviderId = (value: unknown, label: string) => {
  if (
    (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) &&
    (typeof value !== "string" || !/^[1-9]\d{0,31}$/.test(value))
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      `GitHub returned an invalid ${label}.`
    );
  }
  return String(value);
};

const optionalProviderId = (value: unknown, label: string) =>
  value === null ? null : requiredProviderId(value, label);

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const compareCodeUnitStrings = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

const repositoryApiPath = (repository: string, suffix = "") => {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The stored GitHub repository name is invalid."
    );
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
};

const repositoryReferenceFrom = (row: {
  repository: string;
  repositoryId: string;
}): GitHubRepository => {
  const repository = repositoryFrom({
    full_name: row.repository,
    id: row.repositoryId,
  });
  if (repository === null) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The stored GitHub repository reference is invalid."
    );
  }
  return repository;
};

const tokenCandidatesFor = (account: TrackedGitHubAccount) => {
  const accountToken =
    account === "f0rr0"
      ? process.env.GITHUB_F0RR0_TOKEN
      : process.env.GITHUB_YUPPIESTECHDEV_TOKEN;
  const otherToken =
    account === "f0rr0"
      ? process.env.GITHUB_YUPPIESTECHDEV_TOKEN
      : process.env.GITHUB_F0RR0_TOKEN;
  return [
    ...new Set(
      [accountToken, otherToken, process.env.GITHUB_TOKEN].flatMap((value) => {
        const token = value?.trim();
        return token === undefined || token.length === 0 ? [] : [token];
      })
    ),
  ];
};

const withGitHubTokenCandidate = async <Value>(
  account: TrackedGitHubAccount,
  fetcher: (token: string) => Promise<Value>
) => {
  const tokens = tokenCandidatesFor(account);
  if (tokens.length === 0) {
    throw new ActivityProcessingError(
      "source_auth_missing",
      `No GitHub token is configured for ${account}.`
    );
  }
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await fetcher(token);
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof GitHubResponseError) ||
        ![401, 403, 404].includes(error.status)
      ) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ActivityProcessingError(
        "source_unavailable",
        "No configured GitHub token can read the GitHub source."
      );
};

const fetchJson = async (path: string, token: string) => {
  const response = await fetchGitHub(githubApiUrl(path), { token });
  return (await response.json()) as unknown;
};

const fetchJsonWithResponse = async (url: URL, token: string) => {
  const response = await fetchGitHub(url, { token });
  return { payload: (await response.json()) as unknown, response };
};

const safeAvatarUrl = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "avatars.githubusercontent.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const repositoryEvidenceFrom = (
  value: unknown,
  expectedRepositoryId: string
): GitHubActivityRepositoryEvidence => {
  if (!isObject(value) || !isObject(value.owner)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned invalid repository evidence."
    );
  }
  const repository = repositoryFrom(value);
  const ownerLogin = requiredString(value.owner.login, "repository owner");
  const ownerType = value.owner.type;
  if (
    repository === null ||
    repository.id !== expectedRepositoryId ||
    typeof value.private !== "boolean" ||
    (ownerType !== "Organization" && ownerType !== "User")
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned inconsistent repository evidence."
    );
  }
  return {
    avatarUrl: safeAvatarUrl(value.owner.avatar_url),
    description: optionalString(value.description),
    fullName: repository.fullName,
    homepageUrl: optionalString(value.homepage),
    ownerLogin,
    ownerType,
    private: value.private,
    topics: Array.isArray(value.topics)
      ? value.topics.filter(
          (topic): topic is string =>
            typeof topic === "string" && topic.length > 0
        )
      : [],
  };
};

const fileEvidenceFrom = (value: unknown): PublicCommitFileEvidence => {
  if (!isObject(value)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid changed file."
    );
  }
  return {
    additions: requiredInteger(value.additions, "file additions"),
    deletions: requiredInteger(value.deletions, "file deletions"),
    filename: requiredString(value.filename, "file name"),
    patch: optionalString(value.patch),
    previousFilename: optionalString(value.previous_filename),
    status: requiredString(value.status, "file status"),
  };
};

const commitEvidenceFrom = (
  root: JsonObject,
  files: readonly PublicCommitFileEvidence[],
  providerFileCapReached: boolean,
  expected: GitHubActivityCommitReference
): PublicCommitEvidence & { treeSha: string } => {
  if (
    !isObject(root.commit) ||
    !isObject(root.commit.author) ||
    !isObject(root.commit.committer) ||
    !isObject(root.commit.tree) ||
    !isObject(root.author) ||
    !isObject(root.stats)
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned incomplete commit evidence."
    );
  }
  const sha = requiredString(root.sha, "commit SHA").toLowerCase();
  const author = trackedGitHubAccountFrom(root.author.login);
  if (sha !== expected.sha || author !== expected.author) {
    throw new ActivityProcessingError(
      "provenance_changed",
      "The live GitHub commit no longer matches stored provenance."
    );
  }
  const authoredAt = new Date(
    requiredString(root.commit.author.date, "commit author date")
  );
  const committerAt = new Date(
    requiredString(root.commit.committer.date, "commit committer date")
  );
  if (
    Number.isNaN(authoredAt.getTime()) ||
    Number.isNaN(committerAt.getTime())
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid commit date."
    );
  }
  if (!Array.isArray(root.parents)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned incomplete commit ancestry."
    );
  }
  const parents = root.parents.map((parent) => {
    if (!isObject(parent)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid commit parent."
      );
    }
    const parentSha = commitShaFrom(parent.sha);
    if (parentSha === null) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid commit parent SHA."
      );
    }
    return parentSha;
  });
  const additions = requiredInteger(root.stats.additions, "commit additions");
  const deletions = requiredInteger(root.stats.deletions, "commit deletions");
  const total = requiredInteger(root.stats.total, "commit changed lines");
  if (total !== additions + deletions) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned inconsistent commit statistics."
    );
  }
  const treeSha = requiredString(root.commit.tree.sha, "commit tree SHA");
  if (!/^[a-f0-9]{40}$/.test(treeSha)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid commit tree SHA."
    );
  }
  return {
    committedAt: authoredAt.toISOString(),
    files,
    message: requiredText(root.commit.message, "commit message"),
    parents,
    providerFileCapReached,
    sha,
    stats: { additions, deletions, total },
    treeSha,
  };
};

const fetchCommitSourceWithToken = async (
  row: GitHubActivityCommitReference,
  token: string
): Promise<GitHubActivityCommitSource> => {
  const repositoryPayload = await fetchJson(
    repositoryApiPath(row.repository),
    token
  );
  const repository = repositoryEvidenceFrom(
    repositoryPayload,
    row.repositoryId
  );
  const files = new Map<string, PublicCommitFileEvidence>();
  let root: JsonObject | null = null;
  let providerFileCapReached = false;
  for (let page = 1; page <= MAXIMUM_GITHUB_FILE_PAGES; page += 1) {
    const value = await fetchJson(
      repositoryApiPath(
        repository.fullName,
        `/commits/${encodeURIComponent(row.sha)}?per_page=${GITHUB_FILE_PAGE_SIZE}&page=${page}`
      ),
      token
    );
    if (!isObject(value) || !Array.isArray(value.files)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid commit response."
      );
    }
    root ??= value;
    const pageFiles = value.files.map(fileEvidenceFrom);
    for (const file of pageFiles) {
      files.set(file.filename, file);
    }
    if (pageFiles.length < GITHUB_FILE_PAGE_SIZE) {
      break;
    }
    if (page === MAXIMUM_GITHUB_FILE_PAGES) {
      providerFileCapReached = true;
    }
  }
  if (root === null) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned no commit evidence."
    );
  }
  const commit = commitEvidenceFrom(
    root,
    [...files.values()].toSorted((left, right) =>
      compareCodeUnitStrings(left.filename, right.filename)
    ),
    providerFileCapReached,
    row
  );
  if (
    !isObject(root.author) ||
    !isObject(root.commit) ||
    !isObject(root.commit.committer) ||
    (root.committer !== null && !isObject(root.committer))
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned incomplete commit identity evidence."
    );
  }
  return {
    authorUserId: requiredProviderId(root.author.id, "commit author ID"),
    authoredAt: commit.committedAt,
    commit,
    committerAt: new Date(
      requiredString(root.commit.committer.date, "commit committer date")
    ).toISOString(),
    committerUserId:
      root.committer === null
        ? null
        : optionalProviderId(root.committer.id, "commit committer ID"),
    repository,
  };
};

export const fetchGitHubActivityCommitSource = async (
  row: GitHubActivityCommitReference
) =>
  await withGitHubTokenCandidate(
    row.author,
    async (token) => await fetchCommitSourceWithToken(row, token)
  );

const compareCommitValuesWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string
) => {
  const repository = repositoryReferenceFrom(row);
  const values: unknown[] = [];
  let url: URL | null = githubApiUrl(
    repositoryApiPath(
      repository.fullName,
      `/compare/${encodeURIComponent(row.beforeSha)}...${encodeURIComponent(
        row.afterSha
      )}`
    )
  );
  url.searchParams.set("per_page", "100");
  const visited = new Set<string>();
  let aheadBy: number | null = null;
  while (url !== null) {
    if (visited.has(url.href)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned cyclic compare pagination."
      );
    }
    visited.add(url.href);
    const result = await fetchJsonWithResponse(url, token);
    const pageValues = isObject(result.payload) ? result.payload.commits : null;
    const pageAheadBy = isObject(result.payload)
      ? requiredInteger(result.payload.ahead_by, "compare ahead count")
      : null;
    if (
      !Array.isArray(pageValues) ||
      pageAheadBy === null ||
      (aheadBy !== null && aheadBy !== pageAheadBy)
    ) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid push commit evidence."
      );
    }
    aheadBy = pageAheadBy;
    values.push(...pageValues);
    url = nextGitHubPage(result.response);
    if (
      row.expectedCommitCount !== null &&
      values.length > row.expectedCommitCount
    ) {
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub returned more commits than the durable push observation recorded."
      );
    }
  }

  if (
    aheadBy === null ||
    values.length !== aheadBy ||
    (row.expectedCommitCount !== null &&
      values.length !== row.expectedCommitCount)
  ) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "GitHub did not return the complete pushed commit set."
    );
  }
  return values;
};

// GitHub cannot compare the all-zero SHA used for a new branch. GraphQL's
// cursor lets us request exactly the observed number of commits when legacy
// payloads include it, or reachable history back to the account's fixed
// timeline boundary for sparse Events and newly observed refs.
// oxlint-disable-next-line complexity -- Every GraphQL history invariant fails closed.
const newBranchCommitValuesWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string
) => {
  const { expectedCommitCount } = row;
  const historySinceAt =
    expectedCommitCount === null ? row.historySinceAt.toISOString() : null;
  const historyUntilAt =
    expectedCommitCount === null
      ? (row.historyUntilAt?.toISOString() ?? null)
      : null;
  if (expectedCommitCount !== null && expectedCommitCount < 1) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "A new-branch push has an invalid commit count."
    );
  }
  const [owner, name] = row.repository.split("/");
  if (owner === undefined || name === undefined) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The stored GitHub repository reference is invalid."
    );
  }
  const query = `query NewBranchCommits($owner: String!, $name: String!, $oid: GitObjectID!, $pageSize: Int!, $cursor: String, $since: GitTimestamp, $until: GitTimestamp) {
    repository(owner: $owner, name: $name) {
      object(oid: $oid) {
        ... on Commit {
          history(first: $pageSize, after: $cursor, since: $since, until: $until) {
            nodes {
              oid
              message
              authoredDate
              url
              author { user { login } }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }`;
  const values: unknown[] = [];
  let cursor: string | null = null;
  const visitedCursors = new Set<string>();
  while (true) {
    const pageSize =
      expectedCommitCount === null
        ? 100
        : Math.min(100, expectedCommitCount - values.length);
    const response = await fetchGitHub(githubApiUrl("/graphql"), {
      body: JSON.stringify({
        query,
        variables: {
          cursor,
          name,
          oid: row.afterSha,
          owner,
          pageSize,
          since: historySinceAt,
          until: historyUntilAt,
        },
      }),
      method: "POST",
      token,
    });
    const payload = (await response.json()) as unknown;
    const repository =
      isObject(payload) && isObject(payload.data)
        ? payload.data.repository
        : null;
    const object = isObject(repository) ? repository.object : null;
    const history = isObject(object) ? object.history : null;
    if (
      !isObject(history) ||
      !Array.isArray(history.nodes) ||
      history.nodes.length > pageSize ||
      (expectedCommitCount !== null && history.nodes.length !== pageSize) ||
      !isObject(history.pageInfo) ||
      typeof history.pageInfo.hasNextPage !== "boolean"
    ) {
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub returned incomplete new-branch history."
      );
    }
    if (history.nodes.length === 0) {
      if (
        historySinceAt !== null &&
        expectedCommitCount === null &&
        !history.pageInfo.hasNextPage
      ) {
        break;
      }
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub returned incomplete new-branch history."
      );
    }
    for (const node of history.nodes) {
      if (!isObject(node)) {
        throw new ActivityProcessingError(
          "source_incomplete",
          "GitHub returned an ambiguous new-branch commit."
        );
      }
      const user = isObject(node.author) ? node.author.user : null;
      values.push({
        author: isObject(user) ? { login: user.login } : null,
        commit: {
          author: { date: node.authoredDate },
          message: node.message,
        },
        html_url: node.url,
        sha: node.oid,
      });
    }
    const needsNextPage =
      expectedCommitCount === null
        ? history.pageInfo.hasNextPage
        : values.length < expectedCommitCount;
    if (needsNextPage) {
      const nextCursor = history.pageInfo.endCursor;
      if (
        !history.pageInfo.hasNextPage ||
        typeof nextCursor !== "string" ||
        nextCursor.length === 0 ||
        visitedCursors.has(nextCursor)
      ) {
        throw new ActivityProcessingError(
          "source_incomplete",
          "GitHub ended new-branch history before the observed commit count."
        );
      }
      visitedCursors.add(nextCursor);
      cursor = nextCursor;
    } else {
      break;
    }
  }
  return values.toReversed();
};

const pushCommitValuesWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string
) => {
  if (row.beforeSha === ZERO_SHA) {
    return await newBranchCommitValuesWithToken(row, token);
  }
  try {
    return await compareCommitValuesWithToken(row, token);
  } catch (error) {
    if (
      !(error instanceof GitHubResponseError) ||
      ![404, 409].includes(error.status)
    ) {
      throw error;
    }
    try {
      return await newBranchCommitValuesWithToken(
        { ...row, beforeSha: ZERO_SHA, expectedCommitCount: null },
        token
      );
    } catch {
      // Preserve the response error so token fallback can try another identity.
      throw error;
    }
  }
};

export const validateGitHubPushObservationCommitShas = (
  row: GitHubActivityPushObservationReference,
  commitShas: readonly string[]
) => {
  const emptyRewind =
    commitShas.length === 0 &&
    row.expectedCommitCount === null &&
    row.beforeSha !== ZERO_SHA;
  const emptyBoundedHistory =
    commitShas.length === 0 &&
    row.expectedCommitCount === null &&
    row.beforeSha === ZERO_SHA;
  if (
    (!emptyRewind && !emptyBoundedHistory && commitShas.length === 0) ||
    (row.expectedCommitCount !== null &&
      commitShas.length !== row.expectedCommitCount) ||
    (commitShas.length > 0 &&
      (row.historyUntilAt ?? null) === null &&
      commitShas.at(-1) !== row.afterSha) ||
    new Set(commitShas).size !== commitShas.length ||
    commitShas.some((sha) => commitShaFrom(sha) === null)
  ) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "GitHub returned an ambiguous pushed commit sequence."
    );
  }
  let searchFrom = 0;
  for (const knownSha of row.knownShas) {
    const index = commitShas.indexOf(knownSha, searchFrom);
    if (index === -1) {
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub push expansion contradicted durable commit evidence."
      );
    }
    searchFrom = index + 1;
  }
};

const trackedCommitFromPushValue = (
  value: unknown,
  sha: string,
  repository: GitHubRepository
): GitHubCommit | null => {
  if (!isObject(value)) {
    return null;
  }
  const author = isObject(value.author)
    ? trackedGitHubAccountFrom(value.author.login)
    : null;
  if (author === null) {
    return null;
  }
  const rawCommit = isObject(value.commit) ? value.commit : null;
  const rawDate = isObject(rawCommit?.author)
    ? rawCommit.author.date
    : isObject(rawCommit?.committer)
      ? rawCommit.committer.date
      : null;
  const providerDate =
    typeof rawDate === "string" ? new Date(rawDate) : new Date(Number.NaN);
  if (Number.isNaN(providerDate.getTime())) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid commit author date."
    );
  }
  const message =
    typeof rawCommit?.message === "string"
      ? (rawCommit.message.split(/\r?\n/, 1)[0] ?? "")
          .replaceAll(/\s+/g, " ")
          .trim()
          .slice(0, 240)
      : "";
  return {
    author,
    committedAt: providerDate.toISOString(),
    message,
    repository: repository.fullName,
    repositoryId: repository.id,
    sha,
    url: `https://github.com/${repository.fullName}/commit/${sha}`,
  };
};

const pushObservationSourceWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string
): Promise<GitHubActivityPushObservationSource> => {
  const repository = repositoryReferenceFrom(row);
  const values = await pushCommitValuesWithToken(row, token);
  const commitShas: string[] = [];
  const commits: GitHubCommit[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const sha = isObject(value) ? commitShaFrom(value.sha) : null;
    if (sha === null) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid pushed commit."
      );
    }
    if (seen.has(sha)) {
      continue;
    }
    seen.add(sha);
    commitShas.push(sha);
    const commit = trackedCommitFromPushValue(value, sha, repository);
    if (commit !== null) {
      commits.push(commit);
    }
  }
  validateGitHubPushObservationCommitShas(row, commitShas);
  return { commitShas, commits };
};

export const fetchGitHubPushObservationSource = async (
  row: GitHubActivityPushObservationReference
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) => await pushObservationSourceWithToken(row, token)
  );

const fetchAssociatedPullRequestsWithToken = async (
  row: GitHubActivityCommitReference,
  token: string
) => {
  const repository = repositoryReferenceFrom(row);
  let url: URL | null = githubApiUrl(
    repositoryApiPath(
      repository.fullName,
      `/commits/${encodeURIComponent(row.sha)}/pulls`
    )
  );
  url.searchParams.set("per_page", "100");
  const pullRequests = new Map<string, GitHubPullRequest>();

  for (
    let page = 0;
    url !== null && page < MAXIMUM_GITHUB_PULL_REQUEST_PAGES;
    page += 1
  ) {
    const result = await fetchJsonWithResponse(url, token);
    if (!Array.isArray(result.payload)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid associated pull requests."
      );
    }
    for (const value of result.payload) {
      const baseRepository =
        isObject(value) && isObject(value.base)
          ? repositoryFrom(value.base.repo)
          : null;
      const pullRequest =
        baseRepository === null
          ? null
          : pullRequestFromGitHub(value, baseRepository);
      if (pullRequest !== null) {
        pullRequests.set(pullRequest.nodeId, pullRequest);
      }
    }
    url = nextGitHubPage(result.response);
  }
  if (url !== null) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub associated pull requests exceeded the pagination limit."
    );
  }
  return [...pullRequests.values()].toSorted((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.number - right.number;
  });
};

export const fetchGitHubAssociatedPullRequests = async (
  row: GitHubActivityCommitReference
) => {
  const tokens = tokenCandidatesFor(row.author);
  if (tokens.length === 0) {
    throw new ActivityProcessingError(
      "source_auth_missing",
      `No GitHub token is configured for ${row.author}.`
    );
  }
  const pullRequests = new Map<string, GitHubPullRequest>();
  let successfulTokens = 0;
  let lastError: unknown;
  for (const token of tokens) {
    try {
      const visible = await fetchAssociatedPullRequestsWithToken(row, token);
      successfulTokens += 1;
      for (const pullRequest of visible) {
        pullRequests.set(pullRequest.nodeId, pullRequest);
      }
    } catch (error) {
      lastError = error;
      const hiddenFromToken =
        error instanceof GitHubResponseError &&
        [401, 403, 404].includes(error.status) &&
        !error.retryable;
      if (!hiddenFromToken) {
        throw error;
      }
    }
  }
  if (successfulTokens === 0) {
    throw lastError instanceof Error
      ? lastError
      : new ActivityProcessingError(
          "source_unavailable",
          "No configured GitHub token can inspect associated pull requests."
        );
  }
  return [...pullRequests.values()].toSorted((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.number - right.number;
  });
};

const fetchPullRequestSnapshotWithToken = async (
  row: GitHubActivityPullRequestReference,
  token: string
): Promise<GitHubActivityPullRequestSnapshot> => {
  const repository = repositoryReferenceFrom(row);
  const pullRequestPath = repositoryApiPath(
    repository.fullName,
    `/pulls/${String(row.number)}`
  );
  const root = await fetchJson(pullRequestPath, token);
  const pullRequest = pullRequestFromGitHub(root, repository, "reconciled");
  if (pullRequest === null) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid pull request snapshot."
    );
  }
  if (!isObject(root)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid pull request snapshot."
    );
  }
  const expectedCommitCount = requiredInteger(
    root.commits,
    "pull request commit count"
  );
  return { expectedCommitCount, pullRequest };
};

// oxlint-disable-next-line complexity -- Every GraphQL pagination invariant is validated fail-closed.
const pullRequestCommitShasFromGraphQl = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number,
  token: string
) => {
  const [owner, name] = row.repository.split("/");
  if (owner === undefined || name === undefined) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The stored GitHub repository reference is invalid."
    );
  }
  const query = `query PullRequestCommits($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(first: 100, after: $cursor) {
          totalCount
          nodes { commit { oid } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }`;
  const commitShas: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let hasNextPage = true;
  for (
    let page = 0;
    hasNextPage && page < MAXIMUM_GITHUB_PULL_REQUEST_GRAPHQL_PAGES;
    page += 1
  ) {
    const response = await fetchGitHub(githubApiUrl("/graphql"), {
      body: JSON.stringify({
        query,
        variables: { cursor, name, number: row.number, owner },
      }),
      method: "POST",
      token,
    });
    const payload = (await response.json()) as unknown;
    const repository =
      isObject(payload) && isObject(payload.data)
        ? payload.data.repository
        : null;
    const pullRequest = isObject(repository) ? repository.pullRequest : null;
    const connection = isObject(pullRequest) ? pullRequest.commits : null;
    if (
      !isObject(connection) ||
      !Array.isArray(connection.nodes) ||
      !isObject(connection.pageInfo) ||
      requiredInteger(connection.totalCount, "pull request commit count") !==
        expectedCommitCount ||
      typeof connection.pageInfo.hasNextPage !== "boolean"
    ) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid GraphQL pull request membership."
      );
    }
    for (const node of connection.nodes) {
      const sha =
        isObject(node) && isObject(node.commit)
          ? commitShaFrom(node.commit.oid)
          : null;
      if (sha === null) {
        throw new ActivityProcessingError(
          "source_invalid",
          "GitHub returned an invalid pull request commit."
        );
      }
      if (!seen.has(sha)) {
        seen.add(sha);
        commitShas.push(sha);
      }
    }
    ({ hasNextPage } = connection.pageInfo);
    const nextCursor = connection.pageInfo.endCursor;
    if (
      hasNextPage &&
      (typeof nextCursor !== "string" || nextCursor.length === 0)
    ) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid pull request membership cursor."
      );
    }
    cursor = typeof nextCursor === "string" ? nextCursor : null;
  }
  return {
    commitShas,
    membershipComplete:
      !hasNextPage && commitShas.length === expectedCommitCount,
  };
};

const fetchPullRequestMembershipWithToken = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number,
  token: string
) => {
  const repository = repositoryReferenceFrom(row);
  const pullRequestPath = repositoryApiPath(
    repository.fullName,
    `/pulls/${String(row.number)}`
  );
  let url: URL | null = githubApiUrl(`${pullRequestPath}/commits`);
  url.searchParams.set("per_page", "100");
  const commitShas: string[] = [];
  const seen = new Set<string>();

  for (
    let page = 0;
    url !== null && page < MAXIMUM_GITHUB_PULL_REQUEST_COMMIT_PAGES;
    page += 1
  ) {
    const result = await fetchJsonWithResponse(url, token);
    if (!Array.isArray(result.payload)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid pull request commits."
      );
    }
    for (const value of result.payload) {
      const sha = isObject(value) ? commitShaFrom(value.sha) : null;
      if (sha === null) {
        throw new ActivityProcessingError(
          "source_invalid",
          "GitHub returned an invalid pull request commit."
        );
      }
      if (!seen.has(sha)) {
        seen.add(sha);
        commitShas.push(sha);
      }
    }
    url = nextGitHubPage(result.response);
  }

  const membershipComplete =
    url === null && commitShas.length === expectedCommitCount;
  return membershipComplete
    ? { commitShas, membershipComplete }
    : await pullRequestCommitShasFromGraphQl(row, expectedCommitCount, token);
};

export const fetchGitHubPullRequestSnapshot = async (
  row: GitHubActivityPullRequestReference
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) => await fetchPullRequestSnapshotWithToken(row, token)
  );

export const fetchGitHubPullRequestMembership = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) =>
      await fetchPullRequestMembershipWithToken(row, expectedCommitCount, token)
  );

export const fetchGitHubPullRequestSource = async (
  row: GitHubActivityPullRequestReference
) => {
  const snapshot = await fetchGitHubPullRequestSnapshot(row);
  const membership = await fetchGitHubPullRequestMembership(
    row,
    snapshot.expectedCommitCount
  );
  return { ...membership, pullRequest: snapshot.pullRequest };
};

const directlyOwnedRepository = (source: GitHubActivityCommitSource) =>
  trackedGitHubAccountFrom(source.repository.ownerLogin) !== null;

const generateCommitSummary = async (source: GitHubActivityCommitSource) => {
  const modelInput = await buildCommitPublicSummaryModelInput(source.commit, {
    avatarUrl: source.repository.avatarUrl,
    description: source.repository.description,
    directlyOwned: directlyOwnedRepository(source),
    fullName: source.repository.fullName,
    homepageUrl: source.repository.homepageUrl,
    ownerLogin: source.repository.ownerLogin,
    ownerType: source.repository.ownerType,
    private: source.repository.private,
    topics: source.repository.topics,
  });
  const inputHash = createHash("sha256")
    .update(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT)
    .update("\n")
    .update(modelInput)
    .digest("hex");
  const result = await generateText({
    maxRetries: 0,
    model: openai(GITHUB_ACTIVITY_SUMMARY_MODEL),
    prompt: modelInput,
    providerOptions: {
      openai: {
        reasoningEffort: "minimal",
        store: false,
        textVerbosity: "low",
      },
    },
    system: PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  });
  return { inputHash, text: result.text };
};

const modelFailureCode = (error: unknown) => {
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    return `model_${error.statusCode}`;
  }
  return "model_failed";
};

export const generateValidatedGitHubActivitySummary = async (
  source: GitHubActivityCommitSource
) => {
  let generated: Awaited<ReturnType<typeof generateCommitSummary>>;
  try {
    generated = await generateCommitSummary(source);
  } catch (error) {
    throw new ActivityProcessingError(
      modelFailureCode(error),
      error instanceof Error ? error.message : "The model request failed."
    );
  }
  let summary;
  try {
    summary = formatPublicCommitSummaryMarkdown(
      parseCommitPublicSummary(generated.text),
      source.commit
    );
  } catch (error) {
    throw new ActivityProcessingError(
      "output_invalid",
      error instanceof Error ? error.message : "The model output was invalid."
    );
  }
  return { inputHash: generated.inputHash, summary };
};
