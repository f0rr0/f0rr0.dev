import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { closeDatabase, getDatabase } from "../src/db/client";
import { githubCommits } from "../src/db/schema";
import {
  buildCommitPublicSummaryModelInput,
  DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD,
  deriveCommitLanguages,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_MAX_OUTPUT_TOKENS,
  PUBLIC_COMMIT_SUMMARY_RECIPE,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  publicCommitSummaryDisplayMode,
  publicCommitSummaryValidationErrors,
  selectPublicCommitSummary,
  substantiveCommitLoc,
} from "../src/lib/github-activity-public-summary";
import type {
  PublicCommitEvidence,
  PublicCommitFileEvidence,
} from "../src/lib/github-activity-public-summary";
import { trackedGitHubAccountFrom } from "../src/lib/github-commits-core";
import type { TrackedGitHubAccount } from "../src/lib/github-commits-core";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const NANO_MODEL = "gpt-5-nano-2025-08-07";

const SAMPLE_CASES = [
  { caseId: "two-line-feedback-gate", shaPrefix: "e63b784c" },
  { caseId: "six-line-indexnow-metadata", shaPrefix: "6cc104bf" },
  { caseId: "email-font-alignment", shaPrefix: "ed7ad9cf" },
  { caseId: "sealed-concurrency-contract", shaPrefix: "e634abdd" },
  { caseId: "wasix-streaming-tools", shaPrefix: "57e3c0ae" },
] as const;

