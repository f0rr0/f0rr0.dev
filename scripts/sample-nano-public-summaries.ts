import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { closeDatabase, getDatabase } from "../src/db/client";
import { githubCommits } from "../src/db/schema";
import { fetchGitHubActivityCommitSource } from "../src/lib/github-activity-processor";
import {
  buildCommitPublicSummaryModelInput,
  DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD,
  deriveCommitLanguages,
  formatPublicCommitSummaryMarkdown,
  parseCommitPublicSummary,
  PUBLIC_COMMIT_SUMMARY_RECIPE,
  PUBLIC_COMMIT_SUMMARY_SYSTEM_PROMPT,
  publicCommitSummaryDisplayMode,
  selectPublicCommitSummary,
  substantiveCommitLoc,
} from "../src/lib/github-activity-public-summary";
import type { PublicCommitFileEvidence } from "../src/lib/github-activity-public-summary";
import type { ClaimedGitHubActivityCommit } from "../src/lib/github-activity-store";
import { trackedGitHubAccountFrom } from "../src/lib/github-commits-core";

const NANO_MODEL = "gpt-5-nano-2025-08-07";

const SAMPLE_CASES = [
  { caseId: "value-first-summary-flow", shaPrefix: "e51ee178" },
  { caseId: "github-activity-counters", shaPrefix: "7e93dfc0" },
  { caseId: "public-commit-timeline", shaPrefix: "84b23ce3" },
  { caseId: "facet-count-alignment", shaPrefix: "ab985292" },
  { caseId: "apt-provisioning-retries", shaPrefix: "144a4cad" },
  { caseId: "outreach-review-target", shaPrefix: "2b72714d" },
  { caseId: "truthful-worker-terminal-state", shaPrefix: "b0788260" },
  { caseId: "explicit-worker-execution", shaPrefix: "4ccf75af" },
  { caseId: "semantic-domain-categories", shaPrefix: "988beeb1" },
  { caseId: "compact-outreach-timeline", shaPrefix: "e1035454" },
  { caseId: "prospect-row-reordering", shaPrefix: "e98276ac" },
  { caseId: "mobile-guard-false-positive", shaPrefix: "b40e5f9b" },
] as const;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const requestedSampleCases = () => {
  const requestedIds = process.argv.slice(2);
  if (requestedIds.length === 0) {
    return SAMPLE_CASES;
  }
  return requestedIds.map((caseId) => {
    const sample = SAMPLE_CASES.find(
      (candidate) => candidate.caseId === caseId
    );
    if (sample === undefined) {
      throw new Error(`Unknown summary sample case: ${caseId}`);
    }
    return sample;
  });
};

const selectedRows = async () => {
  const rows = await getDatabase()
    .select({
      author: githubCommits.author,
      committedAt: githubCommits.committedAt,
      message: githubCommits.message,
      repository: githubCommits.repository,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits);
  return requestedSampleCases().map(({ caseId, shaPrefix }) => {
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
    const author = trackedGitHubAccountFrom(row.author);
    if (author === null) {
      throw new Error(
        `The provenance row for ${caseId} has an unknown author.`
      );
    }
    return {
      caseId,
      row: {
        ...row,
        author,
        committedAt: row.committedAt.toISOString(),
      } satisfies ClaimedGitHubActivityCommit,
    };
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
    const source = await fetchGitHubActivityCommitSource(row);
    const { commit, repository } = source;
    prepared.push({
      caseId,
      commit,
      displayMode: publicCommitSummaryDisplayMode(commit.files),
      languages: deriveCommitLanguages(commit.files),
      loc: locFrom(commit.files),
      modelInput: buildCommitPublicSummaryModelInput(commit, {
        avatarUrl: repository.avatarUrl,
        description: repository.description,
        directlyOwned: trackedGitHubAccountFrom(repository.ownerLogin) !== null,
        fullName: repository.fullName,
        homepageUrl: repository.homepageUrl,
        ownerLogin: repository.ownerLogin,
        ownerType: repository.ownerType,
        private: repository.private,
        topics: repository.topics,
      }),
      repository: repository.fullName,
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
      repository: source.repository,
      sha: source.commit.sha,
      subject: subjectFrom(source.commit.message),
    };
    try {
      const completion = await callNano(source.modelInput);
      try {
        const summaries = formatPublicCommitSummaryMarkdown(
          parseCommitPublicSummary(completion.text),
          source.commit
        );
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
      });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        configuration: {
          lowLocThreshold: DEFAULT_PUBLIC_COMMIT_SUMMARY_LOW_LOC_THRESHOLD,
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
