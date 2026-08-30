import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { env } from "@/env";
import {
  formatPublicCommitSummaryMarkdown,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_RECIPE,
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
export const GITHUB_ACTIVITY_FALLBACK_SUMMARY_MODEL = "deterministic";
export const GITHUB_ACTIVITY_FALLBACK_SUMMARY_RECIPE =
  "commit-message-summary-v1";
const GITHUB_FILE_PAGE_SIZE = 100;
const MAXIMUM_GITHUB_FILE_PAGES = 30;
const GITHUB_PULL_REQUEST_COMMIT_LIMIT = 250;
const GITHUB_GRAPHQL_NODE_BATCH_SIZE = 100;
const GITHUB_GRAPHQL_SECONDARY_LIMIT_WAIT_MS = 60_000;
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
  commits: readonly GitHubCommit[];
  membershipComplete: boolean;
  pullRequest: GitHubPullRequest;
}

export interface GitHubActivityPullRequestMembershipSource {
  commitShas: readonly string[];
  commits: readonly GitHubCommit[];
  membershipComplete: boolean;
}

export interface GitHubActivityPullRequestSnapshot {
  expectedCommitCount: number;
  pullRequest: GitHubPullRequest;
}

export interface GitHubProviderRequestOptions {
  deadlineAt?: number;
}

export class ActivityProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ActivityProcessingError";
    this.code = code;
  }
}

export type GitHubGraphQlResponseErrorKind =
  | "invalid_response"
  | "partial_response"
  | "rate_limited"
  | "request_failed"
  | "request_rejected"
  | "unresolved_merge_commit";

// oxlint-disable-next-line max-classes-per-file -- This provider error carries retry metadata across worker boundaries.
export class GitHubGraphQlResponseError extends ActivityProcessingError {
  readonly kind: GitHubGraphQlResponseErrorKind;
  readonly retryable: boolean;
  readonly retryAt: Date | null;

  constructor(
    kind: GitHubGraphQlResponseErrorKind,
    options: { retryable: boolean; retryAt?: Date | null }
  ) {
    super(
      options.retryable ? "source_incomplete" : "source_invalid",
      kind === "rate_limited"
        ? "GitHub GraphQL is rate limited."
        : kind === "unresolved_merge_commit"
          ? "GitHub has not returned an authoritative pull request merge commit."
          : "GitHub returned an unusable GraphQL response."
    );
    this.name = "GitHubGraphQlResponseError";
    this.kind = kind;
    this.retryable = options.retryable;
    this.retryAt = options.retryAt ?? null;
  }
}

