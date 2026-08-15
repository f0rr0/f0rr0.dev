import { createHash, createHmac } from "node:crypto";

import { workBucketSchema } from "@/lib/timeline-core";
import type { WorkBucket } from "@/lib/timeline-core";
import type {
  TimelineActivityDayRecord,
  TimelinePublicEventRecord,
} from "@/lib/timeline-store";

type JsonObject = Record<string, unknown>;

const githubRepositoryPattern =
  /^(?:[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/[a-z\d._-]{1,100}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumCommitCount = 100_000;

export interface PrivateTaxonomyValue {
  bucket: WorkBucket;
  domain: string | null;
}

export interface NormalizeGitHubSliceOptions {
  privacyKey: string | null;
  subject: string;
  taxonomy: ReadonlyMap<string, PrivateTaxonomyValue>;
  windowEnd: string;
  windowStart: string;
}

export interface NormalizedGitHubSlice {
  coverage: "complete" | "partial";
  privateRecordsSkipped: number;
  publicEventCoverage: "complete" | "partial" | "unavailable";
  publicEvents: TimelinePublicEventRecord[];
  records: TimelineActivityDayRecord[];
  repositoriesSeen: number;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeDate = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const date = value.slice(0, 10);
  if (!datePattern.test(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
    ? null
    : date;
};

const normalizeText = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maximumLength);
};

const normalizeRepositoryName = (value: unknown) => {
  const name = normalizeText(value, 140);
  return name !== null && githubRepositoryPattern.test(name) ? name : null;
};

const normalizeGitHubUrl = (value: unknown, nameWithOwner: string) => {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/$/, "").toLowerCase();
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      normalizedPath === `/${nameWithOwner.toLowerCase()}` &&
      url.search.length === 0 &&
      url.hash.length === 0
      ? `https://github.com/${nameWithOwner}`
      : null;
  } catch {
    return null;
  }
};

const normalizeGitHubEventUrl = (
  value: unknown,
  nameWithOwner: string,
  kind: TimelinePublicEventRecord["eventKind"]
) => {
  if (kind === "repository_created") {
    return normalizeGitHubUrl(value, nameWithOwner);
  }
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    const suffix = kind === "issue_opened" ? "issues" : "pull";
    const expectedPrefix = `/${nameWithOwner}/${suffix}/`.toLocaleLowerCase(
      "en-US"
    );
    const normalizedPath = url.pathname.toLocaleLowerCase("en-US");
    const number = normalizedPath.slice(expectedPrefix.length);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      normalizedPath.startsWith(expectedPrefix) &&
      /^\d+$/.test(number) &&
      url.search.length === 0 &&
      url.hash.length === 0
      ? `https://github.com/${nameWithOwner}/${suffix}/${number}`
      : null;
  } catch {
    return null;
  }
};

const languageFamilyFor = (language: string | null) => {
  const normalized = language?.toLocaleLowerCase("en-US") ?? "";

  if (
    [
      "css",
      "html",
      "javascript",
      "mdx",
      "svelte",
      "typescript",
      "vue",
    ].includes(normalized)
  ) {
    return "web";
  }
  if (["c", "c++", "go", "rust", "swift", "zig"].includes(normalized)) {
    return "systems";
  }
  if (
    ["julia", "jupyter notebook", "python", "r", "sql"].includes(normalized)
  ) {
    return "data";
  }
  if (["dart", "kotlin", "objective-c"].includes(normalized)) {
    return "mobile";
  }
  if (
    ["dockerfile", "hcl", "nix", "powershell", "shell"].includes(normalized)
  ) {
    return "infrastructure";
  }
  if (["markdown", "tex", "typst"].includes(normalized)) {
    return "documentation";
  }
  return "other";
};

const readTopics = (value: unknown) => {
  if (!isObject(value) || !Array.isArray(value.nodes)) {
    return [];
  }

  return value.nodes.flatMap((node) => {
    if (!isObject(node) || !isObject(node.topic)) {
      return [];
    }
    const name = normalizeText(node.topic.name, 50)?.toLocaleLowerCase("en-US");
    return name === undefined || name === null ? [] : [name];
  });
};

