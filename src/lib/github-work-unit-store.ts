import { and, asc, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubCommits,
  githubIssues,
  githubPublicFeedHead,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestVersions,
  githubRefGenerations,
  githubRefMemberships,
  githubRepositories,
  githubRepositoryRefs,
  githubWorkUnitMemberships,
  githubWorkUnitSummaryAttempts,
  githubWorkUnits,
} from "@/db/schema";
import { PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE } from "@/lib/github-activity-store";
import type {
  GitHubFileChangeStat,
  GitHubLanguageFact,
  GitHubWorkUnitFileFact,
} from "@/lib/github-change-evidence";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import {
  chooseEffectivePullRequest,
  githubLogicalChangeKey,
  githubWorkUnitSummaryDiffEvidenceFrom,
  indexGitHubWorkUnitOwnershipEvidence,
  isEligibleGitHubWorkChange,
  projectGitHubWorkUnits,
} from "@/lib/github-work-unit-core";
import type {
  GitHubLogicalChange,
  GitHubProjectedWorkUnit,
  GitHubPullRequestProjectionEvidence,
  GitHubRepositoryProjectionEvidence,
  GitHubWorkUnitOwnershipIndex,
  GitHubWorkUnitProjectionInput,
} from "@/lib/github-work-unit-core";
import {
  acquireGitHubWorkUnitProjectionLock,
  completeGitHubWorkUnitProjectionRequest,
  requestGitHubWorkUnitProjection,
} from "@/lib/github-work-unit-projection-state";
import {
  buildGitHubWorkUnitSummaryInput,
  digestGitHubWorkUnitSummaryEvaluation,
  GITHUB_WORK_UNIT_SUMMARY_RECIPE,
} from "@/lib/github-work-unit-summary";
import type {
  GitHubWorkUnitSummaryBuildResult,
  GitHubWorkUnitSummaryCandidate,
  GitHubWorkUnitSummaryEvaluationEvidence,
  GitHubWorkUnitSummaryOutcomeEvidence,
  GitHubWorkUnitSummaryRepositoryContext,
} from "@/lib/github-work-unit-summary";

const SUMMARY_EVALUATION_LIMIT = 8;
const SUMMARY_DEBOUNCE_MS = 5 * 60 * 1000;
const DIGEST = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;

const trackedAuthorUserIds = new Set<string>(
  Object.values(TRACKED_GITHUB_USER_IDS)
);

type GitHubWorkUnitDatabase = ReturnType<typeof getDatabase>;
type GitHubWorkUnitTransaction = Parameters<
  Parameters<GitHubWorkUnitDatabase["transaction"]>[0]
>[0];

export type GitHubWorkUnitProjectionExclusionReason =
  | "merged_pr_landing"
  | "canonical_branch_unknown"
  | "head_generation_incomplete"
  | "no_current_owner"
  | "pull_request_coverage_incomplete"
  | "repository_visibility_unknown";

export interface GitHubWorkUnitProjectionExcludedChange {
  logicalKey: string;
  reason: GitHubWorkUnitProjectionExclusionReason;
  repositoryId: string;
  sha: string;
}

export interface GitHubWorkUnitProjectionSnapshot {
  excludedChanges: readonly GitHubWorkUnitProjectionExcludedChange[];
  exclusionReasonCounts: Readonly<
    Record<GitHubWorkUnitProjectionExclusionReason, number>
  >;
  input: GitHubWorkUnitProjectionInput;
  units: readonly GitHubProjectedWorkUnit[];
}

export interface GitHubWorkUnitProjectionRefreshResult {
  changed: boolean;
  deletedUnits: number;
  exclusionReasonCounts: Readonly<
    Record<GitHubWorkUnitProjectionExclusionReason, number>
  >;
  feedRevisionChanged: boolean;
  insertedUnits: number;
  orderingRevisionChanged: boolean;
  summaryAttemptsQueued: number;
  summaryEvaluationsPending: number;
  summaryEvaluationsSettled: number;
  summaryInputsFailed: number;
  summaryInputsSet: number;
  updatedUnits: number;
}

interface CurrentWorkUnitRow {
  activityAnchorAt: Date;
  activityAt: Date;
  activityDay: string;
  additions: number;
  attributionMode: string;
  contentObservedAt: Date;
  deletions: number;
  factsDigest: string;
  fileCount: number;
  firstActivityAt: Date;
  id: string;
  identityKey: string;
  kind: string;
  languages: readonly GitHubLanguageFact[] | null;
  lastActivityAt: Date;
  memberCount: number;
  membershipDigest: string;
  newestCommitSha: string;
  outcomeDigest: string | null;
  pullRequestNodeId: string | null;
  repositoryId: string;
  revision: number;
  summaryEvaluationDigest: string | null;
  summaryEvaluatedDigest: string | null;
  summaryInputDigest: string | null;
  visibility: string;
}

interface LoadedProjectionSnapshot extends GitHubWorkUnitProjectionSnapshot {
  currentUnits: readonly CurrentWorkUnitRow[];
  issueDays: readonly string[];
  repositoryContexts: ReadonlyMap<
    string,
    GitHubWorkUnitSummaryRepositoryContext
  >;
  selectedSummaryEvaluationIdentities: ReadonlySet<string>;
  summaryEvaluationDigests: ReadonlyMap<string, string>;
  summaryEvaluationEvidence: ReadonlyMap<
    string,
    GitHubWorkUnitSummaryEvaluationEvidence
  >;
  summaryEvaluationsPending: number;
}

interface PersistedProjectionUnit {
  id: string;
  projected: GitHubProjectedWorkUnit;
  revision: number;
  summaryEvaluationDigest: string;
}

interface ProjectionSwapResult {
  deletedUnits: number;
  feedRevisionChanged: boolean;
  insertedUnits: number;
  orderingRevisionChanged: boolean;
  summaryCandidates: readonly PersistedProjectionUnit[];
  updatedUnits: number;
}

interface CommitSummaryEvaluationEvidence {
  additions: number;
  deletions: number;
  fileFactsDigest: string | null;
}

interface PullRequestSummaryEvaluationEvidence {
  fileFactsComplete: boolean;
  fileFactsDigest: string | null;
  versionId: string;
}

const bytewiseCompare = (left: string, right: string) =>
  Buffer.compare(Buffer.from(left, "utf-8"), Buffer.from(right, "utf-8"));

const checkedNow = (now: Date) => {
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("The GitHub work-unit refresh time is invalid.");
  }
  return now;
};

const logicalKeyFrom = (repositoryId: string, sha: string) =>
  githubLogicalChangeKey(repositoryId, sha);