export interface GitHubPullRequestMergeCommitResolution {
  mergeCommitSha: string | null;
  nodeId: string;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const retryAtFromHeaders = (headers: Headers, now = Date.now()) => {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter !== undefined && retryAfter !== "") {
    if (/^\d+$/.test(retryAfter)) {
      const timestamp = now + Number(retryAfter) * 1000;
      if (Number.isFinite(timestamp) && timestamp <= 8_640_000_000_000_000) {
        return new Date(timestamp);
      }
    }
    const parsed = new Date(retryAfter);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const reset = headers.get("x-ratelimit-reset")?.trim();
  if (reset !== undefined && /^\d+$/.test(reset)) {
    const timestamp = Number(reset) * 1000;
    if (Number.isFinite(timestamp) && timestamp <= 8_640_000_000_000_000) {
      return new Date(timestamp);
    }
  }
  return null;
};

const graphQlErrorSignals = (
  errors: readonly JsonObject[],
  includeMessages: boolean
) => {
  const signals: string[] = [];
  for (const error of errors) {
    const extensions = isObject(error.extensions) ? error.extensions : null;
    const values = [
      ...(includeMessages ? [error.message] : []),
      error.type,
      extensions?.classification,
      extensions?.code,
      extensions?.type,
    ];
    for (const value of values) {
      if (typeof value === "string") {
        signals.push(value.toUpperCase());
      }
    }
  }
  return signals;
};

const graphQlErrorIsRateLimited = (
  errors: readonly JsonObject[],
  headers: Headers
) => {
  if (
    headers.get("x-ratelimit-remaining")?.trim() === "0" ||
    headers.has("retry-after")
  ) {
    return true;
  }
  return graphQlErrorSignals(errors, true).some(
    (signal) =>
      signal.includes("RATE_LIMIT") ||
      signal.includes("RATE LIMIT") ||
      signal.includes("SECONDARY RATE")
  );
};

const graphQlErrorIsPermanent = (errors: readonly JsonObject[]) => {
  const permanentSignals = [
    "BAD_USER_INPUT",
    "FORBIDDEN",
    "GRAPHQL_VALIDATION_FAILED",
    "NOT_FOUND",
    "UNAUTHORIZED",
    "UNDEFINED_FIELD",
  ];
  const signals = graphQlErrorSignals(errors, false);
  return signals.some((signal) =>
    permanentSignals.some((permanent) => signal.includes(permanent))
  );
};

const graphQlErrorsFrom = (payload: JsonObject) => {
  if (!Object.hasOwn(payload, "errors")) {
    return null;
  }
  if (
    !Array.isArray(payload.errors) ||
    payload.errors.length === 0 ||
    payload.errors.some(
      (item) =>
        !isObject(item) ||
        typeof item.message !== "string" ||
        item.message.length === 0
    )
  ) {
    throw new GitHubGraphQlResponseError("invalid_response", {
      retryable: false,
    });
  }
  return payload.errors as JsonObject[];
};

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
      ? env.GITHUB_F0RR0_TOKEN
      : env.GITHUB_YUPPIESTECHDEV_TOKEN;
  const otherToken =
    account === "f0rr0"
      ? env.GITHUB_YUPPIESTECHDEV_TOKEN
      : env.GITHUB_F0RR0_TOKEN;
  return [
    ...new Set(
      [accountToken, otherToken, env.GITHUB_TOKEN].flatMap((value) => {
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

const fetchJson = async (
  path: string,
  token: string,
  options: GitHubProviderRequestOptions = {}
) => {
  const response = await fetchGitHub(githubApiUrl(path), {
    deadlineAt: options.deadlineAt,
    token,
  });
  return (await response.json()) as unknown;
};

const fetchJsonWithResponse = async (
  url: URL,
  token: string,
  options: GitHubProviderRequestOptions = {}
) => {
  const response = await fetchGitHub(url, {
    deadlineAt: options.deadlineAt,
    token,
  });
  return { payload: (await response.json()) as unknown, response };
};

const PULL_REQUEST_MERGE_COMMITS_QUERY = `query PullRequestMergeCommits($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on PullRequest {
      id
      merged
      mergeCommit { oid }
    }
  }
}`;

const graphQlNodeIdFrom = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 100 &&
  !/\s/u.test(value)
    ? value
    : null;

export const githubGraphQlPayloadFrom = async (response: Response) => {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new GitHubGraphQlResponseError("invalid_response", {
      retryable: false,
    });
  }
  if (!isObject(value)) {
    throw new GitHubGraphQlResponseError("invalid_response", {
      retryable: false,
    });
  }
  const errors = graphQlErrorsFrom(value);
  if (errors !== null) {
    if (graphQlErrorIsRateLimited(errors, response.headers)) {
      throw new GitHubGraphQlResponseError("rate_limited", {
        retryAt:
          retryAtFromHeaders(response.headers) ??
          new Date(Date.now() + GITHUB_GRAPHQL_SECONDARY_LIMIT_WAIT_MS),
        retryable: true,
      });
    }
    const retryable = !graphQlErrorIsPermanent(errors);
    const hasPartialData = Object.hasOwn(value, "data") && value.data !== null;
    throw new GitHubGraphQlResponseError(
      hasPartialData
        ? "partial_response"
        : retryable
          ? "request_failed"
          : "request_rejected",
      { retryable }
    );
  }
  return value;
};

const resolveGitHubPullRequestMergeCommitBatch = async (
  nodeIds: readonly string[],
  token: string,
  options: GitHubProviderRequestOptions
) => {
  const response = await fetchGitHub(githubApiUrl("/graphql"), {
    body: JSON.stringify({
      query: PULL_REQUEST_MERGE_COMMITS_QUERY,
      variables: { ids: nodeIds },
    }),
    deadlineAt: options.deadlineAt,
    method: "POST",
    token,
  });
  const payload = await githubGraphQlPayloadFrom(response);
  const nodes = isObject(payload.data) ? payload.data.nodes : null;
  if (!Array.isArray(nodes) || nodes.length !== nodeIds.length) {
    throw new GitHubGraphQlResponseError("invalid_response", {
      retryable: false,
    });
  }

  const requestedNodeIds = new Set(nodeIds);
  const resolutions = new Map<string, GitHubPullRequestMergeCommitResolution>();
  for (const node of nodes) {
    if (node === null) {
      throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
        retryable: true,
      });
    }
    if (!isObject(node) || node.__typename !== "PullRequest") {
      throw new GitHubGraphQlResponseError("invalid_response", {
        retryable: false,
      });
    }
    const nodeId = graphQlNodeIdFrom(node.id);
    if (
      nodeId === null ||
      !requestedNodeIds.has(nodeId) ||
      resolutions.has(nodeId)
    ) {
      throw new GitHubGraphQlResponseError("invalid_response", {
        retryable: false,
      });
    }
    if (node.merged !== true) {
      throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
        retryable: true,
      });
    }
    if (node.mergeCommit === null) {
      resolutions.set(nodeId, { mergeCommitSha: null, nodeId });
      continue;
    }
    const mergeCommitSha = isObject(node.mergeCommit)
      ? commitShaFrom(node.mergeCommit.oid)
      : null;
    if (mergeCommitSha === null) {
      throw new GitHubGraphQlResponseError("invalid_response", {
        retryable: false,
      });
    }
    resolutions.set(nodeId, { mergeCommitSha, nodeId });
  }
  if (resolutions.size !== requestedNodeIds.size) {
    throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
      retryable: true,
    });
  }
  return nodeIds.map((nodeId) => {
    const resolution = resolutions.get(nodeId);
    if (resolution === undefined) {
      throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
        retryable: true,
      });
    }
    return resolution;
  });
};

