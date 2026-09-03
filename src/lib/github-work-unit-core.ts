import { createHash } from "node:crypto";

import { aggregateGitHubLanguages } from "@/lib/github-change-evidence";
import type {
  GitHubFileChangeStat,
  GitHubLanguageFact,
  GitHubWorkUnitFileFact,
} from "@/lib/github-change-evidence";
import {
  digestGitHubWorkUnitMembership,
  digestGitHubWorkUnitOutcome,
} from "@/lib/github-work-unit-summary";
import type {
  GitHubWorkUnitSummaryAttributionMode,
  GitHubWorkUnitSummaryDiffEvidence,
  GitHubWorkUnitSummaryFileEvidence,
  GitHubWorkUnitSummaryFileStatus,
} from "@/lib/github-work-unit-summary";

export type GitHubRepositoryVisibility =
  | "internal"
  | "private"
  | "public"
  | null;

export interface GitHubLogicalChange {
  additions: number;
  authorUserId: string | null;
  contentObservedAt: string;
  deletions: number;
  enrichmentComplete: boolean;
  fileFacts: readonly GitHubFileChangeStat[];
  fileFactsComplete: boolean;
  fileFactsDigest: string | null;
  logicalActivityAt: string;
  logicalRepositoryId: string;
  logicalSha: string;
  parentCount: number;
  parentLogicalKeys: readonly string[];
  providerFileCapReached: boolean;
  pullRequestCoverageComplete: boolean;
  repositoryId: string;
  sha: string;
  summaryFileFacts: readonly GitHubWorkUnitFileFact[] | null;
  verifiedMergeLanding: boolean;
}

export interface GitHubRepositoryProjectionEvidence {
  defaultBranch: string | null;
  headGenerationComplete: boolean;
  id: string;
  visibility: GitHubRepositoryVisibility;
}

export interface GitHubNormalizedOutcomeEvidence {
  complete: boolean;
  files: readonly GitHubWorkUnitFileFact[];
  providerFileCapReached: boolean;
}

export interface GitHubPullRequestProjectionEvidence {
  authorUserId: string | null;
  baseRepositoryId: string;
  baseSha: string;
  contentObservedAt: string;
  createdAt: string;
  headSha: string;
  memberLogicalKeys: readonly string[];
  membershipComplete: boolean;
  netOutcome: GitHubNormalizedOutcomeEvidence | null;
  netOutcomeOwnedCompletely: boolean;
  nodeId: string;
  snapshotKind: "current" | "final";
  state: "closed" | "merged" | "open";
}

export interface GitHubRefProjectionEvidence {
  branchLineageId: string;
  complete: boolean;
  contentObservedAt: string;
  headSha: string;
  memberLogicalKeys: readonly string[];
  refName: string;
  repositoryId: string;
}

export interface GitHubPriorActivityAnchor {
  activityAnchorAt: string;
  attributionMode?: string;
  identityKey: string;
  outcomeDigest: string;
  repositoryId?: string;
}

export interface GitHubWorkUnitProjectionInput {
  changes: readonly GitHubLogicalChange[];
  priorActivityAnchors?: readonly GitHubPriorActivityAnchor[];
  pullRequests: readonly GitHubPullRequestProjectionEvidence[];
  refs: readonly GitHubRefProjectionEvidence[];
  repositories: readonly GitHubRepositoryProjectionEvidence[];
  trackedAuthorUserIds: ReadonlySet<string>;
}

interface GitHubWorkUnitProjectionOptions {
  outcomeDigests?: ReadonlyMap<string, string | null>;
}

export interface GitHubWorkUnitOwnershipIndex {
  pullRequestsByLogicalKey: ReadonlyMap<
    string,
    readonly GitHubPullRequestProjectionEvidence[]
  >;
  refsByLogicalKey: ReadonlyMap<string, readonly GitHubRefProjectionEvidence[]>;
  repositoriesById: ReadonlyMap<string, GitHubRepositoryProjectionEvidence>;
}

export interface GitHubWorkUnitFacts {
  additions: number;
  deletions: number;
  fileCount: number;
  languages: readonly GitHubLanguageFact[] | null;
  memberCount: number;
}

