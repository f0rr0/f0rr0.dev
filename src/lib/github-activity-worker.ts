import {
  ActivityProcessingError,
  fetchGitHubActivityCommitSource,
  fetchGitHubAssociatedPullRequests,
  fetchGitHubPullRequestMembership,
  fetchGitHubPullRequestSnapshot,
  fetchGitHubPushObservationSource,
  generateValidatedGitHubActivitySummary,
  GitHubGraphQlResponseError,
} from "@/lib/github-activity-processor";
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
  claimGitHubPullRequestSignals,
  claimGitHubPushObservations,
  claimGitHubSummaryAttempts,
  completeGitHubCommitEnrichment,
  completeGitHubPullRequestDiscovery,
  completeGitHubPullRequestReconciliation,
  completeGitHubPullRequestSignal,
  completeGitHubPushObservation,
  completeGitHubSummaryAttempt,
  deferGitHubCommitEnrichment,
  deferGitHubPullRequestDiscovery,
  deferGitHubPullRequestReconciliation,
  deferGitHubPullRequestSignal,
  deferGitHubPushObservation,
  ensureMissingGitHubSummaryAttempts,
  deferGitHubSummaryAttempt,
  markGitHubCommitUnavailable,
  markGitHubPullRequestDiscoveryUnavailable,
  markGitHubPullRequestSignalUnavailable,
  markGitHubPushObservationUnavailable,
  persistGitHubPullRequestMembership,
  persistGitHubPullRequestSnapshot,
  releaseGitHubCommitEnrichment,
  releaseGitHubPullRequestDiscovery,
  releaseGitHubPullRequestReconciliation,
  releaseGitHubPullRequestSignal,
  releaseGitHubPushObservation,
  releaseGitHubSummaryAttempt,
  stopGitHubPullRequestReconciliation,
} from "@/lib/github-activity-worker-store";
import type { DueGitHubPullRequest } from "@/lib/github-activity-worker-store";
import {
  GitHubRequestDeadlineError,
  GitHubResponseError,
} from "@/lib/github-api";
import { TRACKED_GITHUB_ACCOUNTS } from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import {
  isGitHubAccountPaused,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";

const DEFAULT_WORKER_MAXIMUM_DURATION_MS = 90_000;
// A 404 is visibility-dependent on GitHub and must remain recoverable after a
// token or repository-permission change.
const PERMANENT_GITHUB_STATUSES = new Set([410, 422]);
const MINIMUM_TERMINAL_GITHUB_ATTEMPTS = 8;

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
  pullRequestSignals: StageResult;
  summaries: StageResult;
}

export interface GitHubActivityWorkerOptions {
  commitLimit?: number;
  maximumDurationMs?: number;
  observationLimit?: number;
  pullRequestDiscoveryLimit?: number;
  pullRequestLimit?: number;
  pullRequestSignalLimit?: number;
  summaryLimit?: number;
}

const errorCode = (error: unknown) => {
  if (error instanceof GitHubRequestDeadlineError) {
    return "worker_deadline";
  }
  if (error instanceof ActivityProcessingError) {
    return error.code;
  }
  if (error instanceof GitHubResponseError) {
    return `github_${String(error.status)}`;
  }
  return error instanceof Error ? error.name.slice(0, 80) : "unknown_error";
};

const retryAtFrom = (error: unknown) =>
  error instanceof GitHubResponseError ||
  error instanceof GitHubGraphQlResponseError
    ? error.retryAt
    : null;