/** Resolves only GitHub's authoritative post-merge commit identity. */
export const resolveGitHubPullRequestMergeCommits = async (
  rawNodeIds: readonly string[],
  token: string,
  options: GitHubProviderRequestOptions = {}
): Promise<readonly GitHubPullRequestMergeCommitResolution[]> => {
  const nodeIds = [...new Set(rawNodeIds)];
  if (
    rawNodeIds.some((nodeId) => graphQlNodeIdFrom(nodeId) === null) ||
    nodeIds.length !== rawNodeIds.length
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The GitHub pull request node IDs are invalid."
    );
  }
  const resolutions: GitHubPullRequestMergeCommitResolution[] = [];
  for (
    let offset = 0;
    offset < nodeIds.length;
    offset += GITHUB_GRAPHQL_NODE_BATCH_SIZE
  ) {
    resolutions.push(
      ...(await resolveGitHubPullRequestMergeCommitBatch(
        nodeIds.slice(offset, offset + GITHUB_GRAPHQL_NODE_BATCH_SIZE),
        token,
        options
      ))
    );
  }
  return resolutions;
};

const withAuthoritativeMergeCommits = async (
  pullRequests: readonly GitHubPullRequest[],
  token: string,
  options: GitHubProviderRequestOptions = {}
) => {
  const merged = pullRequests.filter((pullRequest) => pullRequest.merged);
  if (merged.length === 0) {
    return pullRequests;
  }
  const resolutions = await resolveGitHubPullRequestMergeCommits(
    merged.map((pullRequest) => pullRequest.nodeId),
    token,
    options
  );
  const mergeCommitShas = new Map(
    resolutions.map(({ mergeCommitSha, nodeId }) => [nodeId, mergeCommitSha])
  );
  return pullRequests.map((pullRequest) => {
    if (!pullRequest.merged) {
      return pullRequest;
    }
    const mergeCommitSha = mergeCommitShas.get(pullRequest.nodeId);
    if (!mergeCommitShas.has(pullRequest.nodeId)) {
      throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
        retryable: true,
      });
    }
    return { ...pullRequest, mergeCommitSha };
  });
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
  token: string,
  options: GitHubProviderRequestOptions = {}
): Promise<GitHubActivityCommitSource> => {
  const repositoryPayload = await fetchJson(
    repositoryApiPath(row.repository),
    token,
    options
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
      token,
      options
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
  row: GitHubActivityCommitReference,
  options: GitHubProviderRequestOptions = {}
) =>
  await withGitHubTokenCandidate(
    row.author,
    async (token) => await fetchCommitSourceWithToken(row, token, options)
  );

interface GitHubCommitComparisonReference {
  baseSha: string;
  expectedCommitCount: number | null;
  headSha: string;
  repository: GitHubRepository;
}

const commitComparisonPath = (
  comparison: GitHubCommitComparisonReference,
  repositoryPath: string
) =>
  `${repositoryPath}/compare/${encodeURIComponent(
    comparison.baseSha
  )}...${encodeURIComponent(comparison.headSha)}`;

const validateNextCommitComparisonPage = (
  next: URL,
  currentPage: number,
  comparison: GitHubCommitComparisonReference
) => {
  const namedPath = commitComparisonPath(
    comparison,
    repositoryApiPath(comparison.repository.fullName, "")
  );
  const numericPath = commitComparisonPath(
    comparison,
    `/repositories/${encodeURIComponent(comparison.repository.id)}`
  );
  if (
    (next.pathname !== namedPath && next.pathname !== numericPath) ||
    next.searchParams.get("page") !== String(currentPage + 1) ||
    next.searchParams.get("per_page") !== "100" ||
    next.searchParams.size !== 2
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned invalid commit comparison pagination."
    );
  }
};