export interface GitHubProjectedWorkUnitMember {
  logicalKey: string;
  logicalRepositoryId: string;
  logicalSha: string;
  position: number;
}

export interface GitHubProjectedWorkUnit {
  activityAnchorAt: string;
  activityAt: string;
  activityDay: string;
  attributionMode: GitHubWorkUnitSummaryAttributionMode;
  branchLineageId: string | null;
  contentObservedAt: string;
  facts: GitHubWorkUnitFacts;
  factsDigest: string;
  firstActivityAt: string;
  identityKey: string;
  kind: "branch" | "canonical_day" | "pull_request";
  lastActivityAt: string;
  members: readonly GitHubProjectedWorkUnitMember[];
  membershipDigest: string;
  newestCommitRepositoryId: string;
  newestCommitSha: string;
  outcomeDigest: string | null;
  pullRequestNodeId: string | null;
  repositoryId: string;
  visibility: "private" | "public";
}

interface PullRequestOwner {
  kind: "pull_request";
  pullRequest: GitHubPullRequestProjectionEvidence;
}

interface CanonicalOwner {
  activityDay: string;
  kind: "canonical_day";
  ref: GitHubRefProjectionEvidence;
  repository: GitHubRepositoryProjectionEvidence;
}

interface BranchOwner {
  kind: "branch";
  ref: GitHubRefProjectionEvidence;
  repository: GitHubRepositoryProjectionEvidence;
}

type GitHubWorkOwner = BranchOwner | CanonicalOwner | PullRequestOwner;

const shaPattern = /^[a-f0-9]{40}$/u;

const bytewiseCompare = (left: string, right: string): number => {
  const leftBytes = Buffer.from(left, "utf-8");
  const rightBytes = Buffer.from(right, "utf-8");
  return Buffer.compare(leftBytes, rightBytes);
};

const normalizedInstant = (value: string): string => {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError(`Invalid GitHub evidence timestamp: ${value}`);
  }
  return instant.toISOString();
};

const utcDayFrom = (value: string): string =>
  normalizedInstant(value).slice(0, 10);

const digestJson = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value), "utf-8").digest("hex");

const summaryFileStatusFrom = (
  status: string
): GitHubWorkUnitSummaryFileStatus | null => {
  if (
    status === "added" ||
    status === "changed" ||
    status === "copied" ||
    status === "modified" ||
    status === "removed" ||
    status === "renamed"
  ) {
    return status;
  }
  return null;
};

const summaryFileEvidenceFrom = (
  file: GitHubWorkUnitFileFact
): GitHubWorkUnitSummaryFileEvidence | null => {
  const status = summaryFileStatusFrom(file.status);
  if (status === null) {
    return null;
  }
  let patch: GitHubWorkUnitSummaryFileEvidence["patch"];
  if (file.binary) {
    patch = { kind: "binary" };
  } else if (file.patchComplete) {
    if (file.patch === null) {
      patch =
        file.additions === 0 && file.deletions === 0
          ? { kind: "metadata" }
          : { kind: "unavailable" };
    } else {
      patch = { body: file.patch, kind: "text" };
    }
  } else {
    patch = { kind: "unavailable" };
  }
  return {
    additions: file.additions,
    deletions: file.deletions,
    filename: file.filename,
    patch,
    previousFilename: file.previousFilename,
    status,
  };
};

export const githubWorkUnitSummaryDiffEvidenceFrom = (
  files: readonly GitHubWorkUnitFileFact[],
  additions: number,
  deletions: number,
  fileLedgerComplete: boolean,
  providerFileCapReached: boolean
): GitHubWorkUnitSummaryDiffEvidence | null => {
  const adaptedFiles = files.map(summaryFileEvidenceFrom);
  if (adaptedFiles.some((file) => file === null)) {
    return null;
  }
  return {
    additions,
    deletions,
    fileLedgerComplete,
    files: adaptedFiles as readonly GitHubWorkUnitSummaryFileEvidence[],
    providerFileCapReached,
  };
};

