import { createHash, randomUUID } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { APICallError, generateText } from "ai";

import {
  buildCommitPublicSummaryModelInput,
  deriveCommitLanguages,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_MAX_OUTPUT_TOKENS,
  PUBLIC_COMMIT_SUMMARY_RECIPE,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  publicCommitSummaryValidationErrors,
  substantiveCommitLoc,
} from "@/lib/github-activity-public-summary";
import type {
  PublicCommitEvidence,
  PublicCommitFileEvidence,
} from "@/lib/github-activity-public-summary";
import {
  claimPendingGitHubActivity,
  completeGitHubActivity,
  failGitHubActivity,
} from "@/lib/github-activity-store";
import type { ClaimedGitHubActivityCommit } from "@/lib/github-activity-store";
import {
  fetchGitHub,
  GitHubResponseError,
  githubApiUrl,
} from "@/lib/github-api";
import {
  repositoryFrom,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";

export const GITHUB_ACTIVITY_SUMMARY_MODEL = "gpt-5-nano-2025-08-07";
export const DEFAULT_GITHUB_ACTIVITY_PROCESSING_BATCH_SIZE = 8;
const GITHUB_ACTIVITY_PROCESSING_CONCURRENCY = 2;
const GITHUB_FILE_PAGE_SIZE = 100;
const MAXIMUM_GITHUB_FILE_PAGES = 30;

type JsonObject = Record<string, unknown>;

interface RepositoryEvidence {
  avatarUrl: string | null;
  fullName: string;
  ownerLogin: string;
  ownerType: "Organization" | "User";
  private: boolean;
}

export interface GitHubActivityCommitSource {
  commit: PublicCommitEvidence;
  repository: RepositoryEvidence;
}

class ActivityProcessingError extends Error {
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

const requiredInteger = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ActivityProcessingError(
      "source_invalid",
      `GitHub returned invalid ${label}.`
    );
  }
  return Number(value);
};

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

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

const fetchJson = async (path: string, token: string) => {
  const response = await fetchGitHub(githubApiUrl(path), { token });
  return (await response.json()) as unknown;
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
): RepositoryEvidence => {
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
    fullName: repository.fullName,
    ownerLogin,
    ownerType,
    private: value.private,
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
  expected: ClaimedGitHubActivityCommit
): PublicCommitEvidence => {
  if (
    !isObject(root.commit) ||
    !isObject(root.commit.author) ||
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
  const committedAt = new Date(
    requiredString(root.commit.author.date, "commit date")
  );
  if (Number.isNaN(committedAt.getTime())) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned an invalid commit date."
    );
  }
  const parents = Array.isArray(root.parents)
    ? root.parents.map((parent) => {
        if (!isObject(parent)) {
          throw new ActivityProcessingError(
            "source_invalid",
            "GitHub returned an invalid commit parent."
          );
        }
        return requiredString(parent.sha, "parent SHA").toLowerCase();
      })
    : [];
  const additions = requiredInteger(root.stats.additions, "commit additions");
  const deletions = requiredInteger(root.stats.deletions, "commit deletions");
  const total = requiredInteger(root.stats.total, "commit changed lines");
  if (total !== additions + deletions) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned inconsistent commit statistics."
    );
  }
  return {
    committedAt: committedAt.toISOString(),
    files,
    message: requiredString(root.commit.message, "commit message"),
    parents,
    sha,
    stats: { additions, deletions, total },
  };
};

const fetchCommitSourceWithToken = async (
  row: ClaimedGitHubActivityCommit,
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
      throw new ActivityProcessingError(
        "source_too_large",
        "The commit exceeded GitHub's file pagination budget."
      );
    }
  }
  if (root === null) {
    throw new ActivityProcessingError(
      "source_invalid",
      "GitHub returned no commit evidence."
    );
  }
  return {
    commit: commitEvidenceFrom(
      root,
      [...files.values()].toSorted((left, right) =>
        left.filename.localeCompare(right.filename)
      ),
      row
    ),
    repository,
  };
};