// oxlint-disable-next-line eslint/complexity -- Every comparison pagination invariant is validated fail-closed.
const commitComparisonValuesWithToken = async (
  comparison: GitHubCommitComparisonReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
) => {
  const values: unknown[] = [];
  let url: URL | null = githubApiUrl(
    commitComparisonPath(
      comparison,
      repositoryApiPath(comparison.repository.fullName, "")
    )
  );
  url.searchParams.set("per_page", "100");
  const visited = new Set<string>();
  const seenShas = new Set<string>();
  let aheadBy: number | null = null;
  let page = 1;
  let totalCommits: number | null = null;
  while (url !== null) {
    if (visited.has(url.href)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned cyclic compare pagination."
      );
    }
    visited.add(url.href);
    const result = await fetchJsonWithResponse(url, token, options);
    const pageValues = isObject(result.payload) ? result.payload.commits : null;
    const pageAheadBy = isObject(result.payload)
      ? requiredInteger(result.payload.ahead_by, "compare ahead count")
      : null;
    const pageTotalCommits = isObject(result.payload)
      ? requiredInteger(result.payload.total_commits, "compare commit count")
      : null;
    if (
      !Array.isArray(pageValues) ||
      pageAheadBy === null ||
      pageTotalCommits === null ||
      (aheadBy !== null && aheadBy !== pageAheadBy) ||
      (totalCommits !== null && totalCommits !== pageTotalCommits) ||
      pageAheadBy !== pageTotalCommits
    ) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid commit comparison evidence."
      );
    }
    aheadBy = pageAheadBy;
    totalCommits = pageTotalCommits;
    const previousSize = seenShas.size;
    for (const value of pageValues) {
      const sha = isObject(value) ? commitShaFrom(value.sha) : null;
      if (sha === null || seenShas.has(sha)) {
        throw new ActivityProcessingError(
          "source_invalid",
          "GitHub returned invalid commit comparison members."
        );
      }
      seenShas.add(sha);
    }
    values.push(...pageValues);
    const next = nextGitHubPage(result.response);
    if (next !== null) {
      validateNextCommitComparisonPage(next, page, comparison);
      if (seenShas.size === previousSize || values.length >= pageTotalCommits) {
        throw new ActivityProcessingError(
          "source_invalid",
          "GitHub returned inconsistent commit comparison pagination."
        );
      }
      page += 1;
    }
    url = next;
    if (
      values.length > pageTotalCommits ||
      (comparison.expectedCommitCount !== null &&
        values.length > comparison.expectedCommitCount)
    ) {
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub returned more commits than the expected comparison recorded."
      );
    }
  }

  if (
    aheadBy === null ||
    totalCommits === null ||
    values.length !== aheadBy ||
    values.length !== totalCommits ||
    (comparison.expectedCommitCount !== null &&
      values.length !== comparison.expectedCommitCount)
  ) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "GitHub did not return the complete commit comparison."
    );
  }
  return values;
};

const compareCommitValuesWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
) =>
  await commitComparisonValuesWithToken(
    {
      baseSha: row.beforeSha,
      expectedCommitCount: row.expectedCommitCount,
      headSha: row.afterSha,
      repository: repositoryReferenceFrom(row),
    },
    token,
    options
  );

// GitHub cannot compare the all-zero SHA used for a new branch. GraphQL's
// cursor lets us request exactly the observed number of commits when legacy
// payloads include it, or reachable history back to the account's fixed
// timeline boundary for sparse Events and newly observed refs.
// oxlint-disable-next-line complexity -- Every GraphQL history invariant fails closed.
const newBranchCommitValuesWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
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
              committedDate
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
      deadlineAt: options.deadlineAt,
      method: "POST",
      token,
    });
    const payload = await githubGraphQlPayloadFrom(response);
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
          committer: { date: node.committedDate },
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
  token: string,
  options: GitHubProviderRequestOptions = {}
) => {
  if (row.beforeSha === ZERO_SHA) {
    return await newBranchCommitValuesWithToken(row, token, options);
  }
  try {
    return await compareCommitValuesWithToken(row, token, options);
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
        token,
        options
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
  const rawDate = isObject(rawCommit?.committer)
    ? rawCommit.committer.date
    : isObject(rawCommit?.author)
      ? rawCommit.author.date
      : null;
  const providerDate =
    typeof rawDate === "string" ? new Date(rawDate) : new Date(Number.NaN);
  if (Number.isNaN(providerDate.getTime())) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid commit timestamp."
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

const trackedCommitFromPullRequestValue = (
  value: unknown,
  sha: string,
  repository: GitHubRepository
) => {
  if (!isObject(value)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid pull request commit."
    );
  }
  const author = isObject(value.author)
    ? trackedGitHubAccountFrom(value.author.login)
    : null;
  if (author === null) {
    return null;
  }
  if (!isObject(value.commit)) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned incomplete tracked pull request commit evidence."
    );
  }
  // Backfill window semantics and final activity ordering both use the
  // committer timestamp; author identity remains the top-level user.
  return trackedCommitFromPushValue(value, sha, repository);
};

const pushObservationSourceWithToken = async (
  row: GitHubActivityPushObservationReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
): Promise<GitHubActivityPushObservationSource> => {
  const repository = repositoryReferenceFrom(row);
  const values = await pushCommitValuesWithToken(row, token, options);
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
  row: GitHubActivityPushObservationReference,
  options: GitHubProviderRequestOptions = {}
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) => await pushObservationSourceWithToken(row, token, options)
  );