const digestNetOutcome = (
  evidence: GitHubNormalizedOutcomeEvidence | null
): string | null => {
  if (evidence === null) {
    return null;
  }
  const additions = evidence.files.reduce(
    (total, file) => total + file.additions,
    0
  );
  const deletions = evidence.files.reduce(
    (total, file) => total + file.deletions,
    0
  );
  const diff = githubWorkUnitSummaryDiffEvidenceFrom(
    evidence.files,
    additions,
    deletions,
    evidence.complete,
    evidence.providerFileCapReached
  );
  if (diff === null) {
    return null;
  }
  const result = digestGitHubWorkUnitOutcome({ diff, mode: "net" });
  return result.ok ? result.digest : null;
};

const digestCompositeOutcome = (
  orderedChanges: readonly GitHubLogicalChange[]
): string | null => {
  const changes = orderedChanges.map((change) =>
    change.summaryFileFacts === null
      ? null
      : githubWorkUnitSummaryDiffEvidenceFrom(
          change.summaryFileFacts,
          change.additions,
          change.deletions,
          change.fileFactsComplete,
          change.providerFileCapReached
        )
  );
  if (changes.some((change) => change === null)) {
    return null;
  }
  const result = digestGitHubWorkUnitOutcome({
    changes: changes as readonly GitHubWorkUnitSummaryDiffEvidence[],
    mode: "composite",
  });
  return result.ok ? result.digest : null;
};

export const githubLogicalChangeKey = (
  repositoryId: string,
  sha: string
): string => {
  if (repositoryId.length === 0 || !shaPattern.test(sha)) {
    throw new Error("A logical change key requires a repository ID and SHA");
  }
  return `${repositoryId}/${sha}`;
};

export const isEligibleGitHubWorkChange = (
  change: GitHubLogicalChange,
  trackedAuthorUserIds: ReadonlySet<string>
): boolean => {
  const fileCountersAreValid = change.fileFacts.every(
    (file) =>
      Number.isSafeInteger(file.additions) &&
      file.additions >= 0 &&
      Number.isSafeInteger(file.deletions) &&
      file.deletions >= 0 &&
      file.filename.length > 0 &&
      !file.filename.includes("\0")
  );
  if (
    change.authorUserId === null ||
    !trackedAuthorUserIds.has(change.authorUserId) ||
    !change.enrichmentComplete ||
    !change.fileFactsComplete ||
    change.providerFileCapReached ||
    change.parentCount > 1 ||
    !Number.isSafeInteger(change.parentCount) ||
    change.parentCount < 0 ||
    !Number.isSafeInteger(change.additions) ||
    !Number.isSafeInteger(change.deletions) ||
    change.additions < 0 ||
    change.deletions < 0 ||
    !fileCountersAreValid ||
    !shaPattern.test(change.sha) ||
    !shaPattern.test(change.logicalSha)
  ) {
    return false;
  }

  return change.fileFacts.length > 0 || change.additions + change.deletions > 0;
};

export const isEffectivePullRequestSnapshot = (
  pullRequest: GitHubPullRequestProjectionEvidence
): boolean =>
  pullRequest.membershipComplete &&
  ((pullRequest.state === "open" && pullRequest.snapshotKind === "current") ||
    (pullRequest.state !== "open" && pullRequest.snapshotKind === "final"));

const pullRequestStateRank = (
  state: GitHubPullRequestProjectionEvidence["state"]
): number => {
  if (state === "merged") {
    return 0;
  }
  if (state === "open") {
    return 1;
  }
  return 2;
};

export const chooseEffectivePullRequest = (
  pullRequests: readonly GitHubPullRequestProjectionEvidence[],
  trackedAuthorUserIds: ReadonlySet<string>
): GitHubPullRequestProjectionEvidence | null => {
  const eligible = pullRequests
    .filter(isEffectivePullRequestSnapshot)
    .toSorted((left, right) => {
      const stateOrder =
        pullRequestStateRank(left.state) - pullRequestStateRank(right.state);
      if (stateOrder !== 0) {
        return stateOrder;
      }

      const leftTracked =
        left.authorUserId !== null &&
        trackedAuthorUserIds.has(left.authorUserId);
      const rightTracked =
        right.authorUserId !== null &&
        trackedAuthorUserIds.has(right.authorUserId);
      if (leftTracked !== rightTracked) {
        return leftTracked ? -1 : 1;
      }

      const createdOrder =
        Date.parse(normalizedInstant(left.createdAt)) -
        Date.parse(normalizedInstant(right.createdAt));
      return createdOrder || bytewiseCompare(left.nodeId, right.nodeId);
    });
  return eligible[0] ?? null;
};

