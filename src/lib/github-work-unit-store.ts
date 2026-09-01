import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountRepositoryCatalogs,
  githubCommitPullRequestAssociations,
  githubCommits,
  githubIssues,
  githubPublicFeedHead,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestVersions,
  githubRefGenerations,
  githubRefMemberships,
  githubRepositories,
  githubRepositoryInventoryHeads,
  githubRepositoryRefs,
  githubWorkUnitMemberships,
  githubWorkUnitSummaryAttempts,
  githubWorkUnits,
} from "@/db/schema";
import { PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE } from "@/lib/github-activity-store";
import type {
  GitHubLanguageFact,
  GitHubWorkUnitFileFact,
} from "@/lib/github-change-evidence";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import { hasCurrentTrackedGitHubRepositoryAccess } from "@/lib/github-repository-access";
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
  buildGitHubWorkUnitSummaryInput,
  GITHUB_WORK_UNIT_SUMMARY_RECIPE,
} from "@/lib/github-work-unit-summary";
import type {
  GitHubWorkUnitSummaryCandidate,
  GitHubWorkUnitSummaryOutcomeEvidence,
  GitHubWorkUnitSummaryRepositoryContext,
} from "@/lib/github-work-unit-summary";

const PROJECTION_LOCK = "github-work-unit-projection-v1";
const SUMMARY_DEBOUNCE_MS = 5 * 60 * 1000;
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
}

interface PersistedProjectionUnit {
  id: string;
  projected: GitHubProjectedWorkUnit;
  revision: number;
}

