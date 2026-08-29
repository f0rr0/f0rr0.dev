import { env } from "@/env";
import {
  ActivityProcessingError,
  fetchGitHubActivityCommitSource,
  fetchGitHubAssociatedPullRequests,
  fetchGitHubPullRequestMembership,
  fetchGitHubPullRequestSnapshot,
  fetchGitHubPushObservationSource,
  generateValidatedGitHubActivitySummary,
  GITHUB_ACTIVITY_SUMMARY_MODEL,
} from "@/lib/github-activity-processor";
import { PUBLIC_COMMIT_SUMMARY_RECIPE } from "@/lib/github-activity-public-summary";
import {
  boundedWorkerLimit,
  exactGitHubDiffDigest,
  GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
  workerDeadlineReached,
} from "@/lib/github-activity-worker-core";
import {
  canonicalizePendingGitHubActivities,
  claimDueGitHubPullRequests,
  claimGitHubCommitsForEnrichment,
  claimGitHubCommitsForPullRequestDiscovery,
  claimGitHubPushObservations,
  claimGitHubSummaryAttempts,
  completeGitHubCommitEnrichment,
  completeGitHubPullRequestDiscovery,
  completeGitHubPullRequestReconciliation,
  completeGitHubPushObservation,
  completeGitHubSummaryAttempt,
  deferGitHubCommitEnrichment,
  deferGitHubPullRequestDiscovery,
  deferGitHubPullRequestReconciliation,
  deferGitHubPushObservation,
  ensureMissingGitHubSummaryAttempts,
  failGitHubSummaryAttempt,
  markGitHubCommitUnavailable,
  markGitHubPullRequestDiscoveryUnavailable,
  markGitHubPushObservationUnavailable,
  persistGitHubPullRequestMembership,
  persistGitHubPullRequestSnapshot,
  releaseGitHubSummaryAttempt,
  stopGitHubPullRequestReconciliation,
} from "@/lib/github-activity-worker-store";
import type { DueGitHubPullRequest } from "@/lib/github-activity-worker-store";
import { GitHubResponseError } from "@/lib/github-api";
import { TRACKED_GITHUB_ACCOUNTS } from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import {
  isGitHubAccountPaused,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";

const DEFAULT_WORKER_MAXIMUM_DURATION_MS = 90_000;
const PERMANENT_GITHUB_STATUSES = new Set([404, 410, 422]);

interface StageResult {
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
  unavailable: number;
}

const emptyStageResult = (): StageResult => ({
  claimed: 0,
  completed: 0,
  deferred: 0,
  failed: 0,
  unavailable: 0,
});

export interface GitHubActivityWorkerResult {
  aliases: number;
  commits: StageResult;
  deadlineReached: boolean;
  observations: StageResult;
  pullRequests: StageResult;
  pullRequestDiscovery: StageResult;
  summaries: StageResult;
}

export interface GitHubActivityWorkerOptions {
  commitLimit?: number;
  maximumDurationMs?: number;
  observationLimit?: number;
  pullRequestDiscoveryLimit?: number;
  summaryLimit?: number;
}

const errorCode = (error: unknown) => {
  if (error instanceof ActivityProcessingError) {
    return error.code;
  }
  if (error instanceof GitHubResponseError) {
    return `github_${String(error.status)}`;
  }
  return error instanceof Error ? error.name.slice(0, 80) : "unknown_error";
};

const retryAtFrom = (error: unknown) =>
  error instanceof GitHubResponseError ? error.retryAt : null;

const permanentlyUnavailable = (error: unknown) =>
  (error instanceof GitHubResponseError &&
    PERMANENT_GITHUB_STATUSES.has(error.status)) ||
  (error instanceof ActivityProcessingError &&
    ["provenance_changed", "source_invalid"].includes(error.code));

const activeTrackedAccounts = async () => {
  const accounts: TrackedGitHubAccount[] = [];
  for (const account of TRACKED_GITHUB_ACCOUNTS) {
    const checkpoint = await readGitHubAccountCheckpoint(account);
    if (!isGitHubAccountPaused(checkpoint)) {
      accounts.push(account);
    }
  }
  return accounts;
};

const observedSinceLastReconciliation = (due: DueGitHubPullRequest) =>
  due.lastReconciledAt === null ||
  (due.versionObservedAt !== null &&
    due.versionObservedAt > due.lastReconciledAt);

type CommitSource = Awaited<ReturnType<typeof fetchGitHubActivityCommitSource>>;

interface WorkerContext {
  activeAccounts: readonly TrackedGitHubAccount[];
  deadlineReached: () => boolean;
  sourceCache: Map<string, CommitSource>;
}

const processObservations = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (context.deadlineReached()) {
    return;
  }
  const claimed = await claimGitHubPushObservations(
    limit,
    context.activeAccounts
  );
  result.claimed = claimed.length;
  for (const observation of claimed) {
    if (context.deadlineReached()) {
      await deferGitHubPushObservation(
        observation,
        "worker_deadline",
        new Date()
      );
      result.deferred += 1;
      continue;
    }
    try {
      const source = await fetchGitHubPushObservationSource(observation);
      await completeGitHubPushObservation(observation, source);
      result.completed += 1;
    } catch (error) {
      const code = errorCode(error);
      if (permanentlyUnavailable(error)) {
        await markGitHubPushObservationUnavailable(observation, code);
        result.unavailable += 1;
      } else {
        await deferGitHubPushObservation(observation, code, retryAtFrom(error));
        result.deferred += 1;
      }
    }
  }
  result.failed = result.deferred + result.unavailable;
};