const choosePrimarySideRef = (
  refs: readonly GitHubRefProjectionEvidence[]
): GitHubRefProjectionEvidence | null => {
  const completeHeads = refs
    .filter((ref) => ref.complete && ref.refName.startsWith("refs/heads/"))
    .toSorted(
      (left, right) =>
        bytewiseCompare(
          left.refName.normalize("NFC"),
          right.refName.normalize("NFC")
        ) || bytewiseCompare(left.refName, right.refName)
    );
  return completeHeads[0] ?? null;
};

export const stableTopologicalOrder = <
  T extends { logicalKey: string; parentLogicalKeys: readonly string[] },
>(
  members: readonly T[]
): readonly T[] => {
  const byKey = new Map<string, T>();
  for (const member of members) {
    if (byKey.has(member.logicalKey)) {
      throw new Error(`Duplicate logical change: ${member.logicalKey}`);
    }
    byKey.set(member.logicalKey, member);
  }

  const childrenByParent = new Map<string, Set<string>>();
  const remainingParents = new Map<string, number>();
  for (const member of members) {
    const parents = new Set(
      member.parentLogicalKeys.filter((parent) => byKey.has(parent))
    );
    remainingParents.set(member.logicalKey, parents.size);
    for (const parent of parents) {
      const children = childrenByParent.get(parent) ?? new Set<string>();
      children.add(member.logicalKey);
      childrenByParent.set(parent, children);
    }
  }

  const ready = [...byKey.keys()]
    .filter((key) => remainingParents.get(key) === 0)
    .toSorted(bytewiseCompare);
  const ordered: T[] = [];
  while (ready.length > 0) {
    const nextKey = ready.shift();
    if (nextKey === undefined) {
      break;
    }
    const next = byKey.get(nextKey);
    if (next === undefined) {
      throw new Error("Topological ordering lost a member");
    }
    ordered.push(next);

    const children = [...(childrenByParent.get(nextKey) ?? [])].toSorted(
      bytewiseCompare
    );
    for (const child of children) {
      const remaining = (remainingParents.get(child) ?? 0) - 1;
      remainingParents.set(child, remaining);
      if (remaining === 0) {
        const insertionIndex = ready.findIndex(
          (candidate) => bytewiseCompare(child, candidate) < 0
        );
        ready.splice(
          insertionIndex === -1 ? ready.length : insertionIndex,
          0,
          child
        );
      }
    }
  }

  if (ordered.length !== members.length) {
    throw new Error("Logical change ancestry contains a cycle");
  }
  return ordered;
};

const aggregateGitHubWorkUnitFacts = (
  changes: readonly GitHubLogicalChange[]
): GitHubWorkUnitFacts => {
  const filenames = new Set<string>();
  const files: GitHubFileChangeStat[] = [];
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    additions += change.additions;
    deletions += change.deletions;
    for (const file of change.fileFacts) {
      files.push(file);
      filenames.add(file.filename);
    }
  }

  return {
    additions,
    deletions,
    fileCount: filenames.size,
    languages: aggregateGitHubLanguages(files),
    memberCount: changes.length,
  };
};

const identityKeyFrom = (owner: GitHubWorkOwner): string => {
  if (owner.kind === "pull_request") {
    return `pr:${owner.pullRequest.nodeId}`;
  }
  if (owner.kind === "canonical_day") {
    return `canonical:${owner.repository.id}:${owner.activityDay}`;
  }
  return `branch:${owner.ref.branchLineageId}`;
};

const repositoryIdFrom = (owner: GitHubWorkOwner): string =>
  owner.kind === "pull_request"
    ? owner.pullRequest.baseRepositoryId
    : owner.repository.id;