const permanentlyUnavailable = (error: unknown, attemptCount: number) =>
  (error instanceof ActivityProcessingError &&
    error.code === "provenance_changed") ||
  (error instanceof GitHubResponseError &&
    !error.retryable &&
    PERMANENT_GITHUB_STATUSES.has(error.status) &&
    attemptCount >= MINIMUM_TERMINAL_GITHUB_ATTEMPTS);

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
  deadlineAt: number;
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
      await releaseGitHubPushObservation(observation);
      result.deferred += 1;
      continue;
    }
    try {
      const source = await fetchGitHubPushObservationSource(observation, {
        deadlineAt: context.deadlineAt,
      });
      await completeGitHubPushObservation(observation, source);
      result.completed += 1;
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubPushObservation(observation);
        result.deferred += 1;
      } else if (permanentlyUnavailable(error, observation.attemptCount)) {
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
      await releaseGitHubCommitEnrichment(commit);
      result.deferred += 1;
      continue;
    }
    try {
      const source = await fetchGitHubActivityCommitSource(commit, {
        deadlineAt: context.deadlineAt,
      });
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
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubCommitEnrichment(commit);
        result.deferred += 1;
      } else if (permanentlyUnavailable(error, commit.attemptCount)) {
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
      await releaseGitHubPullRequestDiscovery(commit);
      result.deferred += 1;
      continue;
    }
    try {
      const pullRequests = await fetchGitHubAssociatedPullRequests(commit, {
        deadlineAt: context.deadlineAt,
      });
      if (await completeGitHubPullRequestDiscovery(commit, pullRequests)) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubPullRequestDiscovery(commit);
        result.deferred += 1;
      } else if (permanentlyUnavailable(error, commit.attemptCount)) {
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

const processPullRequestSignals = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (context.deadlineReached()) {
    return;
  }
  const claimed = await claimGitHubPullRequestSignals(
    limit,
    context.activeAccounts
  );
  result.claimed = claimed.length;
  for (const signal of claimed) {
    if (context.deadlineReached()) {
      await releaseGitHubPullRequestSignal(signal);
      result.deferred += 1;
      continue;
    }
    try {
      const snapshot = await fetchGitHubPullRequestSnapshot(signal, {
        deadlineAt: context.deadlineAt,
      });
      await persistGitHubPullRequestSnapshot(
        signal.account,
        snapshot.pullRequest,
        { refreshMembership: true }
      );
      await completeGitHubPullRequestSignal(signal);
      result.completed += 1;
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubPullRequestSignal(signal);
        result.deferred += 1;
      } else if (permanentlyUnavailable(error, signal.attemptCount)) {
        await markGitHubPullRequestSignalUnavailable(signal, code);
        result.unavailable += 1;
      } else {
        await deferGitHubPullRequestSignal(signal, code, retryAtFrom(error));
        result.deferred += 1;
      }
    }
  }
  result.failed = result.deferred + result.unavailable;
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
  const snapshot = await fetchGitHubPullRequestSnapshot(reference, {
    deadlineAt: context.deadlineAt,
  });
  const stored = await persistGitHubPullRequestSnapshot(
    due.account,
    snapshot.pullRequest,
    {
      reconciliationLeaseUntil: due.leaseUntil,
      refreshMembership: observedSinceLastReconciliation(due),
    }
  );
  if (stored === null) {
    throw new ActivityProcessingError(
      "snapshot_stale",
      "A newer GitHub pull request observation is already stored."
    );
  }
  if (stored.retryLifecycleReset) {
    due.attemptCount = 1;
    due.priorAttemptCount = 0;
    due.priorErrorCode = null;
  }
  if (stored.membershipRefreshRequired) {
    const membership = await fetchGitHubPullRequestMembership(
      reference,
      snapshot.expectedCommitCount,
      {
        commitRepository:
          snapshot.pullRequest.headRepository ??
          snapshot.pullRequest.baseRepository,
        deadlineAt: context.deadlineAt,
        expectedBaseSha: snapshot.pullRequest.baseSha,
        expectedHeadSha: snapshot.pullRequest.headSha,
      }
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
  if (
    !(await completeGitHubPullRequestReconciliation(due, snapshot.pullRequest))
  ) {
    throw new ActivityProcessingError(
      "claim_stale",
      "The GitHub pull request reconciliation claim is no longer current."
    );
  }
};

const processPullRequests = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  const duePullRequests: DueGitHubPullRequest[] = [];
  let claimedInRound = true;
  while (
    duePullRequests.length < limit &&
    claimedInRound &&
    !context.deadlineReached()
  ) {
    claimedInRound = false;
    for (const account of context.activeAccounts) {
      if (duePullRequests.length >= limit || context.deadlineReached()) {
        break;
      }
      const [due] = await claimDueGitHubPullRequests(
        account,
        GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
        1
      );
      if (due !== undefined) {
        duePullRequests.push(due);
        claimedInRound = true;
      }
    }
  }
  result.claimed = duePullRequests.length;
  for (const due of duePullRequests) {
    if (context.deadlineReached()) {
      await releaseGitHubPullRequestReconciliation(due);
      result.deferred += 1;
      continue;
    }
    try {
      await reconcilePullRequest(context, due);
      result.completed += 1;
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubPullRequestReconciliation(due);
        result.deferred += 1;
      } else if (permanentlyUnavailable(error, due.attemptCount)) {
        await stopGitHubPullRequestReconciliation(due, code);
        result.unavailable += 1;
      } else {
        await deferGitHubPullRequestReconciliation(
          due,
          code,
          retryAtFrom(error)
        );
        result.deferred += 1;
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
  if (context.deadlineReached()) {
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
        (await fetchGitHubActivityCommitSource(attempt, {
          deadlineAt: context.deadlineAt,
        }));
      if (context.deadlineReached()) {
        await releaseGitHubSummaryAttempt(attempt);
        result.deferred += 1;
        continue;
      }
      const generated = await generateValidatedGitHubActivitySummary(source, {
        deadlineAt: context.deadlineAt,
      });
      const completed = await completeGitHubSummaryAttempt(attempt, {
        headline: generated.summary.headline,
        inputHash: generated.inputHash,
        model: generated.model,
        recipe: generated.recipe,
        short: generated.summary.short,
      });
      if (completed) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      await (error instanceof GitHubRequestDeadlineError
        ? releaseGitHubSummaryAttempt(attempt)
        : deferGitHubSummaryAttempt(
            attempt,
            errorCode(error),
            retryAtFrom(error)
          ));
      result.deferred += 1;
    }
  }
  result.failed = result.deferred + result.unavailable;
};

export const runGitHubActivityWorker = async (
  options: GitHubActivityWorkerOptions = {}
): Promise<GitHubActivityWorkerResult> => {
  const commitLimit = boundedWorkerLimit(options.commitLimit);
  const observationLimit = boundedWorkerLimit(options.observationLimit);
  const pullRequestDiscoveryLimit = boundedWorkerLimit(
    options.pullRequestDiscoveryLimit
  );
  const pullRequestLimit = boundedWorkerLimit(options.pullRequestLimit);
  const pullRequestSignalLimit = boundedWorkerLimit(
    options.pullRequestSignalLimit
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
  const pullRequestSignals = emptyStageResult();
  const summaries = emptyStageResult();
  const context: WorkerContext = {
    activeAccounts: await activeTrackedAccounts(),
    deadlineAt: startedAt + maximumDurationMs,
    deadlineReached,
    sourceCache: new Map(),
  };

  await processObservations(context, observationLimit, observations);
  await processCommits(context, commitLimit, commits);
  await processPullRequestSignals(
    context,
    pullRequestSignalLimit,
    pullRequestSignals
  );
  await processPullRequestDiscovery(
    context,
    pullRequestDiscoveryLimit,
    pullRequestDiscovery
  );
  await processPullRequests(context, pullRequestLimit, pullRequests);
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
    pullRequestSignals,
    summaries,
  };
};