const fetchAssociatedPullRequestsWithToken = async (
  row: GitHubActivityCommitReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
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
  const seenPages = new Set<string>();

  while (url !== null) {
    if (seenPages.has(url.href)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned cyclic associated pull request pagination."
      );
    }
    seenPages.add(url.href);
    const result = await fetchJsonWithResponse(url, token, options);
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
      if (pullRequest === null) {
        throw new ActivityProcessingError(
          "source_invalid",
          "GitHub returned an invalid associated pull request."
        );
      }
      pullRequests.set(pullRequest.nodeId, pullRequest);
    }
    url = nextGitHubPage(result.response);
  }
  const resolved = await withAuthoritativeMergeCommits(
    [...pullRequests.values()],
    token,
    options
  );
  return resolved.toSorted((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? -1 : 1;
    }
    return left.number - right.number;
  });
};

export const fetchGitHubAssociatedPullRequests = async (
  row: GitHubActivityCommitReference,
  options: GitHubProviderRequestOptions = {}
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
      const visible = await fetchAssociatedPullRequestsWithToken(
        row,
        token,
        options
      );
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

/**
 * Reads the versioned REST snapshot without claiming merge-SHA authority.
 * A merged snapshot can contain `mergeCommitSha: undefined` under REST 2026.
 */
export const fetchGitHubPullRequestRestSnapshotWithToken = async (
  row: GitHubActivityPullRequestReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
): Promise<GitHubActivityPullRequestSnapshot> => {
  const repository = repositoryReferenceFrom(row);
  const pullRequestPath = repositoryApiPath(
    repository.fullName,
    `/pulls/${String(row.number)}`
  );
  const root = await fetchJson(pullRequestPath, token, options);
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

const fetchPullRequestSnapshotWithToken = async (
  row: GitHubActivityPullRequestReference,
  token: string,
  options: GitHubProviderRequestOptions = {}
): Promise<GitHubActivityPullRequestSnapshot> => {
  const snapshot = await fetchGitHubPullRequestRestSnapshotWithToken(
    row,
    token,
    options
  );
  const [resolved] = await withAuthoritativeMergeCommits(
    [snapshot.pullRequest],
    token,
    options
  );
  if (resolved === undefined) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid pull request snapshot."
    );
  }
  return {
    expectedCommitCount: snapshot.expectedCommitCount,
    pullRequest: resolved,
  };
};

const pullRequestMembershipFromValues = (
  values: readonly unknown[],
  expectedCommitCount: number,
  commitRepository: GitHubRepository,
  expectedHeadSha: string | null,
  paginationComplete = true
): GitHubActivityPullRequestMembershipSource => {
  const commitShas: string[] = [];
  const commits: GitHubCommit[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const sha = isObject(value) ? commitShaFrom(value.sha) : null;
    if (sha === null) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned an invalid pull request commit."
      );
    }
    if (seen.has(sha)) {
      continue;
    }
    seen.add(sha);
    commitShas.push(sha);
    const commit = trackedCommitFromPullRequestValue(
      value,
      sha,
      commitRepository
    );
    if (commit !== null) {
      commits.push(commit);
    }
  }
  return {
    commitShas,
    commits,
    membershipComplete:
      paginationComplete &&
      commitShas.length === expectedCommitCount &&
      (expectedHeadSha === null ||
        expectedCommitCount === 0 ||
        commitShas.at(-1) === expectedHeadSha),
  };
};

const pullRequestMembershipFromComparison = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number,
  token: string,
  commitRepository: GitHubRepository,
  expectedBaseSha: string,
  expectedHeadSha: string,
  options: GitHubProviderRequestOptions
) => {
  const values = await commitComparisonValuesWithToken(
    {
      baseSha: expectedBaseSha,
      expectedCommitCount,
      headSha: expectedHeadSha,
      repository: repositoryReferenceFrom(row),
    },
    token,
    options
  );
  const membership = pullRequestMembershipFromValues(
    values,
    expectedCommitCount,
    commitRepository,
    expectedHeadSha
  );
  if (!membership.membershipComplete) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "GitHub returned ambiguous pull request comparison evidence."
    );
  }
  return membership;
};