const attributionModeFrom = (
  owner: GitHubWorkOwner,
  trackedAuthorUserIds: ReadonlySet<string>
): GitHubWorkUnitSummaryAttributionMode =>
  owner.kind === "pull_request"
    ? owner.pullRequest.authorUserId !== null &&
      trackedAuthorUserIds.has(owner.pullRequest.authorUserId)
      ? "tracked_authored_pr"
      : "foreign_pr_contribution"
    : owner.kind === "canonical_day"
      ? "canonical_owned_composite"
      : "branch_owned_composite";

const equivalentOutcomeKey = (
  repositoryId: string,
  attributionMode: string,
  outcomeDigest: string
) => `${repositoryId}\0${attributionMode}\0${outcomeDigest}`;

const visibilityFrom = (
  visibility: GitHubRepositoryVisibility
): "private" | "public" | null => {
  if (visibility === "public") {
    return "public";
  }
  if (visibility === "private" || visibility === "internal") {
    return "private";
  }
  return null;
};

export const indexGitHubWorkUnitOwnershipEvidence = (
  input: Pick<
    GitHubWorkUnitProjectionInput,
    "pullRequests" | "refs" | "repositories"
  >
): GitHubWorkUnitOwnershipIndex => {
  const repositoriesById = new Map(
    input.repositories.map((repository) => [repository.id, repository])
  );
  if (repositoriesById.size !== input.repositories.length) {
    throw new Error("Repository projection evidence must be unique");
  }

  const pullRequestsByLogicalKey = new Map<
    string,
    GitHubPullRequestProjectionEvidence[]
  >();
  for (const pullRequest of input.pullRequests) {
    for (const logicalKey of new Set(pullRequest.memberLogicalKeys)) {
      const candidates = pullRequestsByLogicalKey.get(logicalKey) ?? [];
      candidates.push(pullRequest);
      pullRequestsByLogicalKey.set(logicalKey, candidates);
    }
  }

  const refsByLogicalKey = new Map<string, GitHubRefProjectionEvidence[]>();
  for (const ref of input.refs) {
    for (const logicalKey of new Set(ref.memberLogicalKeys)) {
      const candidates = refsByLogicalKey.get(logicalKey) ?? [];
      candidates.push(ref);
      refsByLogicalKey.set(logicalKey, candidates);
    }
  }

  return {
    pullRequestsByLogicalKey,
    refsByLogicalKey,
    repositoriesById,
  };
};

const chooseOwnerFor = (
  change: GitHubLogicalChange,
  ownership: GitHubWorkUnitOwnershipIndex,
  trackedAuthorUserIds: ReadonlySet<string>
): GitHubWorkOwner | null => {
  const logicalKey = githubLogicalChangeKey(
    change.logicalRepositoryId,
    change.logicalSha
  );
  const pullRequest = chooseEffectivePullRequest(
    ownership.pullRequestsByLogicalKey.get(logicalKey) ?? [],
    trackedAuthorUserIds
  );
  if (pullRequest !== null) {
    return { kind: "pull_request", pullRequest };
  }
  if (change.verifiedMergeLanding) {
    return null;
  }

  const repository = ownership.repositoriesById.get(change.repositoryId);
  if (
    repository === undefined ||
    repository.defaultBranch === null ||
    !repository.headGenerationComplete ||
    !change.pullRequestCoverageComplete
  ) {
    return null;
  }

  const reachableRefs = (
    ownership.refsByLogicalKey.get(logicalKey) ?? []
  ).filter((ref) => ref.repositoryId === repository.id && ref.complete);
  const canonicalRefName = `refs/heads/${repository.defaultBranch}`;
  const canonicalRef = reachableRefs.find(
    (ref) => ref.refName === canonicalRefName
  );
  if (canonicalRef !== undefined) {
    return {
      activityDay: utcDayFrom(change.logicalActivityAt),
      kind: "canonical_day",
      ref: canonicalRef,
      repository,
    };
  }

  const sideRef = choosePrimarySideRef(
    reachableRefs.filter((ref) => ref.refName !== canonicalRefName)
  );
  return sideRef === null ? null : { kind: "branch", ref: sideRef, repository };
};