export const fetchGitHubActivityCommitSource = async (
  row: ClaimedGitHubActivityCommit
) => {
  const tokens = tokenCandidatesFor(row.author);
  if (tokens.length === 0) {
    throw new ActivityProcessingError(
      "source_auth_missing",
      `No GitHub token is configured for ${row.author}.`
    );
  }
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await fetchCommitSourceWithToken(row, token);
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
        "No configured GitHub token can read the commit."
      );
};

const generateCommitSummary = async (commit: PublicCommitEvidence) => {
  const modelInput = buildCommitPublicSummaryModelInput(commit);
  const inputHash = createHash("sha256")
    .update(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT)
    .update("\n")
    .update(modelInput)
    .digest("hex");
  const result = await generateText({
    maxOutputTokens: PUBLIC_COMMIT_SUMMARY_MAX_OUTPUT_TOKENS,
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

const processClaimedCommit = async (row: ClaimedGitHubActivityCommit) => {
  try {
    const source = await fetchGitHubActivityCommitSource(row);
    let generated: Awaited<ReturnType<typeof generateCommitSummary>>;
    try {
      generated = await generateCommitSummary(source.commit);
    } catch (error) {
      throw new ActivityProcessingError(
        modelFailureCode(error),
        error instanceof Error ? error.message : "The model request failed."
      );
    }
    let summary;
    try {
      summary = parseCommitPublicSummary(generated.text);
    } catch (error) {
      throw new ActivityProcessingError(
        "output_invalid",
        error instanceof Error ? error.message : "The model output was invalid."
      );
    }
    const directlyOwned =
      trackedGitHubAccountFrom(source.repository.ownerLogin) !== null;
    const validationErrors = publicCommitSummaryValidationErrors(
      summary,
      source.commit,
      source.repository.private && !directlyOwned
        ? {
            organizationLogin: source.repository.ownerLogin,
            privateRepositoryFullName: source.repository.fullName,
          }
        : {}
    );
    if (validationErrors.length > 0) {
      throw new ActivityProcessingError(
        "output_disclosure",
        validationErrors.join(" ")
      );
    }
    await completeGitHubActivity(row, {
      activityPublicId: randomUUID(),
      additions: source.commit.stats.additions,
      changedFiles: source.commit.files.length,
      deletions: source.commit.stats.deletions,
      languages: deriveCommitLanguages(source.commit.files),
      repository: source.repository.fullName,
      repositoryOwnerAvatarUrl: source.repository.avatarUrl,
      repositoryOwnerLogin: source.repository.ownerLogin,
      repositoryOwnerType: source.repository.ownerType,
      repositoryPrivate: source.repository.private,
      substantiveLoc: substantiveCommitLoc(source.commit.files),
      summaryHeadline: summary.headline,
      summaryInputHash: generated.inputHash,
      summaryModel: GITHUB_ACTIVITY_SUMMARY_MODEL,
      summaryRecipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
      summaryShort: summary.short,
    });
    return true;
  } catch (error) {
    const code =
      error instanceof ActivityProcessingError
        ? error.code
        : error instanceof GitHubResponseError
          ? `github_${error.status}`
          : "processing_failed";
    await failGitHubActivity(row, code);
    return false;
  }
};

export interface GitHubActivityProcessingResult {
  claimed: number;
  completed: number;
  failed: number;
}

export const processPendingGitHubActivity = async (
  limit = DEFAULT_GITHUB_ACTIVITY_PROCESSING_BATCH_SIZE
): Promise<GitHubActivityProcessingResult> => {
  if ((process.env.OPENAI_API_KEY?.trim().length ?? 0) === 0) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const claimed = await claimPendingGitHubActivity(limit);
  const results: boolean[] = [];
  for (
    let offset = 0;
    offset < claimed.length;
    offset += GITHUB_ACTIVITY_PROCESSING_CONCURRENCY
  ) {
    results.push(
      ...(await Promise.all(
        claimed
          .slice(offset, offset + GITHUB_ACTIVITY_PROCESSING_CONCURRENCY)
          .map(processClaimedCommit)
      ))
    );
  }
  const completed = results.filter(Boolean).length;
  return {
    claimed: claimed.length,
    completed,
    failed: claimed.length - completed,
  };
};