const processCommits = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (context.deadlineReached()) {
    return;
  }
  const claimed = await claimGitHubCommitsForEnrichment(
    limit,
    context.activeAccounts
  );
  result.claimed = claimed.length;
  for (const commit of claimed) {
    if (context.deadlineReached()) {
      await deferGitHubCommitEnrichment(commit, "worker_deadline", new Date());
      result.deferred += 1;
      continue;
    }
    try {
      const source = await fetchGitHubActivityCommitSource(commit);
      const hydrated = await completeGitHubCommitEnrichment(
        commit,
        source,
        exactGitHubDiffDigest(source.commit)
      );
      if (hydrated === null) {
        result.failed += 1;
      } else {
        context.sourceCache.set(`${commit.repositoryId}:${commit.sha}`, source);
        result.completed += 1;
      }
    } catch (error) {
      const code = errorCode(error);
      if (permanentlyUnavailable(error)) {
        await markGitHubCommitUnavailable(commit, code);
        result.unavailable += 1;
      } else {
        await deferGitHubCommitEnrichment(commit, code, retryAtFrom(error));
        result.deferred += 1;
      }
    }
  }
  result.failed += result.deferred + result.unavailable;
};

const processPullRequestDiscovery = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (context.deadlineReached()) {
    return;
  }
  const claimed = await claimGitHubCommitsForPullRequestDiscovery(
    limit,
    context.activeAccounts
  );
  result.claimed = claimed.length;
  for (const commit of claimed) {
    if (context.deadlineReached()) {
      await deferGitHubPullRequestDiscovery(
        commit,
        "worker_deadline",
        new Date()
      );
      result.deferred += 1;
      continue;
    }
    try {
      const pullRequests = await fetchGitHubAssociatedPullRequests(commit);
      if (await completeGitHubPullRequestDiscovery(commit, pullRequests)) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      const code = errorCode(error);
      if (permanentlyUnavailable(error)) {
        await markGitHubPullRequestDiscoveryUnavailable(commit, code);
        result.unavailable += 1;
      } else {
        await deferGitHubPullRequestDiscovery(commit, code, retryAtFrom(error));
        result.deferred += 1;
      }
    }
  }
  result.failed += result.deferred + result.unavailable;
};

const reconcilePullRequest = async (
  context: WorkerContext,
  due: DueGitHubPullRequest
) => {
  const reference = {
    account: due.account,
    number: due.number,
    repository: due.repository,
    repositoryId: due.repositoryId,
  };
  const snapshot = await fetchGitHubPullRequestSnapshot(reference);
  const stored = await persistGitHubPullRequestSnapshot(
    due.account,
    snapshot.pullRequest,
    { refreshMembership: observedSinceLastReconciliation(due) }
  );
  if (stored === null) {
    throw new ActivityProcessingError(
      "snapshot_stale",
      "A newer GitHub pull request observation is already stored."
    );
  }
  if (stored.membershipRefreshRequired) {
    const membership = await fetchGitHubPullRequestMembership(
      reference,
      snapshot.expectedCommitCount
    );
    const complete = await persistGitHubPullRequestMembership(
      stored,
      snapshot.pullRequest.headSha,
      membership.commitShas,
      membership.membershipComplete
    );
    if (!complete) {
      throw new ActivityProcessingError(
        "membership_incomplete",
        "GitHub did not return complete pull request membership."
      );
    }
  }
  await completeGitHubPullRequestReconciliation(due, snapshot.pullRequest);
};

