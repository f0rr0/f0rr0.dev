import { asc } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { githubRepositories } from "@/db/schema";
import {
  githubLogicalChangeKey,
  isEffectivePullRequestSnapshot,
  isEligibleGitHubWorkChange,
} from "@/lib/github-work-unit-core";
import type {
  GitHubLogicalChange,
  GitHubWorkUnitProjectionInput,
} from "@/lib/github-work-unit-core";
import { readGitHubWorkUnitProjectionEvidence } from "@/lib/github-work-unit-store";
import type {
  GitHubWorkUnitProjectionExcludedChange,
  GitHubWorkUnitProjectionExclusionReason,
  GitHubWorkUnitProjectionSnapshot,
} from "@/lib/github-work-unit-store";

const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const UTC_INSTANT = /(?:Z|\+00:00)$/u;
const REPOSITORY_ID = /^\d{1,32}$/u;
const POLICY_EXCLUSION_REASONS = [
  "merged_pr_landing",
  "no_current_owner",
] as const satisfies readonly GitHubWorkUnitProjectionExclusionReason[];
const COVERAGE_GAP_REASONS = [
  "canonical_branch_unknown",
  "head_generation_incomplete",
  "pull_request_coverage_incomplete",
  "repository_visibility_unknown",
] as const satisfies readonly GitHubWorkUnitProjectionExclusionReason[];
const POLICY_EXCLUSION_REASON_SET =
  new Set<GitHubWorkUnitProjectionExclusionReason>(POLICY_EXCLUSION_REASONS);
const COVERAGE_GAP_REASON_SET =
  new Set<GitHubWorkUnitProjectionExclusionReason>(COVERAGE_GAP_REASONS);

type GitHubWorkUnitPolicyExclusionReason =
  (typeof POLICY_EXCLUSION_REASONS)[number];
type GitHubWorkUnitCoverageGapReason = (typeof COVERAGE_GAP_REASONS)[number];

export interface GitHubWorkUnitCrosswalkBucket {
  count: number;
  ids: readonly string[];
}

export interface GitHubWorkUnitCrosswalkRepositoryFilter {
  fullName: string | null;
  id: string;
}

export interface GitHubWorkUnitCrosswalkFilters {
  repositories?: readonly GitHubWorkUnitCrosswalkRepositoryFilter[];
  since: string;
  until: string;
}

interface GitHubWorkUnitCrosswalkReasonBuckets<
  Reason extends GitHubWorkUnitProjectionExclusionReason,
> extends GitHubWorkUnitCrosswalkBucket {
  idsByReason: Readonly<Record<Reason, GitHubWorkUnitCrosswalkBucket>>;
  reasonCounts: Readonly<Record<Reason, number>>;
}

export interface GitHubWorkUnitCrosswalk {
  categories: {
    authoredPullRequestsWithoutOwnedCurrentMember: GitHubWorkUnitCrosswalkBucket;
    commitEnrichmentBacklog: GitHubWorkUnitCrosswalkBucket;
    eligibleTrackedChanges: GitHubWorkUnitCrosswalkBucket;
    integrationMerges: GitHubWorkUnitCrosswalkBucket;
    policyExcludedChanges: GitHubWorkUnitCrosswalkBucket;
    projectedBranchUnits: GitHubWorkUnitCrosswalkBucket;
    projectedCanonicalUnits: GitHubWorkUnitCrosswalkBucket;
    projectedOwnedChanges: GitHubWorkUnitCrosswalkBucket;
    projectedPullRequestUnits: GitHubWorkUnitCrosswalkBucket;
    trackedChangeCandidates: GitHubWorkUnitCrosswalkBucket;
    verifiedMergeLandingOwnershipViolations: GitHubWorkUnitCrosswalkBucket;
    visibilityGaps: GitHubWorkUnitCrosswalkBucket;
    zeroDiffOrIneligibleChanges: GitHubWorkUnitCrosswalkBucket;
  };
  filters: {
    changeClock: "logical_activity_at";
    interval: "[since,until)";
    pullRequestClock: "created_at";
    repositories: readonly GitHubWorkUnitCrosswalkRepositoryFilter[];
    since: string;
    until: string;
  };
  coverageGaps: GitHubWorkUnitCrosswalkReasonBuckets<GitHubWorkUnitCoverageGapReason>;
  invariants: {
    failures: readonly (
      | "commit_enrichment_backlog"
      | "projection_coverage_gap"
      | "repository_visibility_gap"
      | "verified_merge_landing_owned"
    )[];
    passed: boolean;
  };
  policyExclusions: GitHubWorkUnitCrosswalkReasonBuckets<GitHubWorkUnitPolicyExclusionReason>;
  version: 4;
}