const classifyPublicBucket = (input: {
  description: string | null;
  nameWithOwner: string;
  topics: readonly string[];
}): Exclude<WorkBucket, "Across the work" | "Private product work"> => {
  const haystack = [
    input.nameWithOwner,
    input.description ?? "",
    ...input.topics,
  ]
    .join(" ")
    .toLocaleLowerCase("en-US");

  if (/\b(ai|agent|agents|llm|mcp|model|models)\b/.test(haystack)) {
    return "Applied AI";
  }
  if (
    /\b(ci|database|devops|docker|infra|postgres|proxy|runtime|serverless)\b/.test(
      haystack
    )
  ) {
    return "Infrastructure";
  }
  if (/\b(portfolio|product|site|website|workflow)\b/.test(haystack)) {
    return "Product systems";
  }
  return "Open source";
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const hmac = (privacyKey: string, value: string) =>
  createHmac("sha256", privacyKey).update(value).digest("hex");

export const normalizeTimelinePrivacyKey = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized !== undefined &&
    normalized.length >= 32 &&
    new Set(normalized).size >= 8
    ? normalized
    : null;
};

export const timelinePrivacyPolicyVersion = (
  privacyKey: string,
  taxonomy: ReadonlyMap<string, PrivateTaxonomyValue>
) =>
  hmac(
    privacyKey,
    JSON.stringify({
      policy: "timeline-private-v1",
      taxonomy: [...taxonomy.entries()].toSorted(([left], [right]) =>
        left.localeCompare(right)
      ),
    })
  );

export const publicTimelineRepoKey = (repositoryId: string) =>
  sha256(`repository-node:${repositoryId}`);

export const privateTimelineRepoKey = (
  repositoryId: string,
  privacyKey: string
) => hmac(privacyKey, `repository:${repositoryId}`);

const eventConnectionNames = new Set([
  "issueContributions",
  "pullRequestContributions",
  "pullRequestReviewContributions",
  "repositoryContributions",
]);

const isExpectedForbiddenEventError = (value: unknown) => {
  if (
    !isObject(value) ||
    value.type !== "FORBIDDEN" ||
    !Array.isArray(value.path)
  ) {
    return false;
  }
  const { path } = value;
  return (
    path.length === 5 &&
    path[0] === "user" &&
    path[1] === "contributionsCollection" &&
    typeof path[2] === "string" &&
    eventConnectionNames.has(path[2]) &&
    path[3] === "nodes" &&
    typeof path[4] === "number" &&
    Number.isSafeInteger(path[4]) &&
    path[4] >= 0
  );
};

const contributionCollectionFrom = (payload: unknown) => {
  if (!isObject(payload) || !isObject(payload.data)) {
    return null;
  }
  const { errors } = payload;
  const coverage =
    errors === undefined || (Array.isArray(errors) && errors.length === 0)
      ? "complete"
      : Array.isArray(errors) && errors.every(isExpectedForbiddenEventError)
        ? "partial"
        : null;
  if (coverage === null) {
    return null;
  }

  const { user } = payload.data;
  if (!isObject(user) || !isObject(user.contributionsCollection)) {
    return null;
  }

  return { collection: user.contributionsCollection, coverage };
};

const repositoryGroupsFrom = (collection: JsonObject) => {
  const groups = collection.commitContributionsByRepository;
  return Array.isArray(groups) ? groups : null;
};

const publicEventSpecs = [
  {
    connection: "issueContributions",
    entity: "issue",
    eventKind: "issue_opened",
  },
  {
    connection: "pullRequestContributions",
    entity: "pullRequest",
    eventKind: "pull_request_opened",
  },
  {
    connection: "pullRequestReviewContributions",
    entity: "pullRequest",
    eventKind: "pull_request_reviewed",
  },
  {
    connection: "repositoryContributions",
    entity: "repository",
    eventKind: "repository_created",
  },
] as const satisfies readonly {
  connection: string;
  entity: string;
  eventKind: TimelinePublicEventRecord["eventKind"];
}[];