const outcomeDigestFor = (
  owner: GitHubWorkOwner,
  orderedChanges: readonly GitHubLogicalChange[],
  trackedAuthorUserIds: ReadonlySet<string>
): string | null => {
  if (owner.kind === "pull_request") {
    const authoredByTracked =
      owner.pullRequest.authorUserId !== null &&
      trackedAuthorUserIds.has(owner.pullRequest.authorUserId);
    if (authoredByTracked && owner.pullRequest.netOutcomeOwnedCompletely) {
      return digestNetOutcome(owner.pullRequest.netOutcome);
    }
    return digestCompositeOutcome(orderedChanges);
  }

  return digestCompositeOutcome(orderedChanges);
};

const maxInstant = (values: readonly string[]): string =>
  values.map(normalizedInstant).toSorted().at(-1) ??
  (() => {
    throw new Error("Cannot project an empty work unit");
  })();

const minInstant = (values: readonly string[]): string =>
  values.map(normalizedInstant).toSorted()[0] ??
  (() => {
    throw new Error("Cannot project an empty work unit");
  })();

const newestChangeFrom = (
  changes: readonly GitHubLogicalChange[]
): GitHubLogicalChange =>
  [...changes].toSorted((left, right) => {
    const activityOrder =
      Date.parse(normalizedInstant(right.logicalActivityAt)) -
      Date.parse(normalizedInstant(left.logicalActivityAt));
    if (activityOrder !== 0) {
      return activityOrder;
    }
    return bytewiseCompare(
      githubLogicalChangeKey(left.logicalRepositoryId, left.logicalSha),
      githubLogicalChangeKey(right.logicalRepositoryId, right.logicalSha)
    );
  })[0] ??
  (() => {
    throw new Error("Cannot select the newest change from an empty work unit");
  })();

const projectedUnitFrom = (
  owner: GitHubWorkOwner,
  repository: GitHubRepositoryProjectionEvidence,
  changes: readonly GitHubLogicalChange[],
  trackedAuthorUserIds: ReadonlySet<string>,
  priorAnchors: ReadonlyMap<string, string>,
  priorEquivalentAnchors: ReadonlyMap<string, string>,
  outcomeDigests: ReadonlyMap<string, string | null> | undefined
): GitHubProjectedWorkUnit | null => {
  const visibility = visibilityFrom(repository.visibility);
  if (visibility === null) {
    return null;
  }

  const keyedChanges = changes.map((change) => ({
    ...change,
    logicalKey: githubLogicalChangeKey(
      change.logicalRepositoryId,
      change.logicalSha
    ),
  }));
  const orderedChanges = stableTopologicalOrder(keyedChanges);
  const facts = aggregateGitHubWorkUnitFacts(orderedChanges);
  const identityKey = identityKeyFrom(owner);
  const outcomeDigest =
    outcomeDigests !== undefined && outcomeDigests.has(identityKey)
      ? (outcomeDigests.get(identityKey) ?? null)
      : outcomeDigestFor(owner, orderedChanges, trackedAuthorUserIds);
  const currentAnchor = maxInstant(
    orderedChanges.map((change) => change.logicalActivityAt)
  );
  const attributionMode = attributionModeFrom(owner, trackedAuthorUserIds);
  const activityAnchorAt =
    owner.kind === "canonical_day" || outcomeDigest === null
      ? currentAnchor
      : (priorAnchors.get(`${identityKey}/${outcomeDigest}`) ??
        (owner.kind === "branch"
          ? priorEquivalentAnchors.get(
              equivalentOutcomeKey(
                repository.id,
                attributionMode,
                outcomeDigest
              )
            )
          : undefined) ??
        currentAnchor);
  const firstActivityAt = minInstant(
    orderedChanges.map((change) => change.logicalActivityAt)
  );
  const lastActivityAt = maxInstant(
    orderedChanges.map((change) => change.logicalActivityAt)
  );
  const newestChange = newestChangeFrom(orderedChanges);
  const members = orderedChanges.map((change, position) => ({
    logicalKey: change.logicalKey,
    logicalRepositoryId: change.logicalRepositoryId,
    logicalSha: change.logicalSha,
    position,
  }));
  const membershipDigest = digestGitHubWorkUnitMembership({
    members: members.map((member) => ({
      logicalChangeKey: member.logicalKey,
      order: member.position,
    })),
    unitKey: identityKey,
  });
  const { kind } = owner;
  const ownerFacts =
    owner.kind === "pull_request"
      ? {
          baseSha: owner.pullRequest.baseSha,
          headSha: owner.pullRequest.headSha,
          state: owner.pullRequest.state,
        }
      : { headSha: owner.ref.headSha };
  const contentObservedAt = maxInstant([
    ...orderedChanges.map((change) => change.contentObservedAt),
    owner.kind === "pull_request"
      ? owner.pullRequest.contentObservedAt
      : owner.ref.contentObservedAt,
  ]);
  const activityDay = utcDayFrom(activityAnchorAt);
  const factsDigest = digestJson({
    activityAnchorAt,
    activityDay,
    attributionMode,
    facts,
    firstActivityAt,
    kind,
    lastActivityAt,
    membershipDigest,
    newestLogicalKey: githubLogicalChangeKey(
      newestChange.logicalRepositoryId,
      newestChange.logicalSha
    ),
    ownerFacts,
    recipe: "github_work_unit_facts_v1",
    repositoryId: repository.id,
    visibility,
  });

  return {
    activityAnchorAt,
    activityAt: activityAnchorAt,
    activityDay,
    attributionMode,
    branchLineageId: owner.kind === "branch" ? owner.ref.branchLineageId : null,
    contentObservedAt,
    facts,
    factsDigest,
    firstActivityAt,
    identityKey,
    kind,
    lastActivityAt,
    members,
    membershipDigest,
    newestCommitRepositoryId: newestChange.repositoryId,
    newestCommitSha: newestChange.sha,
    outcomeDigest,
    pullRequestNodeId:
      owner.kind === "pull_request" ? owner.pullRequest.nodeId : null,
    repositoryId: repository.id,
    visibility,
  };
};