const bytewiseCompare = (left: string, right: string) =>
  Buffer.compare(Buffer.from(left, "utf-8"), Buffer.from(right, "utf-8"));

const bucketFrom = (
  identifiers: Iterable<string>
): GitHubWorkUnitCrosswalkBucket => {
  const ids = [...new Set(identifiers)].toSorted(bytewiseCompare);
  return { count: ids.length, ids };
};

const utcInstantFrom = (value: string, label: string) => {
  const candidate = UTC_DATE.test(value) ? `${value}T00:00:00.000Z` : value;
  if (!UTC_INSTANT.test(candidate)) {
    throw new TypeError(`${label} must be an explicit UTC instant.`);
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${label} is invalid.`);
  }
  return parsed.toISOString();
};

const checkedFilters = (filters: GitHubWorkUnitCrosswalkFilters) => {
  const since = utcInstantFrom(filters.since, "since");
  const until = utcInstantFrom(filters.until, "until");
  if (since >= until) {
    throw new RangeError("since must be earlier than until.");
  }
  const repositories = [...(filters.repositories ?? [])].toSorted(
    (left, right) =>
      bytewiseCompare(left.id, right.id) ||
      bytewiseCompare(left.fullName ?? "", right.fullName ?? "")
  );
  if (
    repositories.some(
      (repository) =>
        !REPOSITORY_ID.test(repository.id) ||
        (repository.fullName !== null && repository.fullName.length === 0)
    ) ||
    new Set(repositories.map((repository) => repository.id)).size !==
      repositories.length
  ) {
    throw new TypeError("Repository filters must have unique GitHub IDs.");
  }
  return { repositories, since, until };
};

const logicalKeyFrom = (change: GitHubLogicalChange) =>
  githubLogicalChangeKey(change.logicalRepositoryId, change.logicalSha);

const inInterval = (value: string, since: string, until: string) => {
  const instant = utcInstantFrom(value, "evidence timestamp");
  return instant >= since && instant < until;
};

const repositoryScopeByLogicalKey = (input: GitHubWorkUnitProjectionInput) => {
  const scopes = new Map<string, Set<string>>();
  for (const pullRequest of input.pullRequests) {
    for (const logicalKey of pullRequest.memberLogicalKeys) {
      const repositories = scopes.get(logicalKey) ?? new Set<string>();
      repositories.add(pullRequest.baseRepositoryId);
      scopes.set(logicalKey, repositories);
    }
  }
  return scopes;
};

const changeMatchesRepositories = (
  change: GitHubLogicalChange,
  repositoryIds: ReadonlySet<string>,
  repositoriesByLogicalKey: ReadonlyMap<string, ReadonlySet<string>>
) => {
  if (repositoryIds.size === 0) {
    return true;
  }
  if (
    repositoryIds.has(change.repositoryId) ||
    repositoryIds.has(change.logicalRepositoryId)
  ) {
    return true;
  }
  const associatedRepositories = repositoriesByLogicalKey.get(
    logicalKeyFrom(change)
  );
  return (
    associatedRepositories !== undefined &&
    [...associatedRepositories].some((repositoryId) =>
      repositoryIds.has(repositoryId)
    )
  );
};

const exclusionBucketsFrom = <
  const Reasons extends readonly GitHubWorkUnitProjectionExclusionReason[],
>(
  changes: readonly GitHubWorkUnitProjectionExcludedChange[],
  reasons: Reasons
) => {
  const idsByReason = Object.fromEntries(
    reasons.map((reason) => [
      reason,
      bucketFrom(
        changes
          .filter((change) => change.reason === reason)
          .map((change) => change.logicalKey)
      ),
    ])
  ) as Record<Reasons[number], GitHubWorkUnitCrosswalkBucket>;
  const reasonCounts = Object.fromEntries(
    reasons.map((reason) => [
      reason,
      idsByReason[reason as Reasons[number]].count,
    ])
  ) as Record<Reasons[number], number>;
  const allChanges = bucketFrom(changes.map((change) => change.logicalKey));
  return {
    ...allChanges,
    idsByReason,
    reasonCounts,
  };
};

/** Builds a deterministic, read-only crosswalk from production projection input. */
export const buildGitHubWorkUnitCrosswalk = (
  snapshot: GitHubWorkUnitProjectionSnapshot,
  requestedFilters: GitHubWorkUnitCrosswalkFilters
): GitHubWorkUnitCrosswalk => {
  const filters = checkedFilters(requestedFilters);
  const repositoryIds = new Set(
    filters.repositories.map((repository) => repository.id)
  );
  const repositoriesByLogicalKey = repositoryScopeByLogicalKey(snapshot.input);
  const trackedChanges = snapshot.input.changes.filter(
    (change) =>
      change.authorUserId !== null &&
      snapshot.input.trackedAuthorUserIds.has(change.authorUserId) &&
      inInterval(change.logicalActivityAt, filters.since, filters.until) &&
      changeMatchesRepositories(change, repositoryIds, repositoriesByLogicalKey)
  );
  const trackedChangeKeys = new Set(trackedChanges.map(logicalKeyFrom));
  const globallyOwnedKeys = new Set(
    snapshot.input.changes
      .filter(
        (change) =>
          change.authorUserId !== null &&
          snapshot.input.trackedAuthorUserIds.has(change.authorUserId)
      )
      .map(logicalKeyFrom)
  );
  const eligibleChanges = trackedChanges.filter((change) =>
    isEligibleGitHubWorkChange(change, snapshot.input.trackedAuthorUserIds)
  );
  const eligibleKeys = new Set(eligibleChanges.map(logicalKeyFrom));
  const enrichmentBacklogKeys = new Set(
    trackedChanges
      .filter((change) => !change.enrichmentComplete)
      .map(logicalKeyFrom)
  );
  const integrationMergeKeys = new Set(
    trackedChanges
      .filter((change) => change.parentCount > 1)
      .map(logicalKeyFrom)
  );
  const ineligibleKeys = new Set(
    trackedChanges
      .filter(
        (change) =>
          !eligibleKeys.has(logicalKeyFrom(change)) &&
          !enrichmentBacklogKeys.has(logicalKeyFrom(change)) &&
          change.parentCount <= 1
      )
      .map(logicalKeyFrom)
  );

  const unitsInScope = snapshot.units.filter((unit) =>
    unit.members.some((member) => eligibleKeys.has(member.logicalKey))
  );
  const projectedOwnedKeys = new Set<string>();
  const projectedRefOwnedKeys = new Set<string>();
  for (const unit of unitsInScope) {
    for (const member of unit.members) {
      if (eligibleKeys.has(member.logicalKey)) {
        projectedOwnedKeys.add(member.logicalKey);
        if (unit.kind !== "pull_request") {
          projectedRefOwnedKeys.add(member.logicalKey);
        }
      }
    }
  }
  const verifiedMergeLandingOwnershipViolationKeys = new Set(
    eligibleChanges
      .filter(
        (change) =>
          change.verifiedMergeLanding &&
          projectedRefOwnedKeys.has(logicalKeyFrom(change))
      )
      .map(logicalKeyFrom)
  );
  const filteredExcludedChanges = snapshot.excludedChanges.filter((change) =>
    eligibleKeys.has(change.logicalKey)
  );
  const policyExclusions = exclusionBucketsFrom(
    filteredExcludedChanges.filter((change) =>
      POLICY_EXCLUSION_REASON_SET.has(change.reason)
    ),
    POLICY_EXCLUSION_REASONS
  );
  const coverageGaps = exclusionBucketsFrom(
    filteredExcludedChanges.filter((change) =>
      COVERAGE_GAP_REASON_SET.has(change.reason)
    ),
    COVERAGE_GAP_REASONS
  );
  const authoredPullRequestsWithoutOwnedCurrentMember =
    snapshot.input.pullRequests
      .filter(
        (pullRequest) =>
          pullRequest.authorUserId !== null &&
          snapshot.input.trackedAuthorUserIds.has(pullRequest.authorUserId) &&
          isEffectivePullRequestSnapshot(pullRequest) &&
          inInterval(pullRequest.createdAt, filters.since, filters.until) &&
          (repositoryIds.size === 0 ||
            repositoryIds.has(pullRequest.baseRepositoryId)) &&
          !pullRequest.memberLogicalKeys.some((logicalKey) =>
            globallyOwnedKeys.has(logicalKey)
          )
      )
      .map((pullRequest) => pullRequest.nodeId);

  const repositoryIdsInScope = new Set<string>();
  for (const change of eligibleChanges) {
    repositoryIdsInScope.add(change.repositoryId);
    repositoryIdsInScope.add(change.logicalRepositoryId);
  }
  for (const unit of unitsInScope) {
    repositoryIdsInScope.add(unit.repositoryId);
  }
  for (const pullRequest of snapshot.input.pullRequests) {
    if (
      inInterval(pullRequest.createdAt, filters.since, filters.until) &&
      (repositoryIds.size === 0 ||
        repositoryIds.has(pullRequest.baseRepositoryId)) &&
      ((pullRequest.authorUserId !== null &&
        snapshot.input.trackedAuthorUserIds.has(pullRequest.authorUserId)) ||
        pullRequest.memberLogicalKeys.some((logicalKey) =>
          eligibleKeys.has(logicalKey)
        ))
    ) {
      repositoryIdsInScope.add(pullRequest.baseRepositoryId);
    }
  }
  const visibilityByRepositoryId = new Map(
    snapshot.input.repositories.map((repository) => [
      repository.id,
      repository.visibility,
    ])
  );
  const visibilityGapIds = [...repositoryIdsInScope].filter(
    (repositoryId) =>
      (visibilityByRepositoryId.get(repositoryId) ?? null) === null
  );

  const failures = new Set<
    GitHubWorkUnitCrosswalk["invariants"]["failures"][number]
  >();
  if (enrichmentBacklogKeys.size > 0) {
    failures.add("commit_enrichment_backlog");
  }
  if (coverageGaps.count > 0) {
    failures.add("projection_coverage_gap");
  }
  if (visibilityGapIds.length > 0) {
    failures.add("repository_visibility_gap");
  }
  if (verifiedMergeLandingOwnershipViolationKeys.size > 0) {
    failures.add("verified_merge_landing_owned");
  }
  const orderedFailures = [...failures].toSorted(bytewiseCompare);

  return {
    categories: {
      authoredPullRequestsWithoutOwnedCurrentMember: bucketFrom(
        authoredPullRequestsWithoutOwnedCurrentMember
      ),
      commitEnrichmentBacklog: bucketFrom(enrichmentBacklogKeys),
      eligibleTrackedChanges: bucketFrom(eligibleKeys),
      integrationMerges: bucketFrom(integrationMergeKeys),
      policyExcludedChanges: bucketFrom(policyExclusions.ids),
      projectedBranchUnits: bucketFrom(
        unitsInScope
          .filter((unit) => unit.kind === "branch")
          .map((unit) => unit.identityKey)
      ),
      projectedCanonicalUnits: bucketFrom(
        unitsInScope
          .filter((unit) => unit.kind === "canonical_day")
          .map((unit) => unit.identityKey)
      ),
      projectedOwnedChanges: bucketFrom(projectedOwnedKeys),
      projectedPullRequestUnits: bucketFrom(
        unitsInScope
          .filter((unit) => unit.kind === "pull_request")
          .map((unit) => unit.identityKey)
      ),
      trackedChangeCandidates: bucketFrom(trackedChangeKeys),
      verifiedMergeLandingOwnershipViolations: bucketFrom(
        verifiedMergeLandingOwnershipViolationKeys
      ),
      visibilityGaps: bucketFrom(visibilityGapIds),
      zeroDiffOrIneligibleChanges: bucketFrom(ineligibleKeys),
    },
    filters: {
      changeClock: "logical_activity_at",
      interval: "[since,until)",
      pullRequestClock: "created_at",
      repositories: filters.repositories,
      since: filters.since,
      until: filters.until,
    },
    coverageGaps,
    invariants: {
      failures: orderedFailures,
      passed: orderedFailures.length === 0,
    },
    policyExclusions,
    version: 4,
  };
};

const resolveRepositoryFilters = async (
  requested: readonly string[]
): Promise<readonly GitHubWorkUnitCrosswalkRepositoryFilter[]> => {
  if (requested.length === 0) {
    return [];
  }
  const repositories = await getDatabase()
    .select({
      fullName: githubRepositories.fullName,
      id: githubRepositories.id,
    })
    .from(githubRepositories)
    .orderBy(asc(githubRepositories.id));
  const byId = new Map(
    repositories.map((repository) => [repository.id, repository])
  );
  const byName = new Map(
    repositories.map((repository) => [
      repository.fullName.toLowerCase(),
      repository,
    ])
  );
  const resolved = new Map<string, GitHubWorkUnitCrosswalkRepositoryFilter>();
  for (const value of requested) {
    const normalized = value.trim();
    const repository = REPOSITORY_ID.test(normalized)
      ? byId.get(normalized)
      : byName.get(normalized.toLowerCase());
    if (repository === undefined) {
      throw new RangeError(`Unknown GitHub repository filter: ${value}`);
    }
    resolved.set(repository.id, repository);
  }
  return [...resolved.values()].toSorted((left, right) =>
    bytewiseCompare(left.id, right.id)
  );
};

export const readGitHubWorkUnitCrosswalk = async (input: {
  repositories?: readonly string[];
  since: string;
  until: string;
}): Promise<GitHubWorkUnitCrosswalk> => {
  const repositories = await resolveRepositoryFilters(input.repositories ?? []);
  const snapshot = await readGitHubWorkUnitProjectionEvidence();
  return buildGitHubWorkUnitCrosswalk(snapshot, {
    repositories,
    since: input.since,
    until: input.until,
  });
};