// The explicit guards are the public identity boundary for untrusted API data.
// eslint-disable-next-line complexity
const normalizePublicEvents = (
  collection: JsonObject,
  options: NormalizeGitHubSliceOptions
) => {
  const hasEventConnections = publicEventSpecs.some(
    ({ connection }) => collection[connection] !== undefined
  );
  if (!hasEventConnections) {
    return {
      coverage: "unavailable" as const,
      events: [] as TimelinePublicEventRecord[],
    };
  }

  let coverage: "complete" | "partial" = "complete";
  const events = new Map<string, TimelinePublicEventRecord>();
  for (const spec of publicEventSpecs) {
    const connection = collection[spec.connection];
    if (
      !isObject(connection) ||
      !Array.isArray(connection.nodes) ||
      !isObject(connection.pageInfo) ||
      typeof connection.pageInfo.hasNextPage !== "boolean"
    ) {
      coverage = "partial";
      continue;
    }
    if (connection.pageInfo.hasNextPage) {
      coverage = "partial";
    }

    for (const contribution of connection.nodes) {
      if (!isObject(contribution) || contribution.isRestricted !== false) {
        continue;
      }
      const entity = contribution[spec.entity];
      if (!isObject(entity)) {
        continue;
      }
      const repository =
        spec.eventKind === "repository_created" ? entity : entity.repository;
      if (!isObject(repository) || repository.isPrivate !== false) {
        continue;
      }

      const repositoryId = normalizeText(repository.id, 200);
      const nameWithOwner = normalizeRepositoryName(repository.nameWithOwner);
      const day = normalizeDate(contribution.occurredAt);
      // Review contributions represent the latest review for each distinct PR.
      // Keying by the PR keeps later reviews as an update, not a duplicate event.
      const entityId = normalizeText(entity.id, 200);
      if (
        repositoryId === null ||
        nameWithOwner === null ||
        day === null ||
        day < options.windowStart ||
        day > options.windowEnd ||
        entityId === null
      ) {
        continue;
      }

      const publicRepoUrl = normalizeGitHubUrl(repository.url, nameWithOwner);
      const publicUrl = normalizeGitHubEventUrl(
        entity.url,
        nameWithOwner,
        spec.eventKind
      );
      const publicTitle =
        spec.eventKind === "repository_created"
          ? (nameWithOwner.split("/").at(-1) ?? null)
          : normalizeText(entity.title, 240);
      if (
        publicRepoUrl === null ||
        publicUrl === null ||
        publicTitle === null
      ) {
        continue;
      }

      const id = sha256(
        `${options.subject}:public-event:${spec.eventKind}:${entityId}`
      );
      events.set(id, {
        bucket: classifyPublicBucket({
          description: normalizeText(repository.description, 240),
          nameWithOwner,
          topics: readTopics(repository.repositoryTopics),
        }),
        day,
        eventKind: spec.eventKind,
        id,
        publicRepoName: nameWithOwner,
        publicRepoUrl,
        publicTitle,
        publicUrl,
        repoKey: publicTimelineRepoKey(repositoryId),
        source: "github-profile",
        subject: options.subject,
      });
    }
  }

  return { coverage, events: [...events.values()] };
};

const normalizeTaxonomyValue = (
  value: unknown
): PrivateTaxonomyValue | null => {
  if (typeof value === "string") {
    const bucket = workBucketSchema.safeParse(value);
    return bucket.success && bucket.data !== "Across the work"
      ? { bucket: bucket.data, domain: null }
      : null;
  }

  if (!isObject(value)) {
    return null;
  }

  const bucket = workBucketSchema.safeParse(value.bucket);
  const rawDomain = normalizeText(value.domain, 64)?.toLocaleLowerCase("en-US");
  const domain =
    rawDomain !== undefined &&
    rawDomain !== null &&
    /^[a-z\d][a-z\d-]{0,63}$/.test(rawDomain)
      ? rawDomain
      : null;
  if (value.domain !== undefined && domain === null) {
    return null;
  }
  return bucket.success && bucket.data !== "Across the work"
    ? { bucket: bucket.data, domain }
    : null;
};

export const parsePrivateTimelineTaxonomy = (
  value: string | undefined
): ReadonlyMap<string, PrivateTaxonomyValue> => {
  if (value === undefined || value.trim().length === 0) {
    return new Map();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("timeline-taxonomy-invalid");
  }

  if (!isObject(parsed)) {
    throw new Error("timeline-taxonomy-invalid");
  }

  const taxonomy = new Map<string, PrivateTaxonomyValue>();
  for (const [repository, rawValue] of Object.entries(parsed)) {
    const normalizedRepository = normalizeRepositoryName(repository);
    const normalizedValue = normalizeTaxonomyValue(rawValue);
    if (normalizedRepository === null || normalizedValue === null) {
      throw new Error("timeline-taxonomy-invalid");
    }
    taxonomy.set(
      normalizedRepository.toLocaleLowerCase("en-US"),
      normalizedValue
    );
  }

  return taxonomy;
};

export const currentTimelinePrivacyPolicyVersion = () => {
  const privacyKey = normalizeTimelinePrivacyKey(
    process.env.TIMELINE_PRIVACY_KEY
  );
  return privacyKey === null
    ? null
    : timelinePrivacyPolicyVersion(
        privacyKey,
        parsePrivateTimelineTaxonomy(process.env.TIMELINE_PRIVATE_TAXONOMY)
      );
};