const priorEquivalentAnchorsFrom = (
  anchors: readonly GitHubPriorActivityAnchor[]
) => {
  const result = new Map<string, string>();
  for (const anchor of anchors) {
    if (
      anchor.repositoryId === undefined ||
      anchor.attributionMode === undefined ||
      !anchor.identityKey.startsWith("branch:")
    ) {
      continue;
    }
    const key = equivalentOutcomeKey(
      anchor.repositoryId,
      anchor.attributionMode,
      anchor.outcomeDigest
    );
    const instant = normalizedInstant(anchor.activityAnchorAt);
    const current = result.get(key);
    if (current === undefined || instant < current) {
      result.set(key, instant);
    }
  }
  return result;
};

const mergedPullRequestsByFileFactsFrom = (
  changes: readonly GitHubLogicalChange[],
  ownership: GitHubWorkUnitOwnershipIndex,
  trackedAuthorUserIds: ReadonlySet<string>
) => {
  const result = new Map<string, GitHubPullRequestProjectionEvidence>();
  for (const change of changes) {
    if (change.fileFactsDigest === null) {
      continue;
    }
    const owner = chooseOwnerFor(change, ownership, trackedAuthorUserIds);
    if (
      owner?.kind !== "pull_request" ||
      owner.pullRequest.state !== "merged"
    ) {
      continue;
    }
    const key = `${repositoryIdFrom(owner)}\0${change.fileFactsDigest}`;
    const previous = result.get(key);
    const selected = chooseEffectivePullRequest(
      [...(previous === undefined ? [] : [previous]), owner.pullRequest],
      trackedAuthorUserIds
    );
    if (selected !== null) {
      result.set(key, selected);
    }
  }
  return result;
};