export const fetchGitHubPullRequestMembershipWithToken = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number,
  token: string,
  options: {
    commitRepository?: GitHubRepository;
    deadlineAt?: number;
    expectedBaseSha?: string;
    expectedHeadSha?: string;
  } = {}
): Promise<GitHubActivityPullRequestMembershipSource> => {
  const repository = repositoryReferenceFrom(row);
  const commitRepository = options.commitRepository ?? repository;
  if (!Number.isSafeInteger(expectedCommitCount) || expectedCommitCount < 0) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The expected GitHub pull request commit count is invalid."
    );
  }
  const expectedBaseSha =
    options.expectedBaseSha === undefined
      ? null
      : commitShaFrom(options.expectedBaseSha);
  const expectedHeadSha =
    options.expectedHeadSha === undefined
      ? null
      : commitShaFrom(options.expectedHeadSha);
  if (
    (options.expectedBaseSha !== undefined && expectedBaseSha === null) ||
    (options.expectedHeadSha !== undefined && expectedHeadSha === null)
  ) {
    throw new ActivityProcessingError(
      "source_invalid",
      "The expected GitHub pull request comparison is invalid."
    );
  }
  if (
    expectedCommitCount > GITHUB_PULL_REQUEST_COMMIT_LIMIT &&
    expectedBaseSha !== null &&
    expectedHeadSha !== null
  ) {
    return await pullRequestMembershipFromComparison(
      row,
      expectedCommitCount,
      token,
      commitRepository,
      expectedBaseSha,
      expectedHeadSha,
      options
    );
  }
  const pullRequestPath = repositoryApiPath(
    repository.fullName,
    `/pulls/${String(row.number)}`
  );
  let url: URL | null = githubApiUrl(`${pullRequestPath}/commits`);
  url.searchParams.set("per_page", "100");
  const values: unknown[] = [];

  for (
    let page = 0;
    url !== null && page < Math.ceil(GITHUB_PULL_REQUEST_COMMIT_LIMIT / 100);
    page += 1
  ) {
    const result = await fetchJsonWithResponse(url, token, options);
    if (!Array.isArray(result.payload)) {
      throw new ActivityProcessingError(
        "source_invalid",
        "GitHub returned invalid pull request commits."
      );
    }
    values.push(...result.payload);
    url = nextGitHubPage(result.response);
  }

  const membership = pullRequestMembershipFromValues(
    values,
    expectedCommitCount,
    commitRepository,
    expectedHeadSha,
    url === null
  );
  return membership.membershipComplete ||
    expectedBaseSha === null ||
    expectedHeadSha === null
    ? membership
    : await pullRequestMembershipFromComparison(
        row,
        expectedCommitCount,
        token,
        commitRepository,
        expectedBaseSha,
        expectedHeadSha,
        options
      );
};

export const fetchGitHubPullRequestSnapshot = async (
  row: GitHubActivityPullRequestReference,
  options: GitHubProviderRequestOptions = {}
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) =>
      await fetchPullRequestSnapshotWithToken(row, token, options)
  );

export const fetchGitHubPullRequestMembership = async (
  row: GitHubActivityPullRequestReference,
  expectedCommitCount: number,
  options: {
    commitRepository?: GitHubRepository;
    deadlineAt?: number;
    expectedBaseSha?: string;
    expectedHeadSha?: string;
  } = {}
) =>
  await withGitHubTokenCandidate(
    row.account,
    async (token) =>
      await fetchGitHubPullRequestMembershipWithToken(
        row,
        expectedCommitCount,
        token,
        options
      )
  );

