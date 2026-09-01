import {
  ActivityProcessingError,
  fetchGitHubActivityCommitSource,
  fetchGitHubAssociatedPullRequests,
  fetchGitHubCurrentRefMembership,
  fetchGitHubPullRequestMembership,
  fetchGitHubPullRequestDiff,
  fetchGitHubPullRequestSnapshot,
  fetchGitHubPushObservationSource,
  GitHubGraphQlResponseError,
} from "@/lib/github-activity-processor";
import {
  boundedWorkerLimit,
  GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
  workerDeadlineReached,
} from "@/lib/github-activity-worker-core";
import {
  claimDueGitHubPullRequests,
  claimGitHubCommitsForEnrichment,
  claimGitHubCommitsForPullRequestDiscovery,
  claimGitHubPullRequestSignals,
  claimGitHubPushObservations,
  completeGitHubCommitEnrichment,
  completeGitHubPullRequestDiscovery,
  completeGitHubPullRequestReconciliation,
  completeGitHubPullRequestSignal,
  completeGitHubPushObservation,
  deferGitHubCommitEnrichment,
  deferGitHubPullRequestDiscovery,
  deferGitHubPullRequestReconciliation,
  deferGitHubPullRequestSignal,
  deferGitHubPushObservation,
  markGitHubCommitUnavailable,
  markGitHubPullRequestDiscoveryUnavailable,
  markGitHubPullRequestSignalUnavailable,
  markGitHubPushObservationUnavailable,
  persistGitHubPullRequestMembership,
  persistGitHubPullRequestDiff,
  persistGitHubPullRequestSnapshot,
  releaseGitHubCommitEnrichment,
  releaseGitHubPullRequestDiscovery,
  releaseGitHubPullRequestReconciliation,
  releaseGitHubPullRequestSignal,
  releaseGitHubPushObservation,
  stopGitHubPullRequestReconciliation,
} from "@/lib/github-activity-worker-store";
import type {
  DueGitHubPullRequest,
  GitHubActivityWorkerScope,
} from "@/lib/github-activity-worker-store";
import {
  GitHubRequestDeadlineError,
  GitHubResponseError,
} from "@/lib/github-api";
import {
  repositoryIdFrom,
  TRACKED_GITHUB_ACCOUNTS,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import {
  isGitHubAccountPaused,
  persistGitHubCommitReferences,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";
import {
  claimGitHubRefRepairs,
  completeGitHubRefDeletion,
  completeGitHubRefRepair,
  deferGitHubRefRepair,
  githubCurrentRefMembershipReferenceFrom,
  releaseGitHubRefRepair,
} from "@/lib/github-ref-membership-store";
import { ensureGitHubWorkUnitProjectionRequest } from "@/lib/github-work-unit-projection-state";
import { refreshGitHubWorkUnitProjection } from "@/lib/github-work-unit-store";
import type { GitHubWorkUnitProjectionRefreshResult } from "@/lib/github-work-unit-store";
import { reconcileGitHubWorkUnitSummaryStatus } from "@/lib/github-work-unit-summary-store";

const DEFAULT_WORKER_MAXIMUM_DURATION_MS = 90_000;
const MAXIMUM_PUBLICATION_RESERVE_MS = 30_000;
const MINIMUM_FACTUAL_PROCESSING_MS = 8000;
const TERMINAL_GITHUB_STATUSES = new Set([403, 404, 410, 422]);
const TERMINAL_ACTIVITY_PROCESSING_CODES = new Set([
  "membership_incomplete",
  "source_auth_missing",
  "source_incomplete",
  "source_invalid",
  "source_unavailable",
]);
// Three independent worker claims tolerate short propagation/permission races
// without letting deterministic provider failures restart a backfill forever.
export const GITHUB_ACTIVITY_TERMINAL_ATTEMPTS = 3;

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
  commits: StageResult;
  deadlineReached: boolean;
  observations: StageResult;
  projection: GitHubWorkUnitProjectionRefreshResult | null;
  pullRequests: StageResult;
  pullRequestDiscovery: StageResult;
  pullRequestSignals: StageResult;
  refs: StageResult;
}

export interface GitHubActivityWorkerOptions {
  accounts?: readonly TrackedGitHubAccount[];
  commitLimit?: number;
  includeProjection?: boolean;
  includeRefs?: boolean;
  maximumDurationMs?: number;
  observationLimit?: number;
  pullRequestDiscoveryLimit?: number;
  pullRequestLimit?: number;
  pullRequestSignalLimit?: number;
  refLimit?: number;
  scope?: GitHubActivityWorkerScope;
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

const processRefRepairs = async (
  context: WorkerContext,
  limit: number,
  result: StageResult
) => {
  if (context.deadlineReached()) {
    return;
  }
  const claimed = await claimGitHubRefRepairs({ limit, now: new Date() });
  result.claimed = claimed.length;
  for (const repair of claimed) {
    if (context.deadlineReached()) {
      await releaseGitHubRefRepair(repair);
      result.deferred += 1;
      continue;
    }
    try {
      if (!repair.active) {
        const completion = await completeGitHubRefDeletion(repair);
        if (completion.stale) {
          result.deferred += 1;
        } else {
          result.completed += 1;
        }
        continue;
      }
      const source = await fetchGitHubCurrentRefMembership(
        githubCurrentRefMembershipReferenceFrom(repair),
        { deadlineAt: context.deadlineAt }
      );
      const completion = await completeGitHubRefRepair(repair, source);
      if (completion.stale) {
        result.deferred += 1;
      } else {
        result.completed += 1;
      }
    } catch (error) {
      await (error instanceof GitHubRequestDeadlineError
        ? releaseGitHubRefRepair(repair)
        : deferGitHubRefRepair(repair, errorCode(error), retryAtFrom(error)));
      result.deferred += 1;
    }
  }
  result.failed = result.deferred;
};

export const githubActivityFailureIsTerminal = (
  error: unknown,
  attemptCount: number
) => {
  if (
    error instanceof ActivityProcessingError &&
    error.code === "provenance_changed"
  ) {
    return true;
  }
  if (attemptCount < GITHUB_ACTIVITY_TERMINAL_ATTEMPTS) {
    return false;
  }
  if (error instanceof GitHubGraphQlResponseError) {
    return !error.retryable;
  }
  if (error instanceof GitHubResponseError) {
    return !error.retryable && TERMINAL_GITHUB_STATUSES.has(error.status);
  }
  return (
    error instanceof ActivityProcessingError &&
    TERMINAL_ACTIVITY_PROCESSING_CODES.has(error.code)
  );
};

const activeTrackedAccounts = async (
  requestedAccounts: readonly TrackedGitHubAccount[] = TRACKED_GITHUB_ACCOUNTS
) => {
  const accounts: TrackedGitHubAccount[] = [];
  for (const account of requestedAccounts) {
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

interface WorkerContext {
  activeAccounts: readonly TrackedGitHubAccount[];
  deadlineAt: number;
  deadlineReached: () => boolean;
  scope?: GitHubActivityWorkerScope;
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
    context.activeAccounts,
    new Date(),
    context.scope
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
      } else if (
        githubActivityFailureIsTerminal(error, observation.attemptCount)
      ) {
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
    context.activeAccounts,
    new Date(),
    context.scope
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
      const hydrated = await completeGitHubCommitEnrichment(commit, source);
      if (hydrated) {
        result.completed += 1;
      } else {
        result.failed += 1;
      }
    } catch (error) {
      const code = errorCode(error);
      if (error instanceof GitHubRequestDeadlineError) {
        await releaseGitHubCommitEnrichment(commit);
        result.deferred += 1;
      } else if (githubActivityFailureIsTerminal(error, commit.attemptCount)) {
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
    context.activeAccounts,
    new Date(),
    context.scope
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
      } else if (githubActivityFailureIsTerminal(error, commit.attemptCount)) {
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
    context.activeAccounts,
    new Date(),
    context.scope
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
      } else if (githubActivityFailureIsTerminal(error, signal.attemptCount)) {
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
    await persistGitHubCommitReferences({ commits: membership.commits });
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
  if (stored.diffRefreshRequired && stored.expectedChangedFiles !== null) {
    const diff = await fetchGitHubPullRequestDiff(
      { ...reference, expectedChangedFiles: stored.expectedChangedFiles },
      { deadlineAt: context.deadlineAt }
    );
    if (
      !(await persistGitHubPullRequestDiff(
        stored,
        snapshot.pullRequest.baseSha,
        snapshot.pullRequest.headSha,
        diff.files
      ))
    ) {
      throw new ActivityProcessingError(
        "claim_stale",
        "The GitHub pull request changed while its diff was fetched."
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
        1,
        new Date(),
        context.scope
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
      } else if (githubActivityFailureIsTerminal(error, due.attemptCount)) {
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

const checkedWorkerAccounts = (
  accounts: readonly TrackedGitHubAccount[] | undefined
) => {
  const requested = accounts ?? TRACKED_GITHUB_ACCOUNTS;
  if (
    requested.length === 0 ||
    new Set(requested).size !== requested.length ||
    requested.some((account) => !TRACKED_GITHUB_ACCOUNTS.includes(account))
  ) {
    throw new RangeError(
      "The GitHub activity worker account scope is invalid."
    );
  }
  return requested;
};

const checkedWorkerScope = (
  scope: GitHubActivityWorkerScope | undefined
): GitHubActivityWorkerScope | undefined => {
  if (scope === undefined) {
    return undefined;
  }
  if (
    Number.isNaN(scope.sinceAt.getTime()) ||
    Number.isNaN(scope.untilAt.getTime()) ||
    scope.sinceAt > scope.untilAt ||
    (scope.repositoryId !== null &&
      repositoryIdFrom(scope.repositoryId) === null)
  ) {
    throw new RangeError("The GitHub activity worker scope is invalid.");
  }
  return {
    repositoryId: scope.repositoryId,
    sinceAt: new Date(scope.sinceAt),
    untilAt: new Date(scope.untilAt),
  };
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
  const refLimit = boundedWorkerLimit(options.refLimit, 1);
  const maximumDurationMs =
    options.maximumDurationMs ?? DEFAULT_WORKER_MAXIMUM_DURATION_MS;
  const requestedAccounts = checkedWorkerAccounts(options.accounts);
  const scope = checkedWorkerScope(options.scope);
  if (
    !Number.isSafeInteger(maximumDurationMs) ||
    maximumDurationMs < 1 ||
    maximumDurationMs > 240_000
  ) {
    throw new RangeError("The GitHub activity worker duration is invalid.");
  }

  const startedAt = Date.now();
  const publicationReserveMs =
    options.includeProjection === false
      ? 0
      : Math.min(
          MAXIMUM_PUBLICATION_RESERVE_MS,
          Math.max(0, maximumDurationMs - MINIMUM_FACTUAL_PROCESSING_MS)
        );
  const processingDurationMs = maximumDurationMs - publicationReserveMs;
  const deadlineReached = () =>
    workerDeadlineReached(startedAt, processingDurationMs);
  const observations = emptyStageResult();
  const commits = emptyStageResult();
  const pullRequests = emptyStageResult();
  const pullRequestDiscovery = emptyStageResult();
  const pullRequestSignals = emptyStageResult();
  const refs = emptyStageResult();
  const activeAccounts = await activeTrackedAccounts(requestedAccounts);
  const context: WorkerContext = {
    activeAccounts,
    deadlineAt: startedAt + processingDurationMs,
    deadlineReached,
    scope,
  };
  const overallDeadlineReached = () =>
    workerDeadlineReached(startedAt, maximumDurationMs);
  await processObservations(context, observationLimit, observations);
  await processPullRequestSignals(
    context,
    pullRequestSignalLimit,
    pullRequestSignals
  );
  if (options.includeRefs !== false) {
    await processRefRepairs(context, refLimit, refs);
  }
  await processCommits(context, commitLimit, commits);
  await processPullRequestDiscovery(
    context,
    pullRequestDiscoveryLimit,
    pullRequestDiscovery
  );
  await processPullRequests(context, pullRequestLimit, pullRequests);
  const projection =
    options.includeProjection !== false &&
    (await ensureGitHubWorkUnitProjectionRequest()) !== null
      ? await refreshGitHubWorkUnitProjection(new Date())
      : null;
  await reconcileGitHubWorkUnitSummaryStatus(new Date());

  return {
    commits,
    deadlineReached: overallDeadlineReached(),
    observations,
    projection,
    pullRequests,
    pullRequestDiscovery,
    pullRequestSignals,
    refs,
  };
};