const processPullRequests = async (
  context: WorkerContext,
  result: StageResult
) => {
  for (const account of context.activeAccounts) {
    if (context.deadlineReached()) {
      break;
    }
    const duePullRequests = await claimDueGitHubPullRequests(
      account,
      GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
      25
    );
    result.claimed += duePullRequests.length;
    for (const due of duePullRequests) {
      if (context.deadlineReached()) {
        await deferGitHubPullRequestReconciliation(due, new Date());
        result.deferred += 1;
        continue;
      }
      try {
        await reconcilePullRequest(context, due);
        result.completed += 1;
      } catch (error) {
        if (permanentlyUnavailable(error)) {
          await stopGitHubPullRequestReconciliation(due);
          result.unavailable += 1;
        } else {
          await deferGitHubPullRequestReconciliation(due, retryAtFrom(error));
          result.deferred += 1;
        }
      }
    }
  }
  result.failed = result.deferred + result.unavailable;
};

const processSummaries = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (
    context.deadlineReached() ||
    (env.OPENAI_API_KEY?.trim().length ?? 0) === 0
  ) {
    return;
  }
  const claimed = await claimGitHubSummaryAttempts(
    limit,
    context.activeAccounts
  );
  result.claimed = claimed.length;
  for (const attempt of claimed) {
    if (context.deadlineReached()) {
      await releaseGitHubSummaryAttempt(attempt);
      result.deferred += 1;
      continue;
    }
    try {
      const cacheKey = `${attempt.repositoryId}:${attempt.sha}`;
      const source =
        context.sourceCache.get(cacheKey) ??
        (await fetchGitHubActivityCommitSource(attempt));
      if (context.deadlineReached()) {
        await releaseGitHubSummaryAttempt(attempt);
        result.deferred += 1;
        continue;
      }
      const generated = await generateValidatedGitHubActivitySummary(source);
      const completed = await completeGitHubSummaryAttempt(attempt, {
        headline: generated.summary.headline,
        inputHash: generated.inputHash,
        model: GITHUB_ACTIVITY_SUMMARY_MODEL,
        recipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
        short: generated.summary.short,
      });
      if (completed) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      await failGitHubSummaryAttempt(attempt, errorCode(error));
      result.failed += 1;
    }
  }
  result.failed += result.deferred;
};

export const runGitHubActivityWorker = async (
  options: GitHubActivityWorkerOptions = {}
): Promise<GitHubActivityWorkerResult> => {
  const commitLimit = boundedWorkerLimit(options.commitLimit);
  const observationLimit = boundedWorkerLimit(options.observationLimit);
  const pullRequestDiscoveryLimit = boundedWorkerLimit(
    options.pullRequestDiscoveryLimit
  );
  const summaryLimit = boundedWorkerLimit(options.summaryLimit);
  const maximumDurationMs =
    options.maximumDurationMs ?? DEFAULT_WORKER_MAXIMUM_DURATION_MS;
  if (
    !Number.isSafeInteger(maximumDurationMs) ||
    maximumDurationMs < 1 ||
    maximumDurationMs > 240_000
  ) {
    throw new RangeError("The GitHub activity worker duration is invalid.");
  }

  const startedAt = Date.now();
  const deadlineReached = () =>
    workerDeadlineReached(startedAt, maximumDurationMs);
  const observations = emptyStageResult();
  const commits = emptyStageResult();
  const pullRequests = emptyStageResult();
  const pullRequestDiscovery = emptyStageResult();
  const summaries = emptyStageResult();
  const context: WorkerContext = {
    activeAccounts: await activeTrackedAccounts(),
    deadlineReached,
    sourceCache: new Map(),
  };

  await processObservations(context, observationLimit, observations);
  await processCommits(context, commitLimit, commits);
  await processPullRequestDiscovery(
    context,
    pullRequestDiscoveryLimit,
    pullRequestDiscovery
  );
  await processPullRequests(context, pullRequests);
  const aliases = context.deadlineReached()
    ? 0
    : await canonicalizePendingGitHubActivities(8);
  if (!context.deadlineReached()) {
    await ensureMissingGitHubSummaryAttempts();
  }
  await processSummaries(context, summaryLimit, summaries);

  return {
    aliases,
    commits,
    deadlineReached: context.deadlineReached(),
    observations,
    pullRequests,
    pullRequestDiscovery,
    summaries,
  };
};