interface ProjectionSwapResult {
  deletedUnits: number;
  feedRevisionChanged: boolean;
  insertedUnits: number;
  orderingRevisionChanged: boolean;
  summaryCandidates: readonly PersistedProjectionUnit[];
  updatedUnits: number;
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
  if (!Array.isArray(value)) {
    return null;
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
      return null;
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

const checkedParentShas = (value: unknown): readonly string[] | null => {
  if (
    !Array.isArray(value) ||
    value.some((sha) => typeof sha !== "string" || !SHA.test(sha))
  ) {
    return null;
  }
  return value;
};

const visibilityFrom = (
  value: string | null,
  verifiedAt: Date | null,
  accessIsCurrent: boolean
): GitHubRepositoryProjectionEvidence["visibility"] => {
  if (verifiedAt === null) {
    return null;
  }
  if (value === "public") {
    return value;
  }
  if ((value === "internal" || value === "private") && accessIsCurrent) {
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
    if (repository === undefined || repository.visibility === null) {
      reason = "repository_visibility_unknown";
    } else if (effectivePullRequest !== null) {
      throw new Error(
        `Effective pull-request member was not projected: ${logicalKey}`
      );
    } else if (!change.pullRequestCoverageComplete) {
      reason = "pull_request_coverage_incomplete";
    } else if (repository.defaultBranch === null) {
      reason = "canonical_branch_unknown";
    } else if (repository.headGenerationComplete) {
      const reachableRefs = (
        ownership.refsByLogicalKey.get(logicalKey) ?? []
      ).filter((ref) => ref.complete && ref.repositoryId === repository.id);
      reason =
        reachableRefs.length === 0 || !change.mergedPullRequestLanding
          ? "no_current_owner"
          : "merged_pr_landing";
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

// oxlint-disable-next-line eslint/complexity -- This is one linear mapping of a transactionally consistent evidence snapshot; splitting ownership decisions across loaders would duplicate the production contract used by the verifier.
const loadProjectionSnapshot = async (
  transaction: GitHubWorkUnitTransaction,
  lockCurrentUnits: boolean
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
  const inventoryHeadRows = await transaction
    .select({
      accountUserId: githubRepositoryInventoryHeads.accountUserId,
      completedAt: githubRepositoryInventoryHeads.completedAt,
      generation: githubRepositoryInventoryHeads.generation,
    })
    .from(githubRepositoryInventoryHeads);
  const catalogRows = await transaction
    .select({
      accountUserId: githubAccountRepositoryCatalogs.accountUserId,
      activeAccess: githubAccountRepositoryCatalogs.activeAccess,
      inventoryGeneration: githubAccountRepositoryCatalogs.inventoryGeneration,
      repositoryId: githubAccountRepositoryCatalogs.repositoryId,
    })
    .from(githubAccountRepositoryCatalogs);
  const inventoryGenerationByAccount = new Map(
    inventoryHeadRows.flatMap((head) =>
      head.completedAt !== null && head.generation > 0
        ? [[head.accountUserId, head.generation] as const]
        : []
    )
  );
  const everyTrackedInventoryIsComplete = [...trackedAuthorUserIds].every(
    (accountUserId) => inventoryGenerationByAccount.has(accountUserId)
  );
  const accessibleRepositoryIds = new Set(
    catalogRows.flatMap((catalog) =>
      catalog.activeAccess &&
      inventoryGenerationByAccount.get(catalog.accountUserId) ===
        catalog.inventoryGeneration
        ? [catalog.repositoryId]
        : []
    )
  );
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
  const associationRows = await transaction
    .select({
      baseRepositoryId: githubPullRequests.repositoryId,
      commitRepositoryId:
        githubCommitPullRequestAssociations.commitRepositoryId,
      commitSha: githubCommitPullRequestAssociations.commitSha,
      state: githubPullRequests.state,
    })
    .from(githubCommitPullRequestAssociations)
    .innerJoin(
      githubCommits,
      and(
        eq(
          githubCommits.repositoryId,
          githubCommitPullRequestAssociations.commitRepositoryId
        ),
        eq(githubCommits.sha, githubCommitPullRequestAssociations.commitSha)
      )
    )
    .innerJoin(
      githubPullRequests,
      eq(
        githubPullRequests.nodeId,
        githubCommitPullRequestAssociations.pullRequestNodeId
      )
    )
    .where(inArray(githubCommits.authorUserId, [...trackedAuthorUserIds]));
  const commitRows = await transaction
    .select({
      additions: githubCommits.additions,
      authorUserId: githubCommits.authorUserId,
      committedAt: githubCommits.committedAt,
      committerAt: githubCommits.committerAt,
      deletions: githubCommits.deletions,
      enrichmentState: githubCommits.enrichmentState,
      fileFacts: githubCommits.fileFacts,
      fileFactsComplete: githubCommits.fileFactsComplete,
      firstObservedAt: githubCommits.firstObservedAt,
      parentShas: githubCommits.parentShas,
      providerFileCapReached: githubCommits.providerFileCapReached,
      pullRequestDiscoveryState: githubCommits.pullRequestDiscoveryState,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .where(inArray(githubCommits.authorUserId, [...trackedAuthorUserIds]))
    .orderBy(asc(githubCommits.repositoryId), asc(githubCommits.sha));
  const mergedPullRequestLandings = new Set(
    associationRows.flatMap((row) =>
      row.state === "merged" && row.baseRepositoryId === row.commitRepositoryId
        ? [logicalKeyFrom(row.commitRepositoryId, row.commitSha)]
        : []
    )
  );
  const changes: GitHubLogicalChange[] = commitRows.map((row) => {
    const fileFacts = checkedFileFacts(row.fileFacts);
    const parentShas = checkedParentShas(row.parentShas);
    const pullRequestCoverageComplete =
      row.pullRequestDiscoveryState === "complete";
    const logicalKey = logicalKeyFrom(row.repositoryId, row.sha);
    return {
      additions: row.additions ?? -1,
      authorUserId: row.authorUserId,
      contentObservedAt: row.firstObservedAt.toISOString(),
      deletions: row.deletions ?? -1,
      enrichmentComplete: row.enrichmentState === "complete",
      fileFacts: fileFacts ?? [],
      fileFactsComplete: row.fileFactsComplete && fileFacts !== null,
      mergedPullRequestLanding: mergedPullRequestLandings.has(logicalKey),
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
    };
  });
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
      fileFacts: githubPullRequestVersions.fileFacts,
      fileFactsComplete: githubPullRequestVersions.fileFactsComplete,
      headSha: githubPullRequestVersions.headSha,
      mergeSnapshot: githubPullRequestVersions.mergeSnapshot,
      membershipComplete: githubPullRequestVersions.membershipComplete,
      nodeId: githubPullRequests.nodeId,
      observedAt: githubPullRequestVersions.observedAt,
      providerFileCapReached: githubPullRequests.providerFileCapReached,
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
    const netFiles = checkedFileFacts(row.fileFacts);
    const netOutcome =
      netFiles === null
        ? null
        : {
            complete: row.fileFactsComplete,
            files: netFiles,
            providerFileCapReached: row.providerFileCapReached,
          };
    pullRequests.push({
      authorUserId: row.authorUserId,
      baseRepositoryId: row.baseRepositoryId ?? row.repositoryId,
      baseSha: row.baseSha,
      contentObservedAt: row.observedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      headSha: row.headSha,
      memberLogicalKeys,
      membershipComplete,
      netOutcome,
      netOutcomeOwnedCompletely:
        membershipComplete &&
        memberLogicalKeys.length > 0 &&
        memberLogicalKeys.every((key) => eligibleChanges.has(key)),
      nodeId: row.nodeId,
      snapshotKind: row.state === "open" ? "current" : "final",
      state: row.state,
    });
  }
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
        contentObservedAt:
          desired.lastObservedAt > generation.completedAt
            ? desired.lastObservedAt.toISOString()
            : generation.completedAt.toISOString(),
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
        repository.factsVerifiedAt,
        !everyTrackedInventoryIsComplete ||
          accessibleRepositoryIds.has(repository.id)
      ),
    })
  );
  const input: GitHubWorkUnitProjectionInput = {
    changes,
    priorActivityAnchors: currentUnits.flatMap((unit) =>
      unit.outcomeDigest === null
        ? []
        : [
            {
              activityAnchorAt: unit.activityAnchorAt.toISOString(),
              identityKey: unit.identityKey,
              outcomeDigest: unit.outcomeDigest,
            },
          ]
    ),
    pullRequests,
    refs,
    repositories,
    trackedAuthorUserIds,
  };
  const ownership = indexGitHubWorkUnitOwnershipEvidence(input);
  const units = projectGitHubWorkUnits(input, ownership);
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
      or(
        eq(githubRepositories.visibility, "public"),
        and(
          inArray(githubRepositories.visibility, ["private", "internal"]),
          hasCurrentTrackedGitHubRepositoryAccess(githubIssues.repositoryId)
        )
      )
    );
  const issueDays = issueRows.map((issue) => issueDayFrom(issue.createdAt));
  return {
    currentUnits,
    input,
    issueDays,
    repositoryContexts: new Map(
      repositoryRows.map((repository) => [
        repository.id,
        {
          description: repository.description,
          fullName: repository.fullName,
          homepageUrl: repository.homepageUrl,
          topics: repository.topics ?? [],
        },
      ])
    ),
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
        const snapshot = await loadProjectionSnapshot(transaction, false);
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
  const privateDays = sortedUniqueDays(
    units
      .filter((unit) => unit.visibility === "private")
      .map((unit) => unit.activityDay)
  );
  const publicUnits = units
    .filter((unit) => unit.visibility === "public")
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
  return JSON.stringify({ privateDays, publicUnits });
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
    if (before?.visibility === "public" && headDays.has(before.activityDay)) {
      return true;
    }
    if (after?.visibility === "public" && headDays.has(after.activityDay)) {
      return true;
    }
  }
  const currentPrivateDays = new Set(
    current
      .filter((unit) => unit.visibility === "private")
      .map((unit) => unit.activityDay)
  );
  const projectedPrivateDays = new Set(
    projected
      .filter((unit) => unit.visibility === "private")
      .map((unit) => unit.activityDay)
  );
  return [...headDays].some(
    (day) => currentPrivateDays.has(day) !== projectedPrivateDays.has(day)
  );
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
  const summaryCandidateIdentities = new Set([
    ...inserted.map((unit) => unit.identityKey),
    ...updated.map((unit) => unit.identityKey),
    ...snapshot.currentUnits.flatMap((unit) =>
      unit.visibility === "public" && unit.summaryInputDigest === null
        ? [unit.identityKey]
        : []
    ),
  ]);
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
  const persisted = new Map<string, PersistedProjectionUnit>();
  for (const projected of snapshot.units) {
    const current = currentByIdentity.get(projected.identityKey);
    if (current === undefined) {
      const [row] = await transaction
        .insert(githubWorkUnits)
        .values(projectedValues(projected, 1, null))
        .returning({ id: githubWorkUnits.id });
      if (row === undefined) {
        throw new Error("A GitHub work unit could not be inserted.");
      }
      await transaction
        .insert(githubWorkUnitMemberships)
        .values(membershipValues(row.id, projected));
      persisted.set(projected.identityKey, {
        id: row.id,
        projected,
        revision: 1,
      });
      continue;
    }
    if (!materialProjectionChanged(current, projected)) {
      if (
        current.contentObservedAt.toISOString() !== projected.contentObservedAt
      ) {
        await transaction
          .update(githubWorkUnits)
          .set({ contentObservedAt: new Date(projected.contentObservedAt) })
          .where(eq(githubWorkUnits.id, current.id));
      }
      persisted.set(projected.identityKey, {
        id: current.id,
        projected,
        revision: current.revision,
      });
      continue;
    }
    const summarySemanticsChanged =
      current.outcomeDigest !== projected.outcomeDigest ||
      current.attributionMode !== projected.attributionMode ||
      projected.visibility !== "public";
    const revision = current.revision + 1;
    await transaction
      .update(githubWorkUnits)
      .set(
        projectedValues(
          projected,
          revision,
          summarySemanticsChanged ? null : current.summaryInputDigest
        )
      )
      .where(eq(githubWorkUnits.id, current.id));
    await transaction
      .insert(githubWorkUnitMemberships)
      .values(membershipValues(current.id, projected));
    if (projected.visibility === "private") {
      await transaction
        .delete(githubWorkUnitSummaryAttempts)
        .where(eq(githubWorkUnitSummaryAttempts.workUnitId, current.id));
    } else if (summarySemanticsChanged) {
      await transaction
        .update(githubWorkUnitSummaryAttempts)
        .set({
          acceptedAt: null,
          completedAt: now,
          leaseToken: null,
          leaseUntil: null,
          outcome: null,
          requestPayload: null,
          state: "terminal",
        })
        .where(
          and(
            eq(githubWorkUnitSummaryAttempts.workUnitId, current.id),
            inArray(githubWorkUnitSummaryAttempts.state, [
              "pending",
              "processing",
              "retryable",
            ])
          )
        );
    }
    persisted.set(projected.identityKey, {
      id: current.id,
      projected,
      revision,
    });
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
    summaryCandidates: [...persisted.values()].filter(
      ({ projected }) =>
        summaryCandidateIdentities.has(projected.identityKey) &&
        projected.visibility === "public" &&
        projected.outcomeDigest !== null
    ),
    updatedUnits: updated.length,
  };
};

const summaryOutcomeFrom = (
  unit: GitHubProjectedWorkUnit,
  changesByKey: ReadonlyMap<string, GitHubLogicalChange>,
  pullRequestsByNodeId: ReadonlyMap<string, GitHubPullRequestProjectionEvidence>
): GitHubWorkUnitSummaryOutcomeEvidence | null => {
  const compositeChanges = unit.members.map((member) => {
    const change = changesByKey.get(member.logicalKey);
    return change === undefined
      ? null
      : githubWorkUnitSummaryDiffEvidenceFrom(
          change.fileFacts,
          change.additions,
          change.deletions,
          change.fileFactsComplete,
          change.providerFileCapReached
        );
  });
  if (compositeChanges.some((change) => change === null)) {
    return null;
  }
  if (unit.kind === "pull_request") {
    const pullRequest =
      unit.pullRequestNodeId === null
        ? undefined
        : pullRequestsByNodeId.get(unit.pullRequestNodeId);
    if (
      unit.attributionMode === "tracked_authored_pr" &&
      pullRequest?.netOutcomeOwnedCompletely === true &&
      pullRequest.netOutcome !== null
    ) {
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
  if (repository === undefined || outcome === null) {
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

interface BuiltSummaryInput {
  build: Extract<
    Awaited<ReturnType<typeof buildGitHubWorkUnitSummaryInput>>,
    { eligible: true }
  >;
  unit: PersistedProjectionUnit;
}

const setSummaryInputs = async (
  snapshot: LoadedProjectionSnapshot,
  candidates: readonly PersistedProjectionUnit[],
  now: Date
) => {
  const built: BuiltSummaryInput[] = [];
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
  let failed = 0;
  for (const unit of candidates) {
    const candidate = summaryCandidateFrom(
      snapshot,
      unit.projected,
      changesByKey,
      pullRequestsByNodeId
    );
    if (candidate === null) {
      throw new Error(
        `A summary candidate lacks complete evidence: ${unit.projected.identityKey}`
      );
    }
    const result = await buildGitHubWorkUnitSummaryInput(candidate);
    if (!result.eligible) {
      failed += 1;
      continue;
    }
    if (
      result.outcomeDigest !== unit.projected.outcomeDigest ||
      result.membershipDigest !== unit.projected.membershipDigest
    ) {
      throw new Error(
        `Summary input diverged from projection: ${unit.projected.identityKey}`
      );
    }
    built.push({ build: result, unit });
  }
  if (built.length === 0) {
    return { failed, queued: 0, set: 0 };
  }
  const result = await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${PROJECTION_LOCK}))`
    );
    const unitIds = built.map(({ unit }) => unit.id);
    const currentRows = await transaction
      .select({
        attributionMode: githubWorkUnits.attributionMode,
        factsDigest: githubWorkUnits.factsDigest,
        id: githubWorkUnits.id,
        membershipDigest: githubWorkUnits.membershipDigest,
        outcomeDigest: githubWorkUnits.outcomeDigest,
        repositoryVisibility: githubRepositories.visibility,
        revision: githubWorkUnits.revision,
        summaryInputDigest: githubWorkUnits.summaryInputDigest,
        visibility: githubWorkUnits.visibility,
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
        recipe: githubWorkUnitSummaryAttempts.recipe,
        revision: githubWorkUnitSummaryAttempts.revision,
        summaryInputDigest: githubWorkUnitSummaryAttempts.summaryInputDigest,
        workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
      })
      .from(githubWorkUnitSummaryAttempts)
      .where(inArray(githubWorkUnitSummaryAttempts.workUnitId, unitIds));
    const existingInputs = new Set(
      attemptRows.map(
        (attempt) =>
          `${attempt.workUnitId}\0${attempt.summaryInputDigest}\0${attempt.recipe}`
      )
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
    let queued = 0;
    let set = 0;
    for (const item of built) {
      const current = currentById.get(item.unit.id);
      if (
        current === undefined ||
        current.visibility !== "public" ||
        current.repositoryVisibility !== "public" ||
        current.revision !== item.unit.revision ||
        current.factsDigest !== item.unit.projected.factsDigest ||
        current.membershipDigest !== item.build.membershipDigest ||
        current.outcomeDigest !== item.build.outcomeDigest ||
        current.attributionMode !== item.unit.projected.attributionMode
      ) {
        continue;
      }
      if (current.summaryInputDigest !== item.build.summaryInputDigest) {
        await transaction
          .update(githubWorkUnitSummaryAttempts)
          .set({
            acceptedAt: null,
            completedAt: now,
            leaseToken: null,
            leaseUntil: null,
            outcome: null,
            requestPayload: null,
            state: "terminal",
          })
          .where(
            and(
              eq(githubWorkUnitSummaryAttempts.workUnitId, current.id),
              ne(
                githubWorkUnitSummaryAttempts.summaryInputDigest,
                item.build.summaryInputDigest
              ),
              inArray(githubWorkUnitSummaryAttempts.state, [
                "pending",
                "processing",
                "retryable",
              ])
            )
          );
        await transaction
          .update(githubWorkUnits)
          .set({ summaryInputDigest: item.build.summaryInputDigest })
          .where(
            and(
              eq(githubWorkUnits.id, current.id),
              eq(githubWorkUnits.revision, current.revision),
              eq(githubWorkUnits.outcomeDigest, item.build.outcomeDigest),
              eq(githubWorkUnits.membershipDigest, item.build.membershipDigest),
              eq(githubWorkUnits.attributionMode, current.attributionMode),
              eq(githubWorkUnits.visibility, "public")
            )
          );
        set += 1;
      }
      const inputKey = `${current.id}\0${item.build.summaryInputDigest}\0${GITHUB_WORK_UNIT_SUMMARY_RECIPE}`;
      if (existingInputs.has(inputKey)) {
        continue;
      }
      const revision = (maximumRevisionByUnit.get(current.id) ?? 0) + 1;
      await transaction.insert(githubWorkUnitSummaryAttempts).values({
        attributionMode: item.unit.projected.attributionMode,
        debounceUntil: new Date(now.getTime() + SUMMARY_DEBOUNCE_MS),
        inputTokens: item.build.inputTokens,
        outcomeDigest: item.build.outcomeDigest,
        recipe: GITHUB_WORK_UNIT_SUMMARY_RECIPE,
        requestPayload: item.build.serializedInput,
        revision,
        summaryInputDigest: item.build.summaryInputDigest,
        unitRevision: current.revision,
        workUnitId: current.id,
      });
      maximumRevisionByUnit.set(current.id, revision);
      existingInputs.add(inputKey);
      queued += 1;
    }
    return { queued, set };
  });
  return { failed, ...result };
};

/**
 * Recomputes the complete current corpus after a caller has durably changed
 * evidence. It is deliberately not a polling API.
 */
export const refreshGitHubWorkUnitProjection = async (
  now = new Date()
): Promise<GitHubWorkUnitProjectionRefreshResult> => {
  checkedNow(now);
  const { snapshot, swap } = await getDatabase().transaction(
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${PROJECTION_LOCK}))`
      );
      const snapshot = await loadProjectionSnapshot(transaction, true);
      return {
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
  return {
    changed: swap.insertedUnits + swap.updatedUnits + swap.deletedUnits > 0,
    deletedUnits: swap.deletedUnits,
    exclusionReasonCounts: snapshot.exclusionReasonCounts,
    feedRevisionChanged: swap.feedRevisionChanged,
    insertedUnits: swap.insertedUnits,
    orderingRevisionChanged: swap.orderingRevisionChanged,
    summaryAttemptsQueued: summaries.queued,
    summaryInputsFailed: summaries.failed,
    summaryInputsSet: summaries.set,
    updatedUnits: swap.updatedUnits,
  };
};