interface CommitRow {
  author: string;
  committedAt: Date;
  repository: string;
  repositoryId: string;
  sha: string;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub returned an invalid ${label}.`);
  }
  return value;
};

const requiredInteger = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`GitHub returned invalid ${label}.`);
  }
  return Number(value);
};

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const repositoryApiPath = (repository: string, suffix: string) =>
  `/repos/${repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}${suffix}`;

const tokensFor = (account: TrackedGitHubAccount) => {
  const values = [
    account === "f0rr0"
      ? process.env.GITHUB_F0RR0_TOKEN
      : process.env.GITHUB_YUPPIESTECHDEV_TOKEN,
    account === "f0rr0"
      ? process.env.GITHUB_YUPPIESTECHDEV_TOKEN
      : process.env.GITHUB_F0RR0_TOKEN,
    process.env.GITHUB_TOKEN,
  ];
  return [
    ...new Set(
      values.flatMap((value) => {
        const token = value?.trim();
        return token === undefined || token.length === 0 ? [] : [token];
      })
    ),
  ];
};

const requestCommitPage = async (
  row: CommitRow,
  token: string,
  page: number
) => {
  const response = await fetch(
    new URL(
      repositoryApiPath(
        row.repository,
        `/commits/${encodeURIComponent(row.sha)}?per_page=${PAGE_SIZE}&page=${page}`
      ),
      GITHUB_API_ORIGIN
    ),
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "f0rr0.dev-public-summary-sample",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw Object.assign(new Error(`GitHub returned HTTP ${response.status}.`), {
      status: response.status,
    });
  }
  return (await response.json()) as unknown;
};

const parseFile = (value: unknown): PublicCommitFileEvidence => {
  if (!isObject(value)) {
    throw new Error("GitHub returned an invalid file.");
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

const fetchCommitWithToken = async (
  row: CommitRow,
  token: string
): Promise<PublicCommitEvidence> => {
  const files = new Map<string, PublicCommitFileEvidence>();
  let root: JsonObject | null = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const value = await requestCommitPage(row, token, page);
    if (!isObject(value) || !Array.isArray(value.files)) {
      throw new Error("GitHub returned an invalid commit response.");
    }
    root ??= value;
    const pageFiles = value.files.map(parseFile);
    for (const file of pageFiles) {
      files.set(file.filename, file);
    }
    if (pageFiles.length < PAGE_SIZE) {
      break;
    }
    if (page === MAX_PAGES) {
      throw new Error("The sampled commit exceeded the file pagination limit.");
    }
  }

  if (
    root === null ||
    !isObject(root.commit) ||
    !isObject(root.author) ||
    !isObject(root.commit.author) ||
    !isObject(root.stats)
  ) {
    throw new Error("GitHub returned incomplete commit evidence.");
  }
  const sha = requiredString(root.sha, "commit SHA").toLowerCase();
  const author = trackedGitHubAccountFrom(root.author.login);
  if (sha !== row.sha || author !== row.author) {
    throw new Error("The live commit no longer matches its stored provenance.");
  }
  const committedAt = requiredString(root.commit.author.date, "commit date");
  const additions = requiredInteger(root.stats.additions, "commit additions");
  const deletions = requiredInteger(root.stats.deletions, "commit deletions");
  const total = requiredInteger(root.stats.total, "commit changed lines");
  if (total !== additions + deletions) {
    throw new Error("GitHub returned inconsistent commit statistics.");
  }
  const parents = Array.isArray(root.parents)
    ? root.parents.map((parent) => {
        if (!isObject(parent)) {
          throw new Error("GitHub returned an invalid commit parent.");
        }
        return requiredString(parent.sha, "parent SHA").toLowerCase();
      })
    : [];
  return {
    committedAt: new Date(committedAt).toISOString(),
    files: [...files.values()].toSorted((left, right) =>
      left.filename.localeCompare(right.filename)
    ),
    message: requiredString(root.commit.message, "commit message"),
    parents,
    sha,
    stats: { additions, deletions, total },
  };
};

const fetchCommit = async (row: CommitRow) => {
  const author = trackedGitHubAccountFrom(row.author);
  if (author === null) {
    throw new Error("The database returned an untracked author.");
  }
  const tokens = tokensFor(author);
  if (tokens.length === 0) {
    throw new Error(`No GitHub token is configured for ${author}.`);
  }
  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await fetchCommitWithToken(row, token);
    } catch (error) {
      lastError = error;
      const status = isObject(error) ? error.status : undefined;
      if (!(status === 401 || status === 403 || status === 404)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No configured GitHub token could read the sampled commit.");
};

const selectedRows = async () => {
  const rows = await getDatabase()
    .select({
      author: githubCommits.author,
      committedAt: githubCommits.committedAt,
      repository: githubCommits.repository,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits);
  return SAMPLE_CASES.map(({ caseId, shaPrefix }) => {
    const matches = rows.filter(({ sha }) => sha.startsWith(shaPrefix));
    if (matches.length !== 1) {
      throw new Error(
        `Expected one provenance row for ${caseId}; found ${matches.length}.`
      );
    }
    const [row] = matches;
    if (row === undefined) {
      throw new Error(`Missing provenance row for ${caseId}.`);
    }
    return { caseId, row };
  });
};

const locFrom = (files: readonly PublicCommitFileEvidence[]) => {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return {
    additions,
    changedFiles: files.length,
    deletions,
    substantive: substantiveCommitLoc(files),
    total: additions + deletions,
  };
};

const subjectFrom = (message: string) =>
  message.split(/\r?\n/u, 1)[0]?.replaceAll(/\s+/gu, " ").trim() ||
  "Untitled change";

const callNano = async (modelInput: string) => {
  const startedAt = performance.now();
  const result = await generateText({
    maxOutputTokens: PUBLIC_COMMIT_SUMMARY_MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    model: openai(NANO_MODEL),
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
  return {
    durationMs: Math.round(performance.now() - startedAt),
    text: result.text,
    usage: {
      cacheReadTokens: result.usage.inputTokenDetails.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage.inputTokenDetails.cacheWriteTokens ?? 0,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      reasoningTokens: result.usage.outputTokenDetails.reasoningTokens ?? 0,
      textTokens: result.usage.outputTokenDetails.textTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
  };
};

const main = async () => {
  if ((process.env.OPENAI_API_KEY?.trim().length ?? 0) === 0) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const selected = await selectedRows();
  const prepared = [];
  for (const [index, { caseId, row }] of selected.entries()) {
    process.stderr.write(`Fetching commit ${index + 1}/${selected.length}\n`);
    const commit = await fetchCommit(row);
    prepared.push({
      caseId,
      commit,
      displayMode: publicCommitSummaryDisplayMode(commit.files),
      languages: deriveCommitLanguages(commit.files),
      loc: locFrom(commit.files),
      modelInput: buildCommitPublicSummaryModelInput(commit),
      row,
    });
  }

  const cases = [];
  for (const [index, source] of prepared.entries()) {
    process.stderr.write(
      `Summarizing commit ${index + 1}/${prepared.length}\n`
    );
    const common = {
      author: source.row.author,
      caseId: source.caseId,
      committedAt: source.commit.committedAt,
      deterministicLanguages: source.languages,
      inputCharacters: source.modelInput.length,
      loc: source.loc,
      repository: source.row.repository,
      sha: source.commit.sha,
      subject: subjectFrom(source.commit.message),
    };
    try {
      const completion = await callNano(source.modelInput);
      try {
        const summaries = parseCommitPublicSummary(completion.text);
        const ownerLogin = source.row.repository.split("/")[0] ?? null;
        const isTrackedOwner = trackedGitHubAccountFrom(ownerLogin) !== null;
        cases.push({
          ...common,
          bothSummaries: summaries,
          latencyMs: completion.durationMs,
          selectedDisplayVariant: source.displayMode,
          selectedSummary: selectPublicCommitSummary(
            summaries,
            source.commit.files
          ),
          transportError: null,
          usage: completion.usage,
          validationErrors: publicCommitSummaryValidationErrors(
            summaries,
            source.commit,
            {
              accountLogins: ["f0rr0", "yuppiestechdev"],
              organizationLogin: isTrackedOwner ? null : ownerLogin,
              privateRepositoryFullName: isTrackedOwner
                ? null
                : source.row.repository,
            }
          ),
        });
      } catch (error) {
        cases.push({
          ...common,
          bothSummaries: null,
          latencyMs: completion.durationMs,
          parseError: errorMessage(error),
          rawResponse: completion.text,
          selectedDisplayVariant: source.displayMode,
          selectedSummary: null,
          transportError: null,
          usage: completion.usage,
          validationErrors: [],
        });
      }
    } catch (error) {
      cases.push({
        ...common,
        bothSummaries: null,
        latencyMs: null,
        parseError: null,
        selectedDisplayVariant: source.displayMode,
        selectedSummary: null,
        transportError: errorMessage(error),
        usage: null,
        validationErrors: [],
      });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        configuration: {
          lowLocThreshold: DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD,
          maxOutputTokens: PUBLIC_COMMIT_SUMMARY_MAX_OUTPUT_TOKENS,
          maxRetries: 0,
          model: NANO_MODEL,
          modelAttemptsPerCommit: 1,
          persisted: false,
          promptSha256: createHash("sha256")
            .update(PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT)
            .digest("hex"),
          reasoningEffort: "minimal",
          recipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
          sample: "provenance-verified-loc-range-five-length-contrast-v3",
          store: false,
          structuredOutput: false,
        },
        cases,
      },
      null,
      2
    )}\n`
  );
};

try {
  await main();
} finally {
  await closeDatabase();
}
