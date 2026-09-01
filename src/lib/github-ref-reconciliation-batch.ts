import { GitHubRequestDeadlineError } from "@/lib/github-api";
import type {
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  acquireGitHubRefReconciliationLease,
  finishGitHubRefReconciliationLease,
  persistGitHubRepositoryRefPage,
  releaseGitHubRefReconciliationLease,
  skipGitHubRefRepository,
} from "@/lib/github-commits-store";
import type { GitHubRepositoryRefKind } from "@/lib/github-commits-store";
import { collectGitHubRepositoryRefPage } from "@/lib/github-reconciliation";
import { loadGitHubRepositoryInventory } from "@/lib/github-repository-inventory";

const LEASE_PADDING_MS = 30_000;
const INVENTORY_PUBLISH_RESERVE_MS = 2000;
const MINIMUM_REQUEST_BUDGET_MS = 10_000;

export interface GitHubRefReconciliationBatchInput {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  forceInventoryRefresh?: boolean;
  kind: GitHubRepositoryRefKind;
  repositoryLimit: number;
  token: string;
}

export interface GitHubRefReconciliationBatchResult {
  complete: boolean;
  knownCommits: number;
  pages: number;
  pushes: number;
  refs: number;
  repositories: number;
}

const compareRepositoryIds = (
  left: GitHubRepositoryFacts,
  right: GitHubRepositoryFacts
) => {
  const leftId = BigInt(left.id);
  const rightId = BigInt(right.id);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

export const sortGitHubRefRepositories = (
  repositories: readonly GitHubRepositoryFacts[]
) => repositories.toSorted(compareRepositoryIds);

export const nextGitHubRefRepository = (
  repositories: readonly GitHubRepositoryFacts[],
  cursorRepositoryId: string | null
) => {
  if (cursorRepositoryId === null) {
    return repositories[0] ?? null;
  }
  const cursor = BigInt(cursorRepositoryId);
  return (
    repositories.find((repository) => BigInt(repository.id) > cursor) ?? null
  );
};

export const githubRefCycleIsComplete = (
  repositories: readonly GitHubRepositoryFacts[],
  cursorRepositoryId: string | null,
  nextPage: number | null
) =>
  nextPage === null &&
  nextGitHubRefRepository(repositories, cursorRepositoryId) === null;

const emptyResult = (): GitHubRefReconciliationBatchResult => ({
  complete: false,
  knownCommits: 0,
  pages: 0,
  pushes: 0,
  refs: 0,
  repositories: 0,
});

const remainingBatchDurationMs = (input: GitHubRefReconciliationBatchInput) => {
  const remaining = Math.floor(input.deadlineAt - Date.now());
  if (
    !Number.isFinite(input.deadlineAt) ||
    !Number.isSafeInteger(remaining) ||
    remaining > 270_000 ||
    !Number.isSafeInteger(input.repositoryLimit) ||
    input.repositoryLimit < 1 ||
    input.repositoryLimit > 8
  ) {
    throw new RangeError("The GitHub ref reconciliation bounds are invalid.");
  }
  if (remaining < MINIMUM_REQUEST_BUDGET_MS) {
    throw new GitHubRequestDeadlineError();
  }
  return remaining;
};

/**
 * Reconciles at most `repositoryLimit` API pages and distinct repositories.
 * A large repository therefore resumes on its persisted next page instead of
 * monopolizing a serverless invocation. Missing refs remain active until the
 * final page commits the scan watermark.
 */
export const reconcileGitHubRepositoryRefBatch = async (
  input: GitHubRefReconciliationBatchInput
): Promise<GitHubRefReconciliationBatchResult> => {
  remainingBatchDurationMs(input);
  const { deadlineAt } = input;
  const repositories = await loadGitHubRepositoryInventory({
    account: input.account,
    deadlineAt: deadlineAt - INVENTORY_PUBLISH_RESERVE_MS,
    forceRefresh: input.forceInventoryRefresh,
    token: input.token,
  });
  const remainingDurationMs = remainingBatchDurationMs(input);
  const lease = await acquireGitHubRefReconciliationLease({
    account: input.account,
    kind: input.kind,
    leaseDurationMs: remainingDurationMs + LEASE_PADDING_MS,
  });
  const result = emptyResult();
  if (lease === null) {
    return result;
  }
  const {
    cursorRepositoryId: leasedCursorRepositoryId,
    leaseToken,
    nextPage: leasedNextPage,
    scanStartedAt: leasedScanStartedAt,
  } = lease;

  try {
    const orderedRepositories = sortGitHubRefRepositories(repositories);
    const repositoriesById = new Map(
      orderedRepositories.map((repository) => [repository.id, repository])
    );
    let cursorRepositoryId = leasedCursorRepositoryId;
    let nextPage = leasedNextPage;
    let scanStartedAt = leasedScanStartedAt;
    const visitedRepositories = new Set<string>();

    while (
      result.pages < input.repositoryLimit &&
      visitedRepositories.size < input.repositoryLimit &&
      Date.now() + MINIMUM_REQUEST_BUDGET_MS < deadlineAt
    ) {
      const repository =
        nextPage === null
          ? nextGitHubRefRepository(orderedRepositories, cursorRepositoryId)
          : (repositoriesById.get(cursorRepositoryId ?? "") ?? null);
      if (repository === null) {
        if (nextPage !== null && cursorRepositoryId !== null) {
          await skipGitHubRefRepository({
            account: input.account,
            kind: input.kind,
            leaseToken,
            repositoryId: cursorRepositoryId,
          });
          nextPage = null;
          scanStartedAt = null;
          continue;
        }
        result.complete = true;
        break;
      }
      visitedRepositories.add(repository.id);

      const page = nextPage ?? 1;
      const pageScanStartedAt = scanStartedAt ?? new Date();
      const collected = await collectGitHubRepositoryRefPage(
        repository,
        input.kind,
        input.token,
        { deadlineAt, page }
      );
      result.pages += 1;

      if (collected === null) {
        await skipGitHubRefRepository({
          account: input.account,
          kind: input.kind,
          leaseToken,
          repositoryId: repository.id,
        });
        cursorRepositoryId = repository.id;
        nextPage = null;
        scanStartedAt = null;
        continue;
      }

      const { nextPage: collectedNextPage, refs } = collected;
      const complete = collectedNextPage === null;
      const persisted = await persistGitHubRepositoryRefPage({
        account: input.account,
        complete,
        kind: input.kind,
        leaseToken,
        nextPage: collectedNextPage,
        observedAt: new Date(),
        refs,
        repository,
        scanStartedAt: pageScanStartedAt,
      });
      result.knownCommits += persisted.knownCommits;
      result.pushes += persisted.pushes;
      result.refs += persisted.refs;
      if (complete) {
        result.repositories += 1;
      }
      cursorRepositoryId = repository.id;
      nextPage = collectedNextPage;
      scanStartedAt = complete ? null : pageScanStartedAt;
    }

    if (
      !result.complete &&
      githubRefCycleIsComplete(
        orderedRepositories,
        cursorRepositoryId,
        nextPage
      )
    ) {
      result.complete = true;
    }
    await finishGitHubRefReconciliationLease({
      account: input.account,
      complete: result.complete,
      kind: input.kind,
      leaseToken,
    });
    return result;
  } catch (error) {
    await releaseGitHubRefReconciliationLease({
      account: input.account,
      kind: input.kind,
      leaseToken,
    });
    throw error;
  }
};