const claimsEquivalentMergedPullRequestPatch = (
  change: GitHubLogicalChange,
  owner: GitHubWorkOwner,
  repositoryId: string,
  mergedPullRequestsByFileFacts: ReadonlyMap<
    string,
    GitHubPullRequestProjectionEvidence
  >,
  claimedFileFacts: Set<string>
) => {
  if (change.fileFactsDigest === null) {
    return true;
  }
  const key = `${repositoryId}\0${change.fileFactsDigest}`;
  const mergedPullRequest = mergedPullRequestsByFileFacts.get(key);
  if (mergedPullRequest === undefined) {
    return true;
  }
  if (
    owner.kind !== "pull_request" ||
    owner.pullRequest.nodeId !== mergedPullRequest.nodeId ||
    claimedFileFacts.has(key)
  ) {
    return false;
  }
  claimedFileFacts.add(key);
  return true;
};

export const projectGitHubWorkUnits = (
  input: GitHubWorkUnitProjectionInput,
  ownership = indexGitHubWorkUnitOwnershipEvidence(input),
  options: GitHubWorkUnitProjectionOptions = {}
): readonly GitHubProjectedWorkUnit[] => {
  const priorAnchors = new Map(
    (input.priorActivityAnchors ?? []).map((anchor) => [
      `${anchor.identityKey}/${anchor.outcomeDigest}`,
      normalizedInstant(anchor.activityAnchorAt),
    ])
  );
  const priorEquivalentAnchors = priorEquivalentAnchorsFrom(
    input.priorActivityAnchors ?? []
  );
  const grouped = new Map<
    string,
    {
      changes: GitHubLogicalChange[];
      owner: GitHubWorkOwner;
      repository: GitHubRepositoryProjectionEvidence;
    }
  >();
  const seenLogicalKeys = new Set<string>();

  const eligibleChanges = [...input.changes]
    .filter((change) =>
      isEligibleGitHubWorkChange(change, input.trackedAuthorUserIds)
    )
    .toSorted((left, right) =>
      bytewiseCompare(
        githubLogicalChangeKey(left.logicalRepositoryId, left.logicalSha),
        githubLogicalChangeKey(right.logicalRepositoryId, right.logicalSha)
      )
    );
  const mergedPullRequestByFileFacts = mergedPullRequestsByFileFactsFrom(
    eligibleChanges,
    ownership,
    input.trackedAuthorUserIds
  );
  const claimedFileFacts = new Set<string>();

  for (const change of eligibleChanges) {
    const logicalKey = githubLogicalChangeKey(
      change.logicalRepositoryId,
      change.logicalSha
    );
    if (seenLogicalKeys.has(logicalKey)) {
      throw new Error(`Logical change appears more than once: ${logicalKey}`);
    }
    seenLogicalKeys.add(logicalKey);

    const owner = chooseOwnerFor(change, ownership, input.trackedAuthorUserIds);
    if (owner === null) {
      continue;
    }
    const repositoryId = repositoryIdFrom(owner);
    if (
      !claimsEquivalentMergedPullRequestPatch(
        change,
        owner,
        repositoryId,
        mergedPullRequestByFileFacts,
        claimedFileFacts
      )
    ) {
      continue;
    }
    const repository = ownership.repositoriesById.get(repositoryId);
    if (repository === undefined) {
      throw new Error(
        `Work owner references unknown repository: ${repositoryId}`
      );
    }

    const key = identityKeyFrom(owner);
    const group = grouped.get(key) ?? { changes: [], owner, repository };
    if (group.repository.id !== repository.id) {
      throw new Error(`Work-unit identity spans repositories: ${key}`);
    }
    group.changes.push(change);
    grouped.set(key, group);
  }

  const projected: GitHubProjectedWorkUnit[] = [];
  for (const group of grouped.values()) {
    const unit = projectedUnitFrom(
      group.owner,
      group.repository,
      group.changes,
      input.trackedAuthorUserIds,
      priorAnchors,
      priorEquivalentAnchors,
      options.outcomeDigests
    );
    if (unit !== null) {
      projected.push(unit);
    }
  }

  return projected.toSorted(
    (left, right) =>
      Date.parse(right.activityAt) - Date.parse(left.activityAt) ||
      bytewiseCompare(left.repositoryId, right.repositoryId) ||
      bytewiseCompare(left.identityKey, right.identityKey)
  );
};