// The explicit guards are the privacy boundary for an untrusted API payload.
// eslint-disable-next-line complexity
export const normalizeGitHubContributionSlice = (
  payload: unknown,
  options: NormalizeGitHubSliceOptions
): NormalizedGitHubSlice | null => {
  const response = contributionCollectionFrom(payload);
  if (response === null) {
    return null;
  }
  const { collection, coverage: responseCoverage } = response;
  const groups = repositoryGroupsFrom(collection);
  if (groups === null) {
    return null;
  }

  const records = new Map<string, TimelineActivityDayRecord>();
  let privateRecordsSkipped = 0;
  let repositoriesSeen = 0;

  for (const group of groups) {
    if (!isObject(group) || !isObject(group.repository)) {
      continue;
    }

    const { repository } = group;
    const nameWithOwner = normalizeRepositoryName(repository.nameWithOwner);
    const repositoryId = normalizeText(repository.id, 200);
    const { isPrivate } = repository;
    if (
      nameWithOwner === null ||
      repositoryId === null ||
      typeof isPrivate !== "boolean" ||
      !isObject(group.contributions) ||
      !Array.isArray(group.contributions.nodes)
    ) {
      continue;
    }

    repositoriesSeen += 1;
    const languageName = isObject(repository.primaryLanguage)
      ? normalizeText(repository.primaryLanguage.name, 50)
      : null;
    const languageFamily = isPrivate
      ? "withheld"
      : languageFamilyFor(languageName);
    const publicUrl = isPrivate
      ? null
      : normalizeGitHubUrl(repository.url, nameWithOwner);
    if (!isPrivate && publicUrl === null) {
      continue;
    }

    const taxonomyValue = options.taxonomy.get(
      nameWithOwner.toLocaleLowerCase("en-US")
    );
    const bucket = isPrivate
      ? (taxonomyValue?.bucket ?? "Private product work")
      : classifyPublicBucket({
          description: normalizeText(repository.description, 240),
          nameWithOwner,
          topics: readTopics(repository.repositoryTopics),
        });

    const privatePrivacyKey = options.privacyKey;
    if (isPrivate && privatePrivacyKey === null) {
      privateRecordsSkipped += group.contributions.nodes.length;
      continue;
    }

    const repoKey =
      isPrivate && privatePrivacyKey !== null
        ? privateTimelineRepoKey(repositoryId, privatePrivacyKey)
        : publicTimelineRepoKey(repositoryId);
    const privacyDomainKey =
      isPrivate &&
      privatePrivacyKey !== null &&
      taxonomyValue?.domain !== null &&
      taxonomyValue?.domain !== undefined
        ? hmac(privatePrivacyKey, `domain:${taxonomyValue.domain}`)
        : null;

    for (const contribution of group.contributions.nodes) {
      if (!isObject(contribution)) {
        continue;
      }

      const day = normalizeDate(contribution.occurredAt);
      const { commitCount } = contribution;
      const reachedDefaultBranch =
        typeof contribution.reachedDefaultBranch === "boolean"
          ? contribution.reachedDefaultBranch
          : true;
      if (
        day === null ||
        day < options.windowStart ||
        day > options.windowEnd ||
        typeof commitCount !== "number" ||
        !Number.isSafeInteger(commitCount) ||
        commitCount <= 0 ||
        commitCount > maximumCommitCount
      ) {
        continue;
      }

      const id = sha256(`${options.subject}:${repoKey}:${day}:github-profile`);
      const existing = records.get(id);
      const record: TimelineActivityDayRecord = {
        bucket,
        commitCount: Math.max(existing?.commitCount ?? 0, commitCount),
        day,
        id,
        languageFamily,
        privacyDomainKey,
        privacyPolicyVersion:
          isPrivate && privatePrivacyKey !== null
            ? timelinePrivacyPolicyVersion(privatePrivacyKey, options.taxonomy)
            : null,
        publicRepoName: isPrivate ? null : nameWithOwner,
        publicRepoUrl: publicUrl,
        reachedDefaultBranch,
        repoKey,
        source: "github-profile",
        subject: options.subject,
        visibility: isPrivate ? "private" : "public",
      };
      records.set(id, record);
    }
  }

  const publicEvents = normalizePublicEvents(collection, options);
  const publicEventCoverage =
    responseCoverage === "partial" ? "partial" : publicEvents.coverage;
  return {
    coverage:
      groups.length >= 100 || publicEvents.coverage === "partial"
        ? "partial"
        : "complete",
    privateRecordsSkipped,
    publicEventCoverage,
    publicEvents: publicEvents.events,
    records: [...records.values()],
    repositoriesSeen,
  };
};