const refKeyFrom = (repositoryId: string, refName: string) =>
  `${repositoryId}\0${refName}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const checkedFileFacts = (
  value: unknown
): readonly GitHubWorkUnitFileFact[] | null => {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Stored GitHub file evidence must be an array.");
  }
  const facts: GitHubWorkUnitFileFact[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !Number.isSafeInteger(item.additions) ||
      (item.additions as number) < 0 ||
      typeof item.binary !== "boolean" ||
      !Number.isSafeInteger(item.deletions) ||
      (item.deletions as number) < 0 ||
      typeof item.filename !== "string" ||
      (typeof item.patch !== "string" && item.patch !== null) ||
      typeof item.patchComplete !== "boolean" ||
      (typeof item.previousFilename !== "string" &&
        item.previousFilename !== null) ||
      typeof item.status !== "string"
    ) {
      throw new TypeError("Stored GitHub file evidence is invalid.");
    }
    facts.push({
      additions: item.additions as number,
      binary: item.binary,
      deletions: item.deletions as number,
      filename: item.filename,
      patch: item.patch,
      patchComplete: item.patchComplete,
      previousFilename: item.previousFilename,
      status: item.status,
    });
  }
  return facts;
};

const compactFileFacts = sql<unknown>`case
when ${githubCommits.fileFacts} is null then null
else coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'additions', entry.value -> 'additions',
        'deletions', entry.value -> 'deletions',
        'filename', entry.value -> 'filename'
      )
      order by entry.position
    )
    from jsonb_array_elements(${githubCommits.fileFacts})
      with ordinality as entry(value, position)
  ),
  '[]'::jsonb
)
end`;

const checkedCompactFileFacts = (
  value: unknown
): readonly GitHubFileChangeStat[] | null => {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new TypeError(
      "Stored compact GitHub file evidence must be an array."
    );
  }
  const facts: GitHubFileChangeStat[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !Number.isSafeInteger(item.additions) ||
      (item.additions as number) < 0 ||
      !Number.isSafeInteger(item.deletions) ||
      (item.deletions as number) < 0 ||
      typeof item.filename !== "string"
    ) {
      throw new TypeError("Stored compact GitHub file evidence is invalid.");
    }
    facts.push({
      additions: item.additions as number,
      deletions: item.deletions as number,
      filename: item.filename,
    });
  }
  return facts;
};

const checkedDigest = (value: string | null) => {
  if (value === null) {
    return null;
  }
  if (!DIGEST.test(value)) {
    throw new Error("A stored GitHub file-evidence digest is invalid.");
  }
  return value;
};

const checkedParentShas = (value: unknown): readonly string[] | null => {
  if (value === null) {
    return null;
  }
  if (
    !Array.isArray(value) ||
    value.some((sha) => typeof sha !== "string" || !SHA.test(sha))
  ) {
    throw new TypeError("Stored GitHub parent evidence is invalid.");
  }
  return value;
};

const visibilityFrom = (
  value: string | null,
  verifiedAt: Date | null
): GitHubRepositoryProjectionEvidence["visibility"] => {
  if (verifiedAt === null) {
    return null;
  }
  if (value === "public") {
    return value;
  }
  if (value === "internal" || value === "private") {
    return value;
  }
  return null;
};

const currentWorkUnitSelection = {
  activityAnchorAt: githubWorkUnits.activityAnchorAt,
  activityAt: githubWorkUnits.activityAt,
  activityDay: githubWorkUnits.activityDay,
  additions: githubWorkUnits.additions,
  attributionMode: githubWorkUnits.attributionMode,
  contentObservedAt: githubWorkUnits.contentObservedAt,
  deletions: githubWorkUnits.deletions,
  factsDigest: githubWorkUnits.factsDigest,
  fileCount: githubWorkUnits.fileCount,
  firstActivityAt: githubWorkUnits.firstActivityAt,
  id: githubWorkUnits.id,
  identityKey: githubWorkUnits.identityKey,
  kind: githubWorkUnits.kind,
  languages: githubWorkUnits.languages,
  lastActivityAt: githubWorkUnits.lastActivityAt,
  memberCount: githubWorkUnits.memberCount,
  membershipDigest: githubWorkUnits.membershipDigest,
  newestCommitSha: githubWorkUnits.newestCommitSha,
  outcomeDigest: githubWorkUnits.outcomeDigest,
  pullRequestNodeId: githubWorkUnits.pullRequestNodeId,
  repositoryId: githubWorkUnits.repositoryId,
  revision: githubWorkUnits.revision,
  summaryEvaluationDigest: githubWorkUnits.summaryEvaluationDigest,
  summaryEvaluatedDigest: githubWorkUnits.summaryEvaluatedDigest,
  summaryInputDigest: githubWorkUnits.summaryInputDigest,
  visibility: githubWorkUnits.visibility,
};

const readCurrentUnits = async (
  transaction: GitHubWorkUnitTransaction,
  lock: boolean
): Promise<readonly CurrentWorkUnitRow[]> => {
  const query = transaction
    .select(currentWorkUnitSelection)
    .from(githubWorkUnits)
    .orderBy(asc(githubWorkUnits.identityKey));
  return lock ? await query.for("update") : await query;
};

const issueDayFrom = (createdAt: Date) => createdAt.toISOString().slice(0, 10);

const sortedUniqueDays = (days: readonly string[]) =>
  [...new Set(days)].toSorted((left, right) => bytewiseCompare(right, left));

const activeHeadGenerationIsComplete = (
  repositoryId: string,
  headsLastReconciledAt: Date | null,
  desiredRows: readonly {
    active: boolean;
    branchLineageId: string | null;
    headSha: string;
    refName: string;
    repositoryId: string;
  }[],
  generationRows: readonly {
    branchLineageId: string;
    headSha: string;
    refName: string;
    repositoryId: string;
  }[]
) => {
  if (headsLastReconciledAt === null) {
    return false;
  }
  const desiredByRef = new Map(
    desiredRows
      .filter((row) => row.repositoryId === repositoryId)
      .map((row) => [row.refName, row])
  );
  const generations = generationRows.filter(
    (row) => row.repositoryId === repositoryId && desiredByRef.has(row.refName)
  );
  for (const desired of desiredByRef.values()) {
    const generation = generations.find(
      (candidate) => candidate.refName === desired.refName
    );
    if (
      desired.active &&
      (desired.branchLineageId === null ||
        generation === undefined ||
        generation.headSha !== desired.headSha ||
        generation.branchLineageId !== desired.branchLineageId)
    ) {
      return false;
    }
    if (!desired.active && generation !== undefined) {
      return false;
    }
  }
  return generations.every((generation) => {
    const desired = desiredByRef.get(generation.refName);
    return (
      desired?.active === true &&
      desired.headSha === generation.headSha &&
      desired.branchLineageId === generation.branchLineageId
    );
  });
};

const exclusionReasonCountsFrom = (
  changes: readonly GitHubWorkUnitProjectionExcludedChange[]
): Record<GitHubWorkUnitProjectionExclusionReason, number> => {
  const counts: Record<GitHubWorkUnitProjectionExclusionReason, number> = {
    merged_pr_landing: 0,
    canonical_branch_unknown: 0,
    head_generation_incomplete: 0,
    no_current_owner: 0,
    pull_request_coverage_incomplete: 0,
    repository_visibility_unknown: 0,
  };
  for (const change of changes) {
    counts[change.reason] += 1;
  }
  return counts;
};

const excludedChangesFrom = (
  input: GitHubWorkUnitProjectionInput,
  units: readonly GitHubProjectedWorkUnit[],
  ownership: GitHubWorkUnitOwnershipIndex
): readonly GitHubWorkUnitProjectionExcludedChange[] => {
  const published = new Set(
    units.flatMap((unit) => unit.members.map((member) => member.logicalKey))
  );
  const changesByLogicalKey = new Map(
    input.changes.map((change) => [
      logicalKeyFrom(change.logicalRepositoryId, change.logicalSha),
      change,
    ])
  );
  const mergedPullRequestNodeIds = new Set(
    input.pullRequests
      .filter((pullRequest) => pullRequest.state === "merged")
      .map((pullRequest) => pullRequest.nodeId)
  );
  const publishedFileFacts = new Set(
    units.flatMap((unit) =>
      unit.pullRequestNodeId !== null &&
      mergedPullRequestNodeIds.has(unit.pullRequestNodeId)
        ? unit.members.flatMap((member) => {
            const digest = changesByLogicalKey.get(
              member.logicalKey
            )?.fileFactsDigest;
            return digest === null || digest === undefined
              ? []
              : [`${unit.repositoryId}\0${digest}`];
          })
        : []
    )
  );
  const excludedChanges: GitHubWorkUnitProjectionExcludedChange[] = [];
  for (const change of input.changes) {
    if (!isEligibleGitHubWorkChange(change, input.trackedAuthorUserIds)) {
      continue;
    }
    const logicalKey = logicalKeyFrom(
      change.logicalRepositoryId,
      change.logicalSha
    );
    if (published.has(logicalKey)) {
      continue;
    }
    const effectivePullRequest = chooseEffectivePullRequest(
      ownership.pullRequestsByLogicalKey.get(logicalKey) ?? [],
      input.trackedAuthorUserIds
    );
    const repository = ownership.repositoriesById.get(
      effectivePullRequest?.baseRepositoryId ?? change.repositoryId
    );
    let reason: GitHubWorkUnitProjectionExclusionReason;
    const equivalentKey =
      change.fileFactsDigest === null
        ? null
        : `${repository?.id ?? change.repositoryId}\0${change.fileFactsDigest}`;
    if (equivalentKey !== null && publishedFileFacts.has(equivalentKey)) {
      reason = "merged_pr_landing";
    } else if (repository === undefined || repository.visibility === null) {
      reason = "repository_visibility_unknown";
    } else if (effectivePullRequest !== null) {
      throw new Error(
        `Effective pull-request member was not projected: ${logicalKey}`
      );
    } else if (change.verifiedMergeLanding) {
      reason = "merged_pr_landing";
    } else if (!change.pullRequestCoverageComplete) {
      reason = "pull_request_coverage_incomplete";
    } else if (repository.defaultBranch === null) {
      reason = "canonical_branch_unknown";
    } else if (repository.headGenerationComplete) {
      reason = "no_current_owner";
    } else {
      reason = "head_generation_incomplete";
    }
    excludedChanges.push({
      logicalKey,
      reason,
      repositoryId: change.repositoryId,
      sha: change.sha,
    });
  }
  return excludedChanges.toSorted(
    (left, right) =>
      bytewiseCompare(left.repositoryId, right.repositoryId) ||
      bytewiseCompare(left.sha, right.sha)
  );
};

const summaryUsesPullRequestNetOutcome = (
  unit: GitHubProjectedWorkUnit,
  pullRequestsByNodeId: ReadonlyMap<string, GitHubPullRequestProjectionEvidence>
) =>
  unit.kind === "pull_request" &&
  unit.attributionMode === "tracked_authored_pr" &&
  unit.pullRequestNodeId !== null &&
  pullRequestsByNodeId.get(unit.pullRequestNodeId)
    ?.netOutcomeOwnedCompletely === true;

const summaryEvaluationEvidenceFrom = (
  unit: GitHubProjectedWorkUnit,
  commitsByLogicalKey: ReadonlyMap<string, CommitSummaryEvaluationEvidence>,
  pullRequestsByNodeId: ReadonlyMap<
    string,
    GitHubPullRequestProjectionEvidence
  >,
  pullRequestEvidenceByNodeId: ReadonlyMap<
    string,
    PullRequestSummaryEvaluationEvidence
  >
): GitHubWorkUnitSummaryEvaluationEvidence => {
  if (summaryUsesPullRequestNetOutcome(unit, pullRequestsByNodeId)) {
    const pullRequest =
      unit.pullRequestNodeId === null
        ? undefined
        : pullRequestEvidenceByNodeId.get(unit.pullRequestNodeId);
    if (pullRequest === undefined) {
      throw new Error(
        `A pull-request summary lacks evaluation evidence: ${unit.identityKey}`
      );
    }
    return {
      fileFactsComplete: pullRequest.fileFactsComplete,
      fileFactsDigest: pullRequest.fileFactsDigest,
      mode: "net",
    };
  }
  return {
    changes: unit.members.map((member) => {
      const change = commitsByLogicalKey.get(member.logicalKey);
      if (change === undefined) {
        throw new Error(
          `A work-unit summary lacks commit evidence: ${member.logicalKey}`
        );
      }
      const { additions, deletions, fileFactsDigest } = change;
      if (fileFactsDigest === null) {
        throw new Error(
          `An eligible work-unit member lacks a file digest: ${member.logicalKey}`
        );
      }
      return { additions, deletions, fileFactsDigest };
    }),
    mode: "composite",
  };
};

const summaryEvaluationDigestFrom = (
  unit: GitHubProjectedWorkUnit,
  evidence: GitHubWorkUnitSummaryEvaluationEvidence,
  repository: GitHubWorkUnitSummaryRepositoryContext
) =>
  digestGitHubWorkUnitSummaryEvaluation({
    attributionMode: unit.attributionMode,
    evidence,
    kind: unit.kind,
    membershipDigest: unit.membershipDigest,
    repository,
  });

const requiredHydratedFileFacts = (
  factsByKey: ReadonlyMap<string, readonly GitHubWorkUnitFileFact[] | null>,
  key: string
) => {
  if (!factsByKey.has(key)) {
    throw new Error(
      `GitHub summary evidence disappeared while hydrating: ${key}`
    );
  }
  return factsByKey.get(key) ?? null;
};

const hydrateSelectedSummaryEvidence = async (
  transaction: GitHubWorkUnitTransaction,
  input: GitHubWorkUnitProjectionInput,
  units: readonly GitHubProjectedWorkUnit[],
  pullRequestEvidenceByNodeId: ReadonlyMap<
    string,
    PullRequestSummaryEvaluationEvidence
  >
): Promise<GitHubWorkUnitProjectionInput> => {
  if (units.length === 0) {
    return input;
  }
  const pullRequestsByNodeId = new Map(
    input.pullRequests.map((pullRequest) => [pullRequest.nodeId, pullRequest])
  );
  const netPullRequestNodeIds = new Set<string>();
  const compositeMembers = new Map<
    string,
    { repositoryId: string; sha: string }
  >();
  for (const unit of units) {
    if (summaryUsesPullRequestNetOutcome(unit, pullRequestsByNodeId)) {
      if (unit.pullRequestNodeId !== null) {
        netPullRequestNodeIds.add(unit.pullRequestNodeId);
      }
      continue;
    }
    for (const member of unit.members) {
      compositeMembers.set(member.logicalKey, {
        repositoryId: member.logicalRepositoryId,
        sha: member.logicalSha,
      });
    }
  }

  const memberRows =
    compositeMembers.size === 0
      ? []
      : await transaction
          .select({
            fileFacts: githubCommits.fileFacts,
            repositoryId: githubCommits.repositoryId,
            sha: githubCommits.sha,
          })
          .from(githubCommits)
          .where(
            or(
              ...[...compositeMembers.values()].map((member) =>
                and(
                  eq(githubCommits.repositoryId, member.repositoryId),
                  eq(githubCommits.sha, member.sha)
                )
              )
            )
          );
  const rawCommitFactsByLogicalKey = new Map(
    memberRows.map((row) => [
      logicalKeyFrom(row.repositoryId, row.sha),
      checkedFileFacts(row.fileFacts),
    ])
  );

  const versionIds = [...netPullRequestNodeIds].map((nodeId) => {
    const evidence = pullRequestEvidenceByNodeId.get(nodeId);
    if (evidence === undefined) {
      throw new Error(
        `A pull-request summary lacks version evidence: ${nodeId}`
      );
    }
    return evidence.versionId;
  });
  const versionRows =
    versionIds.length === 0
      ? []
      : await transaction
          .select({
            fileFacts: githubPullRequestVersions.fileFacts,
            id: githubPullRequestVersions.id,
          })
          .from(githubPullRequestVersions)
          .where(inArray(githubPullRequestVersions.id, versionIds));
  const rawPullRequestFactsByVersionId = new Map(
    versionRows.map((row) => [row.id, checkedFileFacts(row.fileFacts)])
  );

  return {
    ...input,
    changes: input.changes.map((change) => {
      const logicalKey = logicalKeyFrom(
        change.logicalRepositoryId,
        change.logicalSha
      );
      if (!compositeMembers.has(logicalKey)) {
        return change;
      }
      const fileFacts = requiredHydratedFileFacts(
        rawCommitFactsByLogicalKey,
        logicalKey
      );
      return {
        ...change,
        fileFacts: fileFacts ?? [],
        fileFactsComplete: change.fileFactsComplete && fileFacts !== null,
        summaryFileFacts: fileFacts,
      };
    }),
    pullRequests: input.pullRequests.map((pullRequest) => {
      if (!netPullRequestNodeIds.has(pullRequest.nodeId)) {
        return pullRequest;
      }
      const evidence = pullRequestEvidenceByNodeId.get(pullRequest.nodeId);
      if (evidence === undefined) {
        throw new Error(
          `A pull-request summary lacks version evidence: ${pullRequest.nodeId}`
        );
      }
      const fileFacts = requiredHydratedFileFacts(
        rawPullRequestFactsByVersionId,
        evidence.versionId
      );
      return {
        ...pullRequest,
        netOutcome:
          fileFacts === null
            ? null
            : {
                complete: evidence.fileFactsComplete,
                files: fileFacts,
                providerFileCapReached: false,
              },
      };
    }),
  };
};

interface ProjectionSnapshotOptions {
  lockCurrentUnits: boolean;
  summaryEvaluationLimit: number;
}

// oxlint-disable-next-line eslint/complexity -- This is one linear mapping of a transactionally consistent evidence snapshot; splitting ownership decisions across loaders would duplicate the production contract used by the verifier.
const loadProjectionSnapshot = async (
  transaction: GitHubWorkUnitTransaction,
  { lockCurrentUnits, summaryEvaluationLimit }: ProjectionSnapshotOptions
): Promise<LoadedProjectionSnapshot> => {
  const currentUnits = await readCurrentUnits(transaction, lockCurrentUnits);
  const repositoryRows = await transaction
    .select({
      defaultBranch: githubRepositories.defaultBranch,
      description: githubRepositories.description,
      factsVerifiedAt: githubRepositories.factsVerifiedAt,
      fullName: githubRepositories.fullName,
      headsLastReconciledAt: githubRepositories.headsLastReconciledAt,
      homepageUrl: githubRepositories.homepageUrl,
      id: githubRepositories.id,
      topics: githubRepositories.topics,
      visibility: githubRepositories.visibility,
    })
    .from(githubRepositories)
    .orderBy(asc(githubRepositories.id));
  const desiredHeadRows = await transaction
    .select({
      active: githubRepositoryRefs.active,
      branchLineageId: githubRepositoryRefs.branchLineageId,
      headSha: githubRepositoryRefs.headSha,
      lastObservedAt: githubRepositoryRefs.lastObservedAt,
      refName: githubRepositoryRefs.refName,
      repositoryId: githubRepositoryRefs.repositoryId,
    })
    .from(githubRepositoryRefs)
    .where(
      and(
        eq(githubRepositoryRefs.kind, "head"),
        eq(githubRepositoryRefs.projectionRelevant, true)
      )
    )
    .orderBy(
      asc(githubRepositoryRefs.repositoryId),
      asc(githubRepositoryRefs.refName)
    );
  const generationRows = await transaction
    .select({
      branchLineageId: githubRefGenerations.branchLineageId,
      completedAt: githubRefGenerations.completedAt,
      generation: githubRefGenerations.generation,
      headSha: githubRefGenerations.headSha,
      refName: githubRefGenerations.refName,
      repositoryId: githubRefGenerations.repositoryId,
    })
    .from(githubRefGenerations)
    .innerJoin(
      githubRepositoryRefs,
      and(
        eq(
          githubRepositoryRefs.repositoryId,
          githubRefGenerations.repositoryId
        ),
        eq(githubRepositoryRefs.refName, githubRefGenerations.refName),
        eq(githubRepositoryRefs.kind, "head"),
        eq(githubRepositoryRefs.projectionRelevant, true)
      )
    )
    .orderBy(
      asc(githubRefGenerations.repositoryId),
      asc(githubRefGenerations.refName)
    );
  const refMembershipRows = await transaction
    .select({
      commitRepositoryId: githubRefMemberships.commitRepositoryId,
      commitSha: githubRefMemberships.commitSha,
      generation: githubRefMemberships.generation,
      position: githubRefMemberships.position,
      refName: githubRefMemberships.refName,
      repositoryId: githubRefMemberships.repositoryId,
    })
    .from(githubRefMemberships)
    .innerJoin(
      githubRefGenerations,
      and(
        eq(
          githubRefGenerations.repositoryId,
          githubRefMemberships.repositoryId
        ),
        eq(githubRefGenerations.refName, githubRefMemberships.refName),
        eq(githubRefGenerations.generation, githubRefMemberships.generation)
      )
    )
    .innerJoin(
      githubRepositoryRefs,
      and(
        eq(
          githubRepositoryRefs.repositoryId,
          githubRefMemberships.repositoryId
        ),
        eq(githubRepositoryRefs.refName, githubRefMemberships.refName),
        eq(githubRepositoryRefs.kind, "head"),
        eq(githubRepositoryRefs.projectionRelevant, true)
      )
    )
    .orderBy(
      asc(githubRefMemberships.repositoryId),
      asc(githubRefMemberships.refName),
      asc(githubRefMemberships.position)
    );
  const verifiedMergeLanding = transaction
    .select({ one: sql<number>`1` })
    .from(githubPullRequests)
    .where(
      and(
        eq(githubPullRequests.repositoryId, githubCommits.repositoryId),
        eq(githubPullRequests.state, "merged"),
        isNotNull(githubPullRequests.mergeShaVerifiedAt),
        eq(githubPullRequests.mergeSha, githubCommits.sha)
      )
    );
  const commitRows = await transaction
    .select({
      additions: githubCommits.additions,
      authorUserId: githubCommits.authorUserId,
      committedAt: githubCommits.committedAt,
      committerAt: githubCommits.committerAt,
      deletions: githubCommits.deletions,
      enrichmentState: githubCommits.enrichmentState,
      fileFacts: compactFileFacts,
      fileFactsComplete: githubCommits.fileFactsComplete,
      fileFactsDigest: githubCommits.fileFactsDigest,
      firstObservedAt: githubCommits.firstObservedAt,
      parentShas: githubCommits.parentShas,
      providerFileCapReached: githubCommits.providerFileCapReached,
      pullRequestDiscoveryState: githubCommits.pullRequestDiscoveryState,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
      verifiedMergeLanding: exists(verifiedMergeLanding).mapWith(Boolean),
    })
    .from(githubCommits)
    .where(inArray(githubCommits.authorUserId, [...trackedAuthorUserIds]))
    .orderBy(asc(githubCommits.repositoryId), asc(githubCommits.sha));
  const changes: GitHubLogicalChange[] = commitRows.map((row) => {
    const fileFacts = checkedCompactFileFacts(row.fileFacts);
    const parentShas = checkedParentShas(row.parentShas);
    const pullRequestCoverageComplete =
      row.pullRequestDiscoveryState === "complete";
    return {
      additions: row.additions ?? -1,
      authorUserId: row.authorUserId,
      contentObservedAt: row.firstObservedAt.toISOString(),
      deletions: row.deletions ?? -1,
      enrichmentComplete: row.enrichmentState === "complete",
      fileFacts: fileFacts ?? [],
      fileFactsComplete: row.fileFactsComplete && fileFacts !== null,
      fileFactsDigest: checkedDigest(row.fileFactsDigest),
      logicalActivityAt: (row.committerAt ?? row.committedAt).toISOString(),
      logicalRepositoryId: row.repositoryId,
      logicalSha: row.sha,
      parentCount: parentShas?.length ?? -1,
      parentLogicalKeys:
        parentShas?.map((sha) => logicalKeyFrom(row.repositoryId, sha)) ?? [],
      providerFileCapReached: row.providerFileCapReached,
      pullRequestCoverageComplete,
      repositoryId: row.repositoryId,
      sha: row.sha,
      summaryFileFacts: null,
      verifiedMergeLanding: row.verifiedMergeLanding,
    };
  });
  const commitSummaryEvidenceByLogicalKey = new Map(
    commitRows.map((row) => [
      logicalKeyFrom(row.repositoryId, row.sha),
      {
        additions: row.additions ?? -1,
        deletions: row.deletions ?? -1,
        fileFactsDigest: checkedDigest(row.fileFactsDigest),
      },
    ])
  );
  const eligibleChanges = new Set(
    changes
      .filter((change) =>
        isEligibleGitHubWorkChange(change, trackedAuthorUserIds)
      )
      .map((change) =>
        logicalKeyFrom(change.logicalRepositoryId, change.logicalSha)
      )
  );
  const pullRequestRows = await transaction
    .select({
      authorUserId: githubPullRequests.authorUserId,
      baseRepositoryId: githubPullRequestVersions.baseRepositoryId,
      baseSha: githubPullRequestVersions.baseSha,
      commitCount: githubPullRequestVersions.commitCount,
      createdAt: githubPullRequests.createdAt,
      fileFactsComplete: githubPullRequestVersions.fileFactsComplete,
      fileFactsDigest: githubPullRequestVersions.fileFactsDigest,
      headSha: githubPullRequestVersions.headSha,
      mergeSnapshot: githubPullRequestVersions.mergeSnapshot,
      membershipComplete: githubPullRequestVersions.membershipComplete,
      nodeId: githubPullRequests.nodeId,
      observedAt: githubPullRequestVersions.observedAt,
      repositoryId: githubPullRequests.repositoryId,
      state: githubPullRequests.state,
      versionId: githubPullRequestVersions.id,
    })
    .from(githubPullRequests)
    .innerJoin(
      githubPullRequestVersions,
      and(
        eq(
          githubPullRequestVersions.pullRequestNodeId,
          githubPullRequests.nodeId
        ),
        eq(githubPullRequestVersions.isCurrent, true)
      )
    )
    .orderBy(asc(githubPullRequests.nodeId));
  const pullRequestMembershipRows = await transaction
    .select({
      commitRepositoryId: githubPullRequestMemberships.commitRepositoryId,
      commitSha: githubPullRequestMemberships.commitSha,
      position: githubPullRequestMemberships.position,
      versionId: githubPullRequestMemberships.versionId,
    })
    .from(githubPullRequestMemberships)
    .innerJoin(
      githubPullRequestVersions,
      and(
        eq(
          githubPullRequestVersions.id,
          githubPullRequestMemberships.versionId
        ),
        eq(githubPullRequestVersions.isCurrent, true)
      )
    )
    .orderBy(
      asc(githubPullRequestMemberships.versionId),
      asc(githubPullRequestMemberships.position)
    );
  const membershipsByVersion = new Map<
    string,
    typeof pullRequestMembershipRows
  >();
  for (const membership of pullRequestMembershipRows) {
    const rows = membershipsByVersion.get(membership.versionId) ?? [];
    rows.push(membership);
    membershipsByVersion.set(membership.versionId, rows);
  }
  const pullRequests: GitHubPullRequestProjectionEvidence[] = [];
  for (const row of pullRequestRows) {
    if (
      row.state !== "closed" &&
      row.state !== "merged" &&
      row.state !== "open"
    ) {
      continue;
    }
    if (row.state === "merged" && !row.mergeSnapshot) {
      continue;
    }
    const memberships = membershipsByVersion.get(row.versionId) ?? [];
    const memberLogicalKeys = memberships.map((membership) =>
      logicalKeyFrom(membership.commitRepositoryId, membership.commitSha)
    );
    const membershipComplete =
      row.membershipComplete &&
      row.commitCount !== null &&
      row.commitCount === memberships.length &&
      new Set(memberLogicalKeys).size === memberships.length &&
      (memberships.length === 0 ||
        memberships.at(-1)?.commitSha === row.headSha);
    pullRequests.push({
      authorUserId: row.authorUserId,
      baseRepositoryId: row.baseRepositoryId ?? row.repositoryId,
      baseSha: row.baseSha,
      contentObservedAt: row.observedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      headSha: row.headSha,
      memberLogicalKeys,
      membershipComplete,
      netOutcome: null,
      netOutcomeOwnedCompletely:
        membershipComplete &&
        memberLogicalKeys.length > 0 &&
        memberLogicalKeys.every((key) => eligibleChanges.has(key)),
      nodeId: row.nodeId,
      snapshotKind: row.state === "open" ? "current" : "final",
      state: row.state,
    });
  }
  const pullRequestSummaryEvidenceByNodeId = new Map(
    pullRequestRows.map((row) => [
      row.nodeId,
      {
        fileFactsComplete: row.fileFactsComplete,
        fileFactsDigest: checkedDigest(row.fileFactsDigest),
        versionId: row.versionId,
      },
    ])
  );
  const desiredByRef = new Map(
    desiredHeadRows.map((row) => [
      refKeyFrom(row.repositoryId, row.refName),
      row,
    ])
  );
  const refMembersByRef = new Map<string, typeof refMembershipRows>();
  for (const membership of refMembershipRows) {
    const key = refKeyFrom(membership.repositoryId, membership.refName);
    const rows = refMembersByRef.get(key) ?? [];
    rows.push(membership);
    refMembersByRef.set(key, rows);
  }
  const refs = generationRows.flatMap((generation) => {
    const key = refKeyFrom(generation.repositoryId, generation.refName);
    const desired = desiredByRef.get(key);
    if (
      desired?.active !== true ||
      desired.branchLineageId === null ||
      desired.headSha !== generation.headSha ||
      desired.branchLineageId !== generation.branchLineageId
    ) {
      return [];
    }
    const memberships = (refMembersByRef.get(key) ?? []).filter(
      (membership) => membership.generation === generation.generation
    );
    return [
      {
        branchLineageId: generation.branchLineageId,
        complete: true,
        contentObservedAt: generation.completedAt.toISOString(),
        headSha: generation.headSha,
        memberLogicalKeys: memberships.map((membership) =>
          logicalKeyFrom(membership.commitRepositoryId, membership.commitSha)
        ),
        refName: generation.refName,
        repositoryId: generation.repositoryId,
      },
    ];
  });
  const repositories: GitHubRepositoryProjectionEvidence[] = repositoryRows.map(
    (repository) => ({
      defaultBranch: repository.defaultBranch,
      headGenerationComplete: activeHeadGenerationIsComplete(
        repository.id,
        repository.headsLastReconciledAt,
        desiredHeadRows,
        generationRows
      ),
      id: repository.id,
      visibility: visibilityFrom(
        repository.visibility,
        repository.factsVerifiedAt
      ),
    })
  );
  const compactInput: GitHubWorkUnitProjectionInput = {
    changes,
    priorActivityAnchors: currentUnits.flatMap((unit) =>
      unit.outcomeDigest === null
        ? []
        : [
            {
              activityAnchorAt: unit.activityAnchorAt.toISOString(),
              attributionMode: unit.attributionMode,
              identityKey: unit.identityKey,
              outcomeDigest: unit.outcomeDigest,
              repositoryId: unit.repositoryId,
            },
          ]
    ),
    pullRequests,
    refs,
    repositories,
    trackedAuthorUserIds,
  };
  const cachedOutcomeDigests = new Map(
    currentUnits.map((unit) => [unit.identityKey, unit.outcomeDigest])
  );
  const compactOwnership = indexGitHubWorkUnitOwnershipEvidence(compactInput);
  const compactUnits = projectGitHubWorkUnits(compactInput, compactOwnership, {
    outcomeDigests: cachedOutcomeDigests,
  });
  const repositoryContexts = new Map(
    repositoryRows.map((repository) => [
      repository.id,
      {
        description: repository.description,
        fullName: repository.fullName,
        homepageUrl: repository.homepageUrl,
        topics: repository.topics ?? [],
      },
    ])
  );
  const pullRequestsByNodeId = new Map(
    pullRequests.map((pullRequest) => [pullRequest.nodeId, pullRequest])
  );
  const summaryEvaluationEvidence = new Map<
    string,
    GitHubWorkUnitSummaryEvaluationEvidence
  >();
  const summaryEvaluationDigests = new Map<string, string>();
  for (const unit of compactUnits) {
    const repository = repositoryContexts.get(unit.repositoryId);
    if (repository === undefined) {
      throw new Error(
        `A work unit lacks repository context: ${unit.identityKey}`
      );
    }
    const evidence = summaryEvaluationEvidenceFrom(
      unit,
      commitSummaryEvidenceByLogicalKey,
      pullRequestsByNodeId,
      pullRequestSummaryEvidenceByNodeId
    );
    summaryEvaluationEvidence.set(unit.identityKey, evidence);
    summaryEvaluationDigests.set(
      unit.identityKey,
      summaryEvaluationDigestFrom(unit, evidence, repository)
    );
  }
  const currentByIdentity = new Map(
    currentUnits.map((unit) => [unit.identityKey, unit])
  );
  const pendingSummaryEvaluations = compactUnits
    .filter((unit) => {
      const digest = summaryEvaluationDigests.get(unit.identityKey);
      return (
        digest !== undefined &&
        currentByIdentity.get(unit.identityKey)?.summaryEvaluatedDigest !==
          digest
      );
    })
    .toSorted(
      (left, right) =>
        Date.parse(right.activityAt) - Date.parse(left.activityAt) ||
        Date.parse(right.contentObservedAt) -
          Date.parse(left.contentObservedAt) ||
        bytewiseCompare(left.identityKey, right.identityKey)
    );
  const selectedSummaryEvaluations = pendingSummaryEvaluations.slice(
    0,
    summaryEvaluationLimit
  );
  const input = await hydrateSelectedSummaryEvidence(
    transaction,
    compactInput,
    selectedSummaryEvaluations,
    pullRequestSummaryEvidenceByNodeId
  );
  const selectedSummaryIdentities = new Set(
    selectedSummaryEvaluations.map((unit) => unit.identityKey)
  );
  const outcomeDigests = new Map(
    [...cachedOutcomeDigests].filter(
      ([identityKey]) => !selectedSummaryIdentities.has(identityKey)
    )
  );
  const ownership =
    selectedSummaryEvaluations.length === 0
      ? compactOwnership
      : indexGitHubWorkUnitOwnershipEvidence(input);
  const units =
    selectedSummaryEvaluations.length === 0
      ? compactUnits
      : projectGitHubWorkUnits(input, ownership, { outcomeDigests });
  const excludedChanges = excludedChangesFrom(input, units, ownership);
  const issueRows = await transaction
    .select({
      createdAt: githubIssues.createdAt,
      visibility: githubRepositories.visibility,
    })
    .from(githubIssues)
    .innerJoin(
      githubRepositories,
      eq(githubIssues.repositoryId, githubRepositories.id)
    )
    .where(
      inArray(githubRepositories.visibility, ["public", "private", "internal"])
    );
  const issueDays = issueRows.map((issue) => issueDayFrom(issue.createdAt));
  return {
    currentUnits,
    input,
    issueDays,
    repositoryContexts,
    summaryEvaluationDigests,
    selectedSummaryEvaluationIdentities: selectedSummaryIdentities,
    summaryEvaluationEvidence,
    summaryEvaluationsPending:
      pendingSummaryEvaluations.length - selectedSummaryEvaluations.length,
    excludedChanges,
    exclusionReasonCounts: exclusionReasonCountsFrom(excludedChanges),
    units,
  };
};

/** Uses the same durable-evidence mapping and projector as publication. */
export const readGitHubWorkUnitProjectionEvidence =
  async (): Promise<GitHubWorkUnitProjectionSnapshot> =>
    await getDatabase().transaction(
      async (transaction) => {
        const snapshot = await loadProjectionSnapshot(transaction, {
          lockCurrentUnits: false,
          summaryEvaluationLimit: 0,
        });
        return {
          excludedChanges: snapshot.excludedChanges,
          exclusionReasonCounts: snapshot.exclusionReasonCounts,
          input: snapshot.input,
          units: snapshot.units,
        };
      },
      { accessMode: "read only", isolationLevel: "repeatable read" }
    );

const materialProjectionChanged = (
  current: CurrentWorkUnitRow,
  projected: GitHubProjectedWorkUnit
) =>
  current.factsDigest !== projected.factsDigest ||
  current.outcomeDigest !== projected.outcomeDigest;

const publicOrderingSignature = (
  units: readonly (CurrentWorkUnitRow | GitHubProjectedWorkUnit)[]
) => {
  const visibleUnits = units
    .map((unit) => ({
      activityAt:
        unit.activityAt instanceof Date
          ? unit.activityAt.toISOString()
          : unit.activityAt,
      activityDay: unit.activityDay,
      identityKey: unit.identityKey,
      membershipDigest: unit.membershipDigest,
      repositoryId: unit.repositoryId,
    }))
    .toSorted(
      (left, right) =>
        bytewiseCompare(right.activityAt, left.activityAt) ||
        bytewiseCompare(left.repositoryId, right.repositoryId) ||
        bytewiseCompare(left.identityKey, right.identityKey)
    );
  return JSON.stringify(visibleUnits);
};

const initialPageDaysFrom = (
  units: readonly (CurrentWorkUnitRow | GitHubProjectedWorkUnit)[],
  issueDays: readonly string[]
) =>
  sortedUniqueDays([
    ...issueDays,
    ...units.map((unit) => unit.activityDay),
  ]).slice(0, PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE);

const initialPageChanged = (
  current: readonly CurrentWorkUnitRow[],
  projected: readonly GitHubProjectedWorkUnit[],
  changedIdentities: ReadonlySet<string>,
  issueDays: readonly string[]
) => {
  const headDays = new Set([
    ...initialPageDaysFrom(current, issueDays),
    ...initialPageDaysFrom(projected, issueDays),
  ]);
  const currentByIdentity = new Map(
    current.map((unit) => [unit.identityKey, unit])
  );
  const projectedByIdentity = new Map(
    projected.map((unit) => [unit.identityKey, unit])
  );
  for (const identityKey of changedIdentities) {
    const before = currentByIdentity.get(identityKey);
    const after = projectedByIdentity.get(identityKey);
    if (before !== undefined && headDays.has(before.activityDay)) {
      return true;
    }
    if (after !== undefined && headDays.has(after.activityDay)) {
      return true;
    }
  }
  return false;
};

const languageSignature = (languages: readonly GitHubLanguageFact[] | null) =>
  JSON.stringify(
    languages?.map(({ changedLines, id, label }) => ({
      changedLines,
      id,
      label,
    })) ?? null
  );

const publicPayloadChanged = (
  current: CurrentWorkUnitRow,
  projected: GitHubProjectedWorkUnit
) =>
  current.activityAt.toISOString() !== projected.activityAt ||
  current.activityDay !== projected.activityDay ||
  current.additions !== projected.facts.additions ||
  current.deletions !== projected.facts.deletions ||
  current.fileCount !== projected.facts.fileCount ||
  current.firstActivityAt.toISOString() !== projected.firstActivityAt ||
  current.kind !== projected.kind ||
  languageSignature(current.languages) !==
    languageSignature(projected.facts.languages) ||
  current.lastActivityAt.toISOString() !== projected.lastActivityAt ||
  current.memberCount !== projected.facts.memberCount ||
  current.newestCommitSha !== projected.newestCommitSha ||
  current.outcomeDigest !== projected.outcomeDigest ||
  current.pullRequestNodeId !== projected.pullRequestNodeId ||
  current.repositoryId !== projected.repositoryId ||
  current.visibility !== projected.visibility;

const projectedValues = (
  projected: GitHubProjectedWorkUnit,
  revision: number,
  summaryEvaluationDigest: string | null,
  summaryEvaluatedDigest: string | null,
  summaryInputDigest: string | null
) => ({
  activityAnchorAt: new Date(projected.activityAnchorAt),
  activityAt: new Date(projected.activityAt),
  activityDay: projected.activityDay,
  additions: projected.facts.additions,
  attributionMode: projected.attributionMode,
  branchLineageId: projected.branchLineageId,
  contentObservedAt: new Date(projected.contentObservedAt),
  deletions: projected.facts.deletions,
  factsDigest: projected.factsDigest,
  fileCount: projected.facts.fileCount,
  firstActivityAt: new Date(projected.firstActivityAt),
  identityKey: projected.identityKey,
  kind: projected.kind,
  languages: projected.facts.languages,
  lastActivityAt: new Date(projected.lastActivityAt),
  memberCount: projected.facts.memberCount,
  membershipDigest: projected.membershipDigest,
  newestCommitRepositoryId: projected.newestCommitRepositoryId,
  newestCommitSha: projected.newestCommitSha,
  outcomeDigest: projected.outcomeDigest,
  pullRequestNodeId: projected.pullRequestNodeId,
  repositoryId: projected.repositoryId,
  revision,
  summaryEvaluationDigest,
  summaryEvaluatedDigest,
  summaryInputDigest,
  visibility: projected.visibility,
});

const membershipValues = (unitId: string, unit: GitHubProjectedWorkUnit) =>
  unit.members.map((member) => ({
    logicalRepositoryId: member.logicalRepositoryId,
    logicalSha: member.logicalSha,
    position: member.position,
    workUnitId: unitId,
  }));

const persistedSummaryCandidate = (
  snapshot: LoadedProjectionSnapshot,
  id: string,
  projected: GitHubProjectedWorkUnit,
  revision: number
): PersistedProjectionUnit | null => {
  if (
    !snapshot.selectedSummaryEvaluationIdentities.has(projected.identityKey)
  ) {
    return null;
  }
  const summaryEvaluationDigest = snapshot.summaryEvaluationDigests.get(
    projected.identityKey
  );
  if (summaryEvaluationDigest === undefined) {
    throw new Error(
      `A selected summary lacks an evaluation digest: ${projected.identityKey}`
    );
  }
  return { id, projected, revision, summaryEvaluationDigest };
};

const projectedSummaryEvaluationDigest = (
  snapshot: LoadedProjectionSnapshot,
  projected: GitHubProjectedWorkUnit
) => {
  const digest = snapshot.summaryEvaluationDigests.get(projected.identityKey);
  if (digest === undefined) {
    throw new Error(
      `A work unit lacks a summary evaluation digest: ${projected.identityKey}`
    );
  }
  return digest;
};

const persistProjectedUnit = async (
  transaction: GitHubWorkUnitTransaction,
  snapshot: LoadedProjectionSnapshot,
  projected: GitHubProjectedWorkUnit,
  current: CurrentWorkUnitRow | undefined
): Promise<PersistedProjectionUnit | null> => {
  const summaryEvaluationDigest = projectedSummaryEvaluationDigest(
    snapshot,
    projected
  );
  if (current === undefined) {
    const [row] = await transaction
      .insert(githubWorkUnits)
      .values(
        projectedValues(projected, 1, summaryEvaluationDigest, null, null)
      )
      .returning({ id: githubWorkUnits.id });
    if (row === undefined) {
      throw new Error("A GitHub work unit could not be inserted.");
    }
    await transaction
      .insert(githubWorkUnitMemberships)
      .values(membershipValues(row.id, projected));
    return persistedSummaryCandidate(snapshot, row.id, projected, 1);
  }

  const summaryEvaluationChanged =
    summaryEvaluationDigest !== current.summaryEvaluationDigest;
  if (!materialProjectionChanged(current, projected)) {
    const contentObservedAtChanged =
      current.contentObservedAt.toISOString() !== projected.contentObservedAt;
    if (contentObservedAtChanged || summaryEvaluationChanged) {
      await transaction
        .update(githubWorkUnits)
        .set({
          ...(contentObservedAtChanged
            ? { contentObservedAt: new Date(projected.contentObservedAt) }
            : {}),
          ...(summaryEvaluationChanged ? { summaryEvaluationDigest } : {}),
        })
        .where(eq(githubWorkUnits.id, current.id));
    }
    return persistedSummaryCandidate(
      snapshot,
      current.id,
      projected,
      current.revision
    );
  }

  const revision = current.revision + 1;
  await transaction
    .update(githubWorkUnits)
    .set(
      projectedValues(
        projected,
        revision,
        summaryEvaluationDigest,
        current.summaryEvaluatedDigest,
        current.summaryInputDigest
      )
    )
    .where(eq(githubWorkUnits.id, current.id));
  await transaction
    .insert(githubWorkUnitMemberships)
    .values(membershipValues(current.id, projected));
  return persistedSummaryCandidate(snapshot, current.id, projected, revision);
};

const persistSummaryEvaluationTargets = async (
  transaction: GitHubWorkUnitTransaction,
  snapshot: LoadedProjectionSnapshot,
  currentByIdentity: Map<string, CurrentWorkUnitRow>
) => {
  const targets = snapshot.units.flatMap((projected) => {
    const current = currentByIdentity.get(projected.identityKey);
    const digest = snapshot.summaryEvaluationDigests.get(projected.identityKey);
    return current !== undefined &&
      digest !== undefined &&
      !materialProjectionChanged(current, projected) &&
      current.summaryEvaluationDigest !== digest
      ? [{ digest, id: current.id, identityKey: projected.identityKey }]
      : [];
  });
  if (targets.length === 0) {
    return;
  }
  await transaction.execute(sql`
    update ${githubWorkUnits} as work_unit
    set summary_evaluation_digest = target.digest
    from jsonb_to_recordset(${JSON.stringify(targets)}::jsonb)
      as target(id uuid, digest varchar(64))
    where work_unit.id = target.id
  `);
  for (const target of targets) {
    const current = currentByIdentity.get(target.identityKey);
    if (current !== undefined) {
      currentByIdentity.set(target.identityKey, {
        ...current,
        summaryEvaluationDigest: target.digest,
      });
    }
  }
};

const swapProjection = async (
  transaction: GitHubWorkUnitTransaction,
  snapshot: LoadedProjectionSnapshot,
  now: Date
): Promise<ProjectionSwapResult> => {
  const currentByIdentity = new Map(
    snapshot.currentUnits.map((unit) => [unit.identityKey, unit])
  );
  const projectedByIdentity = new Map(
    snapshot.units.map((unit) => [unit.identityKey, unit])
  );
  const deleted = snapshot.currentUnits.filter(
    (unit) => !projectedByIdentity.has(unit.identityKey)
  );
  const inserted = snapshot.units.filter(
    (unit) => !currentByIdentity.has(unit.identityKey)
  );
  const updated = snapshot.units.filter((unit) => {
    const current = currentByIdentity.get(unit.identityKey);
    return current !== undefined && materialProjectionChanged(current, unit);
  });
  const publicPayloadIdentities = new Set([
    ...deleted.map((unit) => unit.identityKey),
    ...inserted.map((unit) => unit.identityKey),
    ...updated.flatMap((unit) => {
      const current = currentByIdentity.get(unit.identityKey);
      return current !== undefined && publicPayloadChanged(current, unit)
        ? [unit.identityKey]
        : [];
    }),
  ]);
  const affectedCurrentIds = [
    ...deleted.map((unit) => unit.id),
    ...updated.flatMap((unit) => {
      const current = currentByIdentity.get(unit.identityKey);
      return current === undefined ? [] : [current.id];
    }),
  ];
  if (affectedCurrentIds.length > 0) {
    await transaction
      .delete(githubWorkUnitMemberships)
      .where(inArray(githubWorkUnitMemberships.workUnitId, affectedCurrentIds));
  }
  if (deleted.length > 0) {
    await transaction.delete(githubWorkUnits).where(
      inArray(
        githubWorkUnits.id,
        deleted.map((unit) => unit.id)
      )
    );
  }
  await persistSummaryEvaluationTargets(
    transaction,
    snapshot,
    currentByIdentity
  );
  const summaryCandidates: PersistedProjectionUnit[] = [];
  for (const projected of snapshot.units) {
    const candidate = await persistProjectedUnit(
      transaction,
      snapshot,
      projected,
      currentByIdentity.get(projected.identityKey)
    );
    if (candidate !== null) {
      summaryCandidates.push(candidate);
    }
  }
  const orderingRevisionChanged =
    publicOrderingSignature(snapshot.currentUnits) !==
    publicOrderingSignature(snapshot.units);
  const feedRevisionChanged = initialPageChanged(
    snapshot.currentUnits,
    snapshot.units,
    publicPayloadIdentities,
    snapshot.issueDays
  );
  if (orderingRevisionChanged || feedRevisionChanged) {
    const [head] = await transaction
      .select({ id: githubPublicFeedHead.id })
      .from(githubPublicFeedHead)
      .where(eq(githubPublicFeedHead.id, true))
      .for("update");
    if (head === undefined) {
      throw new Error("The GitHub public feed head is unavailable.");
    }
    await transaction
      .update(githubPublicFeedHead)
      .set({
        ...(feedRevisionChanged
          ? {
              feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
              headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
              lastPublishedAt: now,
            }
          : {}),
        ...(orderingRevisionChanged
          ? {
              orderingRevision: sql`${githubPublicFeedHead.orderingRevision} + 1`,
            }
          : {}),
      })
      .where(eq(githubPublicFeedHead.id, true));
  }
  return {
    deletedUnits: deleted.length,
    feedRevisionChanged,
    insertedUnits: inserted.length,
    orderingRevisionChanged,
    summaryCandidates,
    updatedUnits: updated.length,
  };
};

const summaryOutcomeFrom = (
  unit: GitHubProjectedWorkUnit,
  changesByKey: ReadonlyMap<string, GitHubLogicalChange>,
  pullRequestsByNodeId: ReadonlyMap<string, GitHubPullRequestProjectionEvidence>
): GitHubWorkUnitSummaryOutcomeEvidence | null => {
  if (unit.kind === "pull_request") {
    if (unit.pullRequestNodeId === null) {
      throw new Error("A projected pull-request unit lacks its pull request.");
    }
    const pullRequest = pullRequestsByNodeId.get(unit.pullRequestNodeId);
    if (pullRequest === undefined) {
      throw new Error(
        `A projected unit references an unavailable pull request: ${unit.pullRequestNodeId}`
      );
    }
    if (
      unit.attributionMode === "tracked_authored_pr" &&
      pullRequest.netOutcomeOwnedCompletely
    ) {
      if (pullRequest.netOutcome === null) {
        return null;
      }
      const additions = pullRequest.netOutcome.files.reduce(
        (total, file) => total + file.additions,
        0
      );
      const deletions = pullRequest.netOutcome.files.reduce(
        (total, file) => total + file.deletions,
        0
      );
      const diff = githubWorkUnitSummaryDiffEvidenceFrom(
        pullRequest.netOutcome.files,
        additions,
        deletions,
        pullRequest.netOutcome.complete,
        pullRequest.netOutcome.providerFileCapReached
      );
      return diff === null ? null : { diff, mode: "net" };
    }
  }
  const compositeChanges = unit.members.map((member) => {
    const change = changesByKey.get(member.logicalKey);
    if (change === undefined) {
      throw new Error(
        `A projected unit references an unavailable change: ${member.logicalKey}`
      );
    }
    return change.summaryFileFacts === null
      ? null
      : githubWorkUnitSummaryDiffEvidenceFrom(
          change.summaryFileFacts,
          change.additions,
          change.deletions,
          change.fileFactsComplete,
          change.providerFileCapReached
        );
  });
  if (compositeChanges.some((change) => change === null)) {
    return null;
  }
  return {
    changes: compositeChanges as NonNullable<
      (typeof compositeChanges)[number]
    >[],
    mode: "composite",
  };
};

const summaryCandidateFrom = (
  snapshot: LoadedProjectionSnapshot,
  unit: GitHubProjectedWorkUnit,
  changesByKey: ReadonlyMap<string, GitHubLogicalChange>,
  pullRequestsByNodeId: ReadonlyMap<string, GitHubPullRequestProjectionEvidence>
): GitHubWorkUnitSummaryCandidate | null => {
  const repository = snapshot.repositoryContexts.get(unit.repositoryId);
  const outcome = summaryOutcomeFrom(unit, changesByKey, pullRequestsByNodeId);
  if (repository === undefined) {
    throw new Error(
      `A projected unit references an unavailable repository: ${unit.repositoryId}`
    );
  }
  if (outcome === null) {
    return null;
  }
  return {
    attributionMode: unit.attributionMode,
    kind: unit.kind,
    membership: {
      members: unit.members.map((member) => ({
        logicalChangeKey: member.logicalKey,
        order: member.position,
      })),
      unitKey: unit.identityKey,
    },
    outcome,
    repository,
  };
};

interface SummaryEvaluation {
  build: GitHubWorkUnitSummaryBuildResult | null;
  unit: PersistedProjectionUnit;
}

const setSummaryInputs = async (
  snapshot: LoadedProjectionSnapshot,
  candidates: readonly PersistedProjectionUnit[],
  now: Date
) => {
  if (candidates.length === 0) {
    return {
      failed: 0,
      publicationChanged: false,
      queued: 0,
      set: 0,
      settled: 0,
    };
  }
  const evaluations: SummaryEvaluation[] = [];
  const changesByKey = new Map(
    snapshot.input.changes.map((change) => [
      logicalKeyFrom(change.logicalRepositoryId, change.logicalSha),
      change,
    ])
  );
  const pullRequestsByNodeId = new Map(
    snapshot.input.pullRequests.map((pullRequest) => [
      pullRequest.nodeId,
      pullRequest,
    ])
  );
  for (const unit of candidates) {
    const candidate = summaryCandidateFrom(
      snapshot,
      unit.projected,
      changesByKey,
      pullRequestsByNodeId
    );
    const result =
      candidate === null
        ? null
        : await buildGitHubWorkUnitSummaryInput(candidate);
    if (
      result?.eligible === true &&
      (result.outcomeDigest !== unit.projected.outcomeDigest ||
        result.membershipDigest !== unit.projected.membershipDigest)
    ) {
      throw new Error(
        `Summary input diverged from projection: ${unit.projected.identityKey}`
      );
    }
    evaluations.push({ build: result, unit });
  }
  // oxlint-disable-next-line eslint/complexity -- This locked state transition keeps evaluation validation, attempt reuse, and queueing in one auditable transaction.
  const result = await getDatabase().transaction(async (transaction) => {
    await acquireGitHubWorkUnitProjectionLock(transaction);
    const unitIds = evaluations.map(({ unit }) => unit.id);
    const currentRows = await transaction
      .select({
        attributionMode: githubWorkUnits.attributionMode,
        description: githubRepositories.description,
        factsDigest: githubWorkUnits.factsDigest,
        fullName: githubRepositories.fullName,
        homepageUrl: githubRepositories.homepageUrl,
        id: githubWorkUnits.id,
        membershipDigest: githubWorkUnits.membershipDigest,
        outcomeDigest: githubWorkUnits.outcomeDigest,
        revision: githubWorkUnits.revision,
        summaryEvaluationDigest: githubWorkUnits.summaryEvaluationDigest,
        summaryInputDigest: githubWorkUnits.summaryInputDigest,
        topics: githubRepositories.topics,
      })
      .from(githubWorkUnits)
      .innerJoin(
        githubRepositories,
        eq(githubWorkUnits.repositoryId, githubRepositories.id)
      )
      .where(inArray(githubWorkUnits.id, unitIds))
      .for("update");
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    const attemptRows = await transaction
      .select({
        attributionMode: githubWorkUnitSummaryAttempts.attributionMode,
        debounceUntil: githubWorkUnitSummaryAttempts.debounceUntil,
        outcome: githubWorkUnitSummaryAttempts.outcome,
        outcomeDigest: githubWorkUnitSummaryAttempts.outcomeDigest,
        recipe: githubWorkUnitSummaryAttempts.recipe,
        requestPayload: githubWorkUnitSummaryAttempts.requestPayload,
        revision: githubWorkUnitSummaryAttempts.revision,
        state: githubWorkUnitSummaryAttempts.state,
        summaryInputDigest: githubWorkUnitSummaryAttempts.summaryInputDigest,
        workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
      })
      .from(githubWorkUnitSummaryAttempts)
      .where(inArray(githubWorkUnitSummaryAttempts.workUnitId, unitIds));
    const attemptsByInput = new Map<string, (typeof attemptRows)[number]>(
      attemptRows.map(
        (attempt) =>
          [
            `${attempt.workUnitId}\0${attempt.summaryInputDigest}\0${attempt.recipe}`,
            attempt,
          ] as const
      )
    );
    const acceptedOutcomes = new Map(
      attemptRows.flatMap((attempt) =>
        attempt.recipe === GITHUB_WORK_UNIT_SUMMARY_RECIPE &&
        attempt.state === "accepted" &&
        attempt.outcome !== null
          ? [
              [
                `${attempt.workUnitId}\0${attempt.summaryInputDigest}\0${attempt.outcomeDigest}\0${attempt.attributionMode}`,
                attempt.outcome,
              ] as const,
            ]
          : []
      )
    );
    const acceptedOutcomeFor = (
      workUnitId: string,
      summaryInputDigest: string | null,
      outcomeDigest: string | null,
      attributionMode: string
    ) =>
      summaryInputDigest === null || outcomeDigest === null
        ? null
        : (acceptedOutcomes.get(
            `${workUnitId}\0${summaryInputDigest}\0${outcomeDigest}\0${attributionMode}`
          ) ?? null);
    const initialPageDays = new Set(
      initialPageDaysFrom(snapshot.units, snapshot.issueDays)
    );
    const maximumRevisionByUnit = new Map<string, number>();
    for (const attempt of attemptRows) {
      maximumRevisionByUnit.set(
        attempt.workUnitId,
        Math.max(
          maximumRevisionByUnit.get(attempt.workUnitId) ?? 0,
          attempt.revision
        )
      );
    }
    let failed = 0;
    let queued = 0;
    let set = 0;
    let settled = 0;
    let publicationChanged = false;
    for (const item of evaluations) {
      const current = currentById.get(item.unit.id);
      const evidence = snapshot.summaryEvaluationEvidence.get(
        item.unit.projected.identityKey
      );
      const currentEvaluationDigest =
        current === undefined || evidence === undefined
          ? null
          : summaryEvaluationDigestFrom(item.unit.projected, evidence, {
              description: current.description,
              fullName: current.fullName,
              homepageUrl: current.homepageUrl,
              topics: current.topics ?? [],
            });
      if (
        current === undefined ||
        currentEvaluationDigest !== item.unit.summaryEvaluationDigest ||
        current.summaryEvaluationDigest !== item.unit.summaryEvaluationDigest ||
        current.revision !== item.unit.revision ||
        current.factsDigest !== item.unit.projected.factsDigest ||
        current.membershipDigest !== item.unit.projected.membershipDigest ||
        current.outcomeDigest !== item.unit.projected.outcomeDigest ||
        current.attributionMode !== item.unit.projected.attributionMode
      ) {
        continue;
      }
      const eligibleBuild = item.build?.eligible === true ? item.build : null;
      const nextSummaryInputDigest = eligibleBuild?.summaryInputDigest ?? null;
      const [updated] = await transaction
        .update(githubWorkUnits)
        .set({
          summaryEvaluatedDigest: item.unit.summaryEvaluationDigest,
          summaryInputDigest: nextSummaryInputDigest,
        })
        .where(
          and(
            eq(githubWorkUnits.id, current.id),
            eq(githubWorkUnits.revision, current.revision),
            eq(
              githubWorkUnits.summaryEvaluationDigest,
              item.unit.summaryEvaluationDigest
            ),
            eq(githubWorkUnits.membershipDigest, current.membershipDigest),
            eq(githubWorkUnits.attributionMode, current.attributionMode)
          )
        )
        .returning({ id: githubWorkUnits.id });
      if (updated === undefined) {
        continue;
      }
      const previousOutcome = acceptedOutcomeFor(
        current.id,
        current.summaryInputDigest,
        current.outcomeDigest,
        current.attributionMode
      );
      const nextOutcome = acceptedOutcomeFor(
        current.id,
        nextSummaryInputDigest,
        current.outcomeDigest,
        current.attributionMode
      );
      publicationChanged ||=
        previousOutcome !== nextOutcome &&
        initialPageDays.has(item.unit.projected.activityDay);
      settled += 1;
      if (
        eligibleBuild !== null &&
        current.summaryInputDigest !== eligibleBuild.summaryInputDigest
      ) {
        set += 1;
      }
      if (eligibleBuild === null) {
        failed += 1;
        continue;
      }
      const inputKey = `${current.id}\0${eligibleBuild.summaryInputDigest}\0${GITHUB_WORK_UNIT_SUMMARY_RECIPE}`;
      const existingAttempt = attemptsByInput.get(inputKey);
      if (existingAttempt !== undefined) {
        if (
          (existingAttempt.state === "pending" ||
            existingAttempt.state === "retryable") &&
          (existingAttempt.requestPayload === null ||
            current.summaryInputDigest !== eligibleBuild.summaryInputDigest)
        ) {
          const debounceUntil = new Date(now.getTime() + SUMMARY_DEBOUNCE_MS);
          await transaction
            .update(githubWorkUnitSummaryAttempts)
            .set({
              debounceUntil:
                existingAttempt.debounceUntil < debounceUntil
                  ? debounceUntil
                  : existingAttempt.debounceUntil,
              requestPayload: eligibleBuild.serializedInput,
            })
            .where(
              and(
                eq(
                  githubWorkUnitSummaryAttempts.workUnitId,
                  existingAttempt.workUnitId
                ),
                eq(
                  githubWorkUnitSummaryAttempts.revision,
                  existingAttempt.revision
                ),
                inArray(githubWorkUnitSummaryAttempts.state, [
                  "pending",
                  "retryable",
                ])
              )
            );
        }
        continue;
      }
      const revision = (maximumRevisionByUnit.get(current.id) ?? 0) + 1;
      await transaction.insert(githubWorkUnitSummaryAttempts).values({
        attributionMode: item.unit.projected.attributionMode,
        debounceUntil: new Date(now.getTime() + SUMMARY_DEBOUNCE_MS),
        inputTokens: eligibleBuild.inputTokens,
        outcomeDigest: eligibleBuild.outcomeDigest,
        recipe: GITHUB_WORK_UNIT_SUMMARY_RECIPE,
        requestPayload: eligibleBuild.serializedInput,
        revision,
        summaryInputDigest: eligibleBuild.summaryInputDigest,
        workUnitId: current.id,
      });
      maximumRevisionByUnit.set(current.id, revision);
      queued += 1;
    }
    if (publicationChanged) {
      const [head] = await transaction
        .update(githubPublicFeedHead)
        .set({
          feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
          headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
          lastPublishedAt: now,
        })
        .where(eq(githubPublicFeedHead.id, true))
        .returning({ id: githubPublicFeedHead.id });
      if (head === undefined) {
        throw new Error("The GitHub public feed head is unavailable.");
      }
    }
    return { failed, publicationChanged, queued, set, settled };
  });
  return result;
};

/**
 * Recomputes the complete current corpus after a caller has durably changed
 * evidence. It is deliberately not a polling API.
 */
export const refreshGitHubWorkUnitProjection = async (
  now = new Date()
): Promise<GitHubWorkUnitProjectionRefreshResult> => {
  checkedNow(now);
  const { projectionRequestToken, snapshot, swap } =
    await getDatabase().transaction(
      async (transaction) => {
        await acquireGitHubWorkUnitProjectionLock(transaction);
        const [head] = await transaction
          .select({
            projectionRequestToken: githubPublicFeedHead.projectionRequestToken,
          })
          .from(githubPublicFeedHead)
          .where(eq(githubPublicFeedHead.id, true));
        if (head === undefined) {
          throw new Error("The GitHub public feed head is unavailable.");
        }
        const snapshot = await loadProjectionSnapshot(transaction, {
          lockCurrentUnits: true,
          summaryEvaluationLimit: SUMMARY_EVALUATION_LIMIT,
        });
        return {
          projectionRequestToken: head.projectionRequestToken,
          snapshot,
          swap: await swapProjection(transaction, snapshot, now),
        };
      },
      { isolationLevel: "repeatable read" }
    );
  const summaries = await setSummaryInputs(
    snapshot,
    swap.summaryCandidates,
    now
  );
  const summaryEvaluationsPending =
    snapshot.summaryEvaluationsPending +
    swap.summaryCandidates.length -
    summaries.settled;
  if (summaryEvaluationsPending > 0 && projectionRequestToken === null) {
    await requestGitHubWorkUnitProjection(getDatabase());
  } else if (
    summaryEvaluationsPending === 0 &&
    projectionRequestToken !== null
  ) {
    await completeGitHubWorkUnitProjectionRequest(projectionRequestToken);
  }
  return {
    changed: swap.insertedUnits + swap.updatedUnits + swap.deletedUnits > 0,
    deletedUnits: swap.deletedUnits,
    exclusionReasonCounts: snapshot.exclusionReasonCounts,
    feedRevisionChanged:
      swap.feedRevisionChanged || summaries.publicationChanged,
    insertedUnits: swap.insertedUnits,
    orderingRevisionChanged: swap.orderingRevisionChanged,
    summaryAttemptsQueued: summaries.queued,
    summaryEvaluationsPending,
    summaryEvaluationsSettled: summaries.settled,
    summaryInputsFailed: summaries.failed,
    summaryInputsSet: summaries.set,
    updatedUnits: swap.updatedUnits,
  };
};
