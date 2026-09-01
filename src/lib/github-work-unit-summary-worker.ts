import { env } from "@/env";
import {
  GitHubWorkUnitSummaryInvalidInputError,
  GitHubWorkUnitSummaryInvalidOutputError,
  generateGitHubWorkUnitSummary,
} from "@/lib/github-work-unit-summary-provider";
import {
  claimGitHubWorkUnitSummary,
  completeGitHubWorkUnitSummary,
  deferGitHubWorkUnitSummary,
  terminalGitHubWorkUnitSummary,
} from "@/lib/github-work-unit-summary-store";

const MINIMUM_PROVIDER_BUDGET_MS = 25_000;
const SETTLEMENT_RESERVE_MS = 3000;
const RETRY_DELAY_MS = 15 * 60_000;

interface GitHubWorkUnitSummaryWorkerResult {
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
  unavailable: number;
}

interface GitHubWorkUnitSummaryWorkerDependencies {
  claim: typeof claimGitHubWorkUnitSummary;
  complete: typeof completeGitHubWorkUnitSummary;
  defer: typeof deferGitHubWorkUnitSummary;
  generate: typeof generateGitHubWorkUnitSummary;
  now: () => Date;
  providerConfigured: () => boolean;
  terminal: typeof terminalGitHubWorkUnitSummary;
}

const productionDependencies: GitHubWorkUnitSummaryWorkerDependencies = {
  claim: claimGitHubWorkUnitSummary,
  complete: completeGitHubWorkUnitSummary,
  defer: deferGitHubWorkUnitSummary,
  generate: generateGitHubWorkUnitSummary,
  now: () => new Date(),
  providerConfigured: () => (env.OPENAI_API_KEY?.trim().length ?? 0) > 0,
  terminal: terminalGitHubWorkUnitSummary,
};

const emptyResult = (): GitHubWorkUnitSummaryWorkerResult => ({
  claimed: 0,
  completed: 0,
  deferred: 0,
  failed: 0,
  unavailable: 0,
});

const checkedNow = (value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("The GitHub summary worker clock is invalid.");
  }
  return value;
};

const checkedMaximumDuration = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("The GitHub summary worker duration is invalid.");
  }
  return value;
};

/** Claims and settles at most one provider request in an isolated time budget. */
export const runGitHubWorkUnitSummaryWorker = async (
  maximumDurationMs: number,
  dependencies: GitHubWorkUnitSummaryWorkerDependencies = productionDependencies
): Promise<GitHubWorkUnitSummaryWorkerResult> => {
  const durationMs = checkedMaximumDuration(maximumDurationMs);
  const startedAt = checkedNow(dependencies.now()).getTime();
  const deadlineAt = startedAt + durationMs - SETTLEMENT_RESERVE_MS;
  const result = emptyResult();
  if (
    !dependencies.providerConfigured() ||
    deadlineAt - checkedNow(dependencies.now()).getTime() <
      MINIMUM_PROVIDER_BUDGET_MS
  ) {
    return result;
  }

  const claim = await dependencies.claim({
    now: checkedNow(dependencies.now()),
  });
  if (claim === null) {
    return result;
  }
  result.claimed = 1;
  try {
    const generated = await dependencies.generate({
      deadlineAt,
      serializedInput: claim.serializedInput,
    });
    const completion = await dependencies.complete(
      claim,
      generated,
      checkedNow(dependencies.now())
    );
    if (completion.accepted) {
      result.completed = 1;
    } else {
      result.failed = 1;
    }
  } catch (error) {
    if (
      error instanceof GitHubWorkUnitSummaryInvalidInputError ||
      error instanceof GitHubWorkUnitSummaryInvalidOutputError
    ) {
      if (await dependencies.terminal(claim, checkedNow(dependencies.now()))) {
        result.unavailable = 1;
      } else {
        result.failed = 1;
      }
      return result;
    }
    const deferredAt = checkedNow(dependencies.now());
    const disposition = await dependencies.defer(
      claim,
      new Date(deferredAt.getTime() + RETRY_DELAY_MS),
      deferredAt
    );
    if (disposition === "deferred") {
      result.deferred = 1;
    } else if (disposition === "terminal") {
      result.unavailable = 1;
    } else {
      result.failed = 1;
    }
  }
  return result;
};