export const fetchGitHubPullRequestSource = async (
  row: GitHubActivityPullRequestReference,
  options: GitHubProviderRequestOptions = {}
) => {
  const snapshot = await fetchGitHubPullRequestSnapshot(row, options);
  const membership = await fetchGitHubPullRequestMembership(
    row,
    snapshot.expectedCommitCount,
    {
      commitRepository:
        snapshot.pullRequest.headRepository ??
        snapshot.pullRequest.baseRepository,
      deadlineAt: options.deadlineAt,
      expectedBaseSha: snapshot.pullRequest.baseSha,
      expectedHeadSha: snapshot.pullRequest.headSha,
    }
  );
  return { ...membership, pullRequest: snapshot.pullRequest };
};

const directlyOwnedRepository = (source: GitHubActivityCommitSource) =>
  trackedGitHubAccountFrom(source.repository.ownerLogin) !== null;

const MAXIMUM_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647;

const abortSignalBefore = (deadlineAt: number) => {
  const remaining = Math.floor(deadlineAt - Date.now());
  if (!Number.isFinite(deadlineAt) || deadlineAt < 0 || remaining <= 0) {
    return null;
  }
  return AbortSignal.timeout(
    Math.min(remaining, MAXIMUM_ABORT_SIGNAL_TIMEOUT_MS)
  );
};

const generateCommitSummary = async (
  source: GitHubActivityCommitSource,
  options: GitHubProviderRequestOptions
) => {
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
  const { deadlineAt } = options;
  const abortSignal =
    deadlineAt === undefined ? null : abortSignalBefore(deadlineAt);
  if (deadlineAt !== undefined && abortSignal === null) {
    throw new ActivityProcessingError(
      "worker_deadline",
      "The activity-summary deadline was reached."
    );
  }
  const result = await generateText({
    ...(abortSignal === null ? {} : { abortSignal }),
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

const conventionalCommitPrefix =
  /^(?:revert:\s*)?(?:build|chore|ci|docs|feat|fix|perf|refactor|style|test)(?:\([^\r\n)]*\))?!?:\s*/iu;

const deterministicCommitSummary = (source: GitHubActivityCommitSource) => {
  const firstLine = source.commit.message.split(/\r?\n/u, 1)[0] ?? "";
  const unprefixed = firstLine.replace(conventionalCommitPrefix, "").trim();
  const normalized = (unprefixed || "Updated the repository")
    .replaceAll(/\s+/gu, " ")
    .slice(0, 240);
  const headline = normalized.replace(/^([a-z])/u, (first) =>
    first.toUpperCase()
  );
  const summary = formatPublicCommitSummaryMarkdown(
    { headline, short: headline },
    source.commit
  );
  const inputHash = createHash("sha256")
    .update(GITHUB_ACTIVITY_FALLBACK_SUMMARY_RECIPE)
    .update("\n")
    .update(source.commit.sha)
    .update("\n")
    .update(source.commit.message)
    .digest("hex");
  return {
    inputHash,
    model: GITHUB_ACTIVITY_FALLBACK_SUMMARY_MODEL,
    recipe: GITHUB_ACTIVITY_FALLBACK_SUMMARY_RECIPE,
    summary,
  };
};

export const generateValidatedGitHubActivitySummary = async (
  source: GitHubActivityCommitSource,
  options: GitHubProviderRequestOptions = {}
) => {
  // Private patches never leave the application. The deterministic path also
  // keeps publication independent of optional model credentials and uptime.
  if (
    source.repository.private ||
    (env.OPENAI_API_KEY?.trim().length ?? 0) === 0
  ) {
    return deterministicCommitSummary(source);
  }
  let generated: Awaited<ReturnType<typeof generateCommitSummary>>;
  try {
    generated = await generateCommitSummary(source, options);
  } catch {
    return deterministicCommitSummary(source);
  }
  let summary;
  try {
    summary = formatPublicCommitSummaryMarkdown(
      parseCommitPublicSummary(generated.text),
      source.commit
    );
  } catch {
    return deterministicCommitSummary(source);
  }
  return {
    inputHash: generated.inputHash,
    model: GITHUB_ACTIVITY_SUMMARY_MODEL,
    recipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
    summary,
  };
};
