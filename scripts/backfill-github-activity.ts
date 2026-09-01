import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import { runGitHubActivityWorker } from "../src/lib/github-activity-worker";
import type { GitHubActivityWorkerResult } from "../src/lib/github-activity-worker";
import {
  GitHubRequestDeadlineError,
  GitHubResponseError,
} from "../src/lib/github-api";
import {
  githubBackfillDiscoveryReportFrom,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core";
import type {
  GitHubBackfillFactualDrainResult,
  GitHubBackfillIdentityResult,
  GitHubBackfillInventory,
  GitHubBackfillRequest,
} from "../src/lib/github-backfill-core";
import { readGitHubFactualWorkerBacklog } from "../src/lib/github-backfill-store";
import { assertGitHubTokenIdentity } from "../src/lib/github-commits";
import type { TrackedGitHubAccount } from "../src/lib/github-commits-core";
import { backfillGitHubCurrentRefGenerations } from "../src/lib/github-direct-backfill";
import { backfillGitHubPullRequests } from "../src/lib/github-pull-request-backfill";
import { lowerGitHubRefBackfillSinceAt } from "../src/lib/github-ref-membership-store";
import { loadGitHubRepositoryInventory } from "../src/lib/github-repository-inventory";
import { refreshGitHubWorkUnitProjection } from "../src/lib/github-work-unit-store";

const DEFAULT_MAXIMUM_MINUTES = 30;
const MAXIMUM_ACTION_MINUTES = 30;
const DEADLINE_MARGIN_MS = 30_000;
const FACTUAL_WORKER_BATCH_LIMIT = 8;
const FACTUAL_WORKER_MAXIMUM_DURATION_MS = 90_000;

interface BackfillArguments {
  account: string;
  endDate: string;
  maximumMinutes: number;
  repositoryId: string;
  startDate: string;
}

interface BackfillEnvironment {
  DATABASE_URL?: string;
  GITHUB_F0RR0_TOKEN?: string;
  GITHUB_YUPPIESTECHDEV_TOKEN?: string;
}

type GitHubBackfillProgressStage =
  | "identity"
  | "repository_inventory"
  | "current_heads"
  | "pull_requests"
  | "factual_drain";

interface GitHubBackfillProgressEvent {
  account: TrackedGitHubAccount | null;
  complete?: boolean;
  completed?: number;
  pending?: number;
  phase: "started" | "progress" | "finished";
  stage: GitHubBackfillProgressStage;
  total?: number;
}

type GitHubBackfillProgressReporter = (
  event: Readonly<GitHubBackfillProgressEvent>
) => void;

const argumentValues = (arguments_: readonly string[]) => {
  const allowed = new Set([
    "account",
    "end-date",
    "maximum-minutes",
    "repository-id",
    "start-date",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    const key = name?.startsWith("--") ? name.slice(2) : null;
    if (
      key === null ||
      value === undefined ||
      !allowed.has(key) ||
      values.has(key)
    ) {
      throw new TypeError("The backfill command arguments are invalid.");
    }
    values.set(key, value);
  }
  return values;
};

const requiredArgument = (
  values: ReadonlyMap<string, string>,
  name: string
) => {
  const value = values.get(name)?.trim();
  if (value === undefined || value.length === 0) {
    throw new TypeError(`--${name} is required.`);
  }
  return value;
};

export const backfillArgumentsFrom = (
  arguments_: readonly string[]
): BackfillArguments => {
  const values = argumentValues(arguments_);
  const maximumMinutesValue =
    values.get("maximum-minutes")?.trim() ?? String(DEFAULT_MAXIMUM_MINUTES);
  if (!/^\d+$/.test(maximumMinutesValue)) {
    throw new TypeError("--maximum-minutes must be an integer.");
  }
  const maximumMinutes = Number(maximumMinutesValue);
  if (
    !Number.isSafeInteger(maximumMinutes) ||
    maximumMinutes < 1 ||
    maximumMinutes > MAXIMUM_ACTION_MINUTES
  ) {
    throw new RangeError(
      `--maximum-minutes must be from 1 through ${String(MAXIMUM_ACTION_MINUTES)}.`
    );
  }
  return {
    account: requiredArgument(values, "account"),
    endDate: requiredArgument(values, "end-date"),
    maximumMinutes,
    repositoryId: values.get("repository-id")?.trim() ?? "",
    startDate: requiredArgument(values, "start-date"),
  };
};

export const requireBackfillEnvironment = (
  request: Pick<GitHubBackfillRequest, "accounts">,
  environment: BackfillEnvironment = env
) => {
  if (environment.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (
    request.accounts.includes("f0rr0") &&
    environment.GITHUB_F0RR0_TOKEN === undefined
  ) {
    throw new Error("GITHUB_F0RR0_TOKEN is not configured.");
  }
  if (
    request.accounts.includes("yuppiestechdev") &&
    environment.GITHUB_YUPPIESTECHDEV_TOKEN === undefined
  ) {
    throw new Error("GITHUB_YUPPIESTECHDEV_TOKEN is not configured.");
  }
};

const tokenFor = (
  account: TrackedGitHubAccount,
  environment: BackfillEnvironment
) => {
  const token =
    account === "f0rr0"
      ? environment.GITHUB_F0RR0_TOKEN
      : environment.GITHUB_YUPPIESTECHDEV_TOKEN;
  if (token === undefined) {
    throw new Error(`The GitHub token for ${account} is not configured.`);
  }
  return token;
};

interface GitHubBackfillFactualDrainDependencies {
  readBacklog: typeof readGitHubFactualWorkerBacklog;
  refreshProjection: typeof refreshGitHubWorkUnitProjection;
  runWorker: typeof runGitHubActivityWorker;
}

const productionFactualDrainDependencies: GitHubBackfillFactualDrainDependencies =
  {
    readBacklog: readGitHubFactualWorkerBacklog,
    refreshProjection: refreshGitHubWorkUnitProjection,
    runWorker: runGitHubActivityWorker,
  };

const factualStagesFrom = (result: GitHubActivityWorkerResult) => [
  result.observations,
  result.pullRequestSignals,
  result.commits,
  result.pullRequestDiscovery,
  result.pullRequests,
];

const factualDrainResult = (): GitHubBackfillFactualDrainResult => ({
  claimed: 0,
  complete: false,
  completed: 0,
  passes: 0,
  pending: {
    commitEnrichment: 0,
    commitPullRequests: 0,
    pullRequestReconciliation: 0,
    pullRequestSignals: 0,
    pushObservations: 0,
    total: 0,
  },
  projectionRuns: 0,
  retryAt: null,
  stopReason: "deferred",
  unavailable: 0,
});

const stoppedFactualDrain = (
  result: GitHubBackfillFactualDrainResult,
  input: {
    retryAt?: Date | null;
    stopReason: Exclude<
      GitHubBackfillFactualDrainResult["stopReason"],
      "complete"
    >;
  }
): GitHubBackfillFactualDrainResult => ({
  ...result,
  complete: false,
  retryAt: input.retryAt ?? null,
  stopReason: input.stopReason,
});

/**
 * Drains factual worker claims for one historical scope. A provider deferral is
 * returned immediately; the caller never sleeps or retries a deferred claim in
 * process. Summary generation and ref repair remain outside this drain.
 */
export const runGitHubBackfillFactualDrain = async (
  input: {
    accounts: readonly TrackedGitHubAccount[];
    deadlineAt: number;
    onProgress?: (result: Readonly<GitHubBackfillFactualDrainResult>) => void;
    request: Pick<
      GitHubBackfillRequest,
      "repositoryId" | "sinceAt" | "untilAt"
    >;
  },
  dependencies: GitHubBackfillFactualDrainDependencies = productionFactualDrainDependencies
): Promise<GitHubBackfillFactualDrainResult> => {
  if (!Number.isFinite(input.deadlineAt)) {
    throw new RangeError("The GitHub factual drain deadline is invalid.");
  }
  const result = factualDrainResult();
  const scope = {
    repositoryId: input.request.repositoryId,
    sinceAt: input.request.sinceAt,
    untilAt: input.request.untilAt,
  };

  while (Date.now() + DEADLINE_MARGIN_MS < input.deadlineAt) {
    const maximumDurationMs = Math.min(
      FACTUAL_WORKER_MAXIMUM_DURATION_MS,
      input.deadlineAt - Date.now() - DEADLINE_MARGIN_MS
    );
    const pass = await dependencies.runWorker({
      accounts: input.accounts,
      commitLimit: FACTUAL_WORKER_BATCH_LIMIT,
      includeProjection: false,
      includeRefs: false,
      includeSummaries: false,
      maximumDurationMs,
      observationLimit: FACTUAL_WORKER_BATCH_LIMIT,
      pullRequestDiscoveryLimit: FACTUAL_WORKER_BATCH_LIMIT,
      pullRequestLimit: FACTUAL_WORKER_BATCH_LIMIT,
      pullRequestSignalLimit: FACTUAL_WORKER_BATCH_LIMIT,
      scope,
    });
    const stages = factualStagesFrom(pass);
    const claimed = stages.reduce((sum, stage) => sum + stage.claimed, 0);
    const completed = stages.reduce((sum, stage) => sum + stage.completed, 0);
    const deferred = stages.reduce((sum, stage) => sum + stage.deferred, 0);
    result.claimed += claimed;
    result.completed += completed;
    result.passes += 1;
    result.projectionRuns += pass.projection === null ? 0 : 1;

    const backlog = await dependencies.readBacklog({
      accounts: input.accounts,
      scope,
    });
    result.pending = backlog.pending;
    result.retryAt = backlog.retryAt;
    result.unavailable = backlog.unavailable;
    input.onProgress?.({ ...result, pending: { ...result.pending } });

    if (backlog.pending.total === 0) {
      if (Date.now() + DEADLINE_MARGIN_MS >= input.deadlineAt) {
        return stoppedFactualDrain(result, { stopReason: "deadline" });
      }
      await dependencies.refreshProjection(new Date());
      result.projectionRuns += 1;
      return {
        ...result,
        complete: true,
        retryAt: null,
        stopReason: "complete",
      };
    }
    if (
      pass.deadlineReached ||
      Date.now() + DEADLINE_MARGIN_MS >= input.deadlineAt
    ) {
      return stoppedFactualDrain(result, { stopReason: "deadline" });
    }
    if (deferred > 0 || claimed === 0) {
      return stoppedFactualDrain(result, {
        retryAt: backlog.retryAt,
        stopReason: "deferred",
      });
    }
  }

  const backlog = await dependencies.readBacklog({
    accounts: input.accounts,
    scope,
  });
  result.pending = backlog.pending;
  result.retryAt = backlog.retryAt;
  result.unavailable = backlog.unavailable;
  return stoppedFactualDrain(result, { stopReason: "deadline" });
};

interface GitHubBackfillDiscoveryDependencies {
  assertIdentity: typeof assertGitHubTokenIdentity;
  discoverCurrentHeads: typeof backfillGitHubCurrentRefGenerations;
  discoverPullRequests: typeof backfillGitHubPullRequests;
  drainFactual: typeof runGitHubBackfillFactualDrain;
  loadRepositoryInventory: typeof loadGitHubRepositoryInventory;
  lowerRefCoverage: typeof lowerGitHubRefBackfillSinceAt;
}

const productionDependencies: GitHubBackfillDiscoveryDependencies = {
  assertIdentity: assertGitHubTokenIdentity,
  discoverCurrentHeads: backfillGitHubCurrentRefGenerations,
  discoverPullRequests: backfillGitHubPullRequests,
  drainFactual: runGitHubBackfillFactualDrain,
  loadRepositoryInventory: loadGitHubRepositoryInventory,
  lowerRefCoverage: lowerGitHubRefBackfillSinceAt,
};

const discoveryInterruptionFrom = (
  error: unknown
): GitHubBackfillIdentityResult | null => {
  if (error instanceof GitHubRequestDeadlineError) {
    return { complete: false, retryAt: null, stopReason: "deadline" };
  }
  if (error instanceof GitHubResponseError && error.retryable) {
    return {
      complete: false,
      retryAt: error.retryAt,
      stopReason: "provider_retry",
    };
  }
  if (
    error instanceof Error &&
    (error.name === "GitHubRepositoryInventoryClaimLostError" ||
      error.name === "GitHubRepositoryInventoryUnavailableError")
  ) {
    return { complete: false, retryAt: null, stopReason: "deferred" };
  }
  return null;
};

export const runGitHubBackfillDiscovery = async (
  input: {
    deadlineAt: number;
    environment: BackfillEnvironment;
    onProgress?: GitHubBackfillProgressReporter;
    request: GitHubBackfillRequest;
  },
  dependencies: GitHubBackfillDiscoveryDependencies = productionDependencies
): Promise<GitHubBackfillInventory> => {
  const identities = await Promise.all(
    input.request.accounts.map(async (account) => {
      const token = tokenFor(account, input.environment);
      input.onProgress?.({
        account,
        phase: "started",
        stage: "identity",
      });
      try {
        await dependencies.assertIdentity(account, token, {
          deadlineAt: input.deadlineAt,
        });
        input.onProgress?.({
          account,
          complete: true,
          phase: "finished",
          stage: "identity",
        });
        return {
          account,
          identity: {
            complete: true,
            retryAt: null,
            stopReason: "complete",
          } satisfies GitHubBackfillIdentityResult,
          token,
        };
      } catch (error) {
        const interruption = discoveryInterruptionFrom(error);
        if (interruption === null) {
          throw error;
        }
        input.onProgress?.({
          account,
          complete: false,
          phase: "finished",
          stage: "identity",
        });
        return { account, identity: interruption, token };
      }
    })
  );

  const accounts = identities.map(({ account, identity }) => ({
    account,
    identity,
    pullRequests: null,
    repositoryInventory: null,
  }));
  if (identities.some(({ identity }) => !identity.complete)) {
    return { accounts, currentHeads: null, factualDrain: null };
  }

  const inventoriedIdentities = await Promise.all(
    identities.map(async ({ account, identity, token }) => {
      input.onProgress?.({
        account,
        phase: "started",
        stage: "repository_inventory",
      });
      try {
        await dependencies.loadRepositoryInventory({
          account,
          deadlineAt: input.deadlineAt,
          token,
        });
        input.onProgress?.({
          account,
          complete: true,
          phase: "finished",
          stage: "repository_inventory",
        });
        return {
          account,
          identity,
          repositoryInventory: {
            complete: true,
            retryAt: null,
            stopReason: "complete",
          } satisfies GitHubBackfillIdentityResult,
          token,
        };
      } catch (error) {
        const interruption = discoveryInterruptionFrom(error);
        if (interruption === null) {
          throw error;
        }
        input.onProgress?.({
          account,
          complete: false,
          phase: "finished",
          stage: "repository_inventory",
        });
        return { account, identity, repositoryInventory: interruption, token };
      }
    })
  );
  const inventoriedAccounts = inventoriedIdentities.map(
    ({ account, identity, repositoryInventory }) => ({
      account,
      identity,
      pullRequests: null,
      repositoryInventory,
    })
  );
  if (
    inventoriedIdentities.some(
      ({ repositoryInventory }) => !repositoryInventory.complete
    )
  ) {
    return {
      accounts: inventoriedAccounts,
      currentHeads: null,
      factualDrain: null,
    };
  }

  await dependencies.lowerRefCoverage(
    input.request.accounts,
    input.request.sinceAt
  );

  input.onProgress?.({
    account: null,
    phase: "started",
    stage: "current_heads",
  });
  const currentHeads = await dependencies.discoverCurrentHeads({
    deadlineAt: input.deadlineAt,
    repositoryId: input.request.repositoryId,
  });
  input.onProgress?.({
    account: null,
    complete: currentHeads.complete,
    completed: currentHeads.completedGenerations,
    pending: currentHeads.remainingRefs,
    phase: "finished",
    stage: "current_heads",
  });
  if (!currentHeads.complete) {
    return {
      accounts: inventoriedAccounts,
      currentHeads,
      factualDrain: null,
    };
  }

  const discoveredAccounts = await Promise.all(
    inventoriedIdentities.map(
      async ({ account, identity, repositoryInventory, token }) => {
        input.onProgress?.({
          account,
          phase: "started",
          stage: "pull_requests",
        });
        const pullRequests = await dependencies.discoverPullRequests({
          account,
          deadlineAt: input.deadlineAt,
          onProgress: (progress) => {
            input.onProgress?.({
              account,
              completed: progress.scannedPullRequests,
              phase: "progress",
              stage: "pull_requests",
              total: progress.selectedAuthoredPullRequests,
            });
          },
          repositoryId: input.request.repositoryId,
          sinceAt: input.request.sinceAt,
          token,
          untilAt: input.request.untilAt,
        });
        input.onProgress?.({
          account,
          complete: pullRequests.complete,
          completed: pullRequests.scannedPullRequests,
          phase: "finished",
          stage: "pull_requests",
          total: pullRequests.selectedAuthoredPullRequests,
        });
        return { account, identity, pullRequests, repositoryInventory };
      }
    )
  );
  if (discoveredAccounts.some(({ pullRequests }) => !pullRequests.complete)) {
    return {
      accounts: discoveredAccounts,
      currentHeads,
      factualDrain: null,
    };
  }
  input.onProgress?.({
    account: null,
    phase: "started",
    stage: "factual_drain",
  });
  const factualDrain = await dependencies.drainFactual({
    accounts: input.request.accounts,
    deadlineAt: input.deadlineAt,
    onProgress: (progress) => {
      input.onProgress?.({
        account: null,
        completed: progress.completed,
        pending: progress.pending.total,
        phase: "progress",
        stage: "factual_drain",
      });
    },
    request: input.request,
  });
  input.onProgress?.({
    account: null,
    complete: factualDrain.complete,
    completed: factualDrain.completed,
    pending: factualDrain.pending.total,
    phase: "finished",
    stage: "factual_drain",
  });
  return { accounts: discoveredAccounts, currentHeads, factualDrain };
};

const requestValue = (input: BackfillArguments) => ({
  account: input.account,
  endDate: input.endDate,
  repositoryId: input.repositoryId,
  startDate: input.startDate,
});

const main = async () => {
  const input = backfillArgumentsFrom(process.argv.slice(2));
  const request = githubBackfillRequestFrom(requestValue(input));
  if (request === null) {
    throw new TypeError(
      "The backfill scope must be a tracked account and an inclusive UTC range of at most 31 days. Broad runs must start within the last 62 days; older runs require a numeric repository ID."
    );
  }
  requireBackfillEnvironment(request);
  const deadlineAt = Date.now() + input.maximumMinutes * 60_000;
  try {
    const inventory = await runGitHubBackfillDiscovery({
      deadlineAt,
      environment: env,
      onProgress: (progress) => {
        process.stdout.write(`${JSON.stringify({ progress })}\n`);
      },
      request,
    });
    const report = githubBackfillDiscoveryReportFrom({
      deadlineAt,
      inventory,
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.complete) {
      process.exitCode = 1;
    }
  } finally {
    await closeDatabase();
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "UnknownError";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
