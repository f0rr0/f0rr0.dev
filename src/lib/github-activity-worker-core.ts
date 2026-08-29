import { createHash } from "node:crypto";

import type { PublicCommitEvidence } from "@/lib/github-activity-public-summary";

export const GITHUB_EXACT_DIFF_DIGEST_RECIPE = "github-exact-diff-v2";
export const DEFAULT_GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS = 30;

export class GitHubActivityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubActivityConfigurationError";
  }
}

export interface GitHubExactDiffDigest {
  complete: boolean;
  digest: string;
  recipe: typeof GITHUB_EXACT_DIFF_DIGEST_RECIPE;
}

interface StablePatchLines {
  additions: number;
  deletions: number;
  lines: readonly string[];
}

const compareCodeUnitStrings = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

const stablePatchLines = (patch: string): StablePatchLines => {
  const lines: string[] = [];
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  let previousWasChange = false;

  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      previousWasChange = false;
      const suffix = /^@@[^@]*@@(.*)$/u.exec(line)?.[1] ?? "";
      lines.push(`@@${suffix}`);
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      lines.push(line);
      previousWasChange = true;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
      lines.push(line);
      previousWasChange = true;
      continue;
    }
    if (line === "\\ No newline at end of file" && previousWasChange) {
      lines.push(line);
      continue;
    }
    if (line.startsWith(" ")) {
      lines.push(line);
    }
    previousWasChange = false;
  }

  return { additions, deletions, lines };
};

/**
 * Hashes stable hunk bodies and per-file change metadata. Numeric hunk ranges
 * are excluded because rebases move them; hunk labels, unchanged context, and
 * changed lines are preserved so identical edits in different code contexts do
 * not become false aliases. Commit identity and repository context are omitted.
 * An incomplete digest remains useful for auditing but must never be used as
 * proof that two commits are aliases.
 */
export const exactGitHubDiffDigest = (
  commit: PublicCommitEvidence
): GitHubExactDiffDigest => {
  const files = commit.files
    .map((file) => {
      const changes = file.patch === null ? null : stablePatchLines(file.patch);
      return {
        additions: file.additions,
        changes: changes?.lines ?? null,
        changesMatchCounters:
          changes !== null &&
          changes.additions === file.additions &&
          changes.deletions === file.deletions,
        deletions: file.deletions,
        filename: file.filename,
        previousFilename: file.previousFilename,
        status: file.status,
      };
    })
    .toSorted((left, right) => {
      const byFilename = compareCodeUnitStrings(left.filename, right.filename);
      if (byFilename !== 0) {
        return byFilename;
      }
      return compareCodeUnitStrings(
        left.previousFilename ?? "",
        right.previousFilename ?? ""
      );
    });
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const complete =
    !commit.providerFileCapReached &&
    files.length > 0 &&
    files.every((file) => file.changesMatchCounters) &&
    additions === commit.stats.additions &&
    deletions === commit.stats.deletions;
  const canonical = JSON.stringify({
    files: files.map((file) => ({
      additions: file.additions,
      changes: file.changes,
      deletions: file.deletions,
      filename: file.filename,
      previousFilename: file.previousFilename,
      status: file.status,
    })),
    recipe: GITHUB_EXACT_DIFF_DIGEST_RECIPE,
  });

  return {
    complete,
    digest: createHash("sha256").update(canonical).digest("hex"),
    recipe: GITHUB_EXACT_DIFF_DIGEST_RECIPE,
  };
};

export const boundedWorkerLimit = (value: number | undefined, fallback = 2) => {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 8) {
    throw new RangeError("The GitHub activity worker batch size is invalid.");
  }
  return selected;
};

export const workerBatchSizeFrom = (
  value: string | null
): number | null | undefined => {
  if (value === null) {
    return undefined;
  }
  return /^[1-8]$/.test(value) ? Number(value) : null;
};

export const githubPrReconciliationMaximumAgeDays = (
  value = process.env.GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS
) => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized.length === 0) {
    return DEFAULT_GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS;
  }
  if (normalized === "infinity") {
    return Number.POSITIVE_INFINITY;
  }
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new GitHubActivityConfigurationError(
      "GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS must be a positive integer or infinity."
    );
  }
  const days = Number(normalized);
  if (!Number.isSafeInteger(days)) {
    throw new GitHubActivityConfigurationError(
      "GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS is outside the supported range."
    );
  }
  return days;
};

export const githubPrReconciliationCutoff = (
  maximumAgeDays: number,
  now: Date
) => {
  if (maximumAgeDays === Number.POSITIVE_INFINITY) {
    return null;
  }
  if (!Number.isSafeInteger(maximumAgeDays) || maximumAgeDays < 1) {
    throw new RangeError("The GitHub PR reconciliation horizon is invalid.");
  }
  const cutoffMilliseconds =
    now.getTime() - maximumAgeDays * 24 * 60 * 60 * 1000;
  // ECMAScript dates end at ±8.64e15 ms. A larger finite configuration is
  // operationally equivalent to an unbounded horizon.
  if (
    !Number.isFinite(cutoffMilliseconds) ||
    cutoffMilliseconds < -8_640_000_000_000_000
  ) {
    return null;
  }
  return new Date(cutoffMilliseconds);
};

export const workerDeadlineReached = (
  startedAt: number,
  maximumDurationMs: number,
  now = Date.now()
) => {
  if (
    !Number.isFinite(startedAt) ||
    !Number.isSafeInteger(maximumDurationMs) ||
    maximumDurationMs < 1
  ) {
    throw new RangeError("The GitHub activity worker deadline is invalid.");
  }
  return now - startedAt >= maximumDurationMs;
};

export const githubCommitActivityOccurredAt = (source: {
  committerAt: string;
}) => {
  const occurredAt = new Date(source.committerAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new TypeError("The GitHub commit committer time is invalid.");
  }
  return occurredAt;
};

export const nextGitHubPullRequestReconciliationAt = (
  state: "closed" | "merged" | "open",
  now: Date,
  intervalMs = 3 * 60 * 60 * 1000
) => {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new RangeError("The GitHub PR reconciliation interval is invalid.");
  }
  return state === "open" ? new Date(now.getTime() + intervalMs) : null;
};

export const githubSummaryCanPublish = (input: {
  activityRevision: number;
  attemptRevision: number;
  canonicalized: boolean;
  canonicalPublicId: string | null;
  hidden: boolean;
}) =>
  input.activityRevision === input.attemptRevision &&
  input.canonicalized &&
  input.canonicalPublicId === null &&
  !input.hidden;

export const githubPullRequestSnapshotDisposition = (
  storedProviderUpdatedAt: Date,
  observedProviderUpdatedAt: Date,
  authoritative: boolean
) => {
  const difference =
    observedProviderUpdatedAt.getTime() - storedProviderUpdatedAt.getTime();
  if (!Number.isFinite(difference)) {
    throw new TypeError("The GitHub PR provider timestamp is invalid.");
  }
  if (difference < 0) {
    return "stale" as const;
  }
  if (difference > 0) {
    return "newer" as const;
  }
  return authoritative
    ? ("equal_authoritative" as const)
    : ("equal_observed" as const);
};
