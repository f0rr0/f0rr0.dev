import { createHash, createPrivateKey, createSign } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { isTimelineDatabaseConfigured } from "@/db/client";
import { fetchPublicGitHubContributionDays } from "@/lib/github-contribution-calendar";
import { TIMELINE_WINDOW_DAYS } from "@/lib/timeline-core";
import {
  normalizeGitHubContributionSlice,
  normalizeTimelinePrivacyKey,
  parsePrivateTimelineTaxonomy,
} from "@/lib/timeline-privacy";
import type { PrivateTaxonomyValue } from "@/lib/timeline-privacy";
import {
  beginTimelineSyncRun,
  completeTimelineSyncRun,
  countStoredTimelineActivity,
  deleteTimelineActivityByIds,
  deleteTimelinePublicEventsByIds,
  failTimelineSyncRun,
  pruneTimelineActivityBefore,
  pruneTimelineContributionTotalsBefore,
  pruneTimelinePublicEventsBefore,
  readLastCompletedTimelineSync,
  readTimelineActivityDays,
  readTimelinePublicEvents,
  rejectPublishedTimelineEditions,
  upsertTimelineActivityDays,
  upsertTimelineContributionTotals,
  upsertTimelinePublicEvents,
} from "@/lib/timeline-store";
import type {
  TimelineActivityDayRecord,
  TimelineContributionTotalRecord,
  TimelinePublicEventRecord,
} from "@/lib/timeline-store";

const GITHUB_LOGIN = "f0rr0";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_TIMEOUT_MS = 15_000;
const GITHUB_REST_INTERVAL_MS = 125;
const GITHUB_MAX_RETRY_DELAY_MS = 10_000;
const GITHUB_MAX_RETRIES = 2;
const GITHUB_MAX_PAGES = 1000;
const INCREMENTAL_LOOKBACK_DAYS = 21;
const RETENTION_DAYS = 420;

const contributionQuery = `
  query TimelineContributionSlice(
    $login: String!
    $from: DateTime!
    $to: DateTime!
    $includeCommits: Boolean!
    $includeIssues: Boolean!
    $includePullRequests: Boolean!
    $includeReviews: Boolean!
    $includeRepositories: Boolean!
    $issueCursor: String
    $pullRequestCursor: String
    $reviewCursor: String
    $repositoryCursor: String
  ) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 100)
          @include(if: $includeCommits) {
          repository {
            id
            nameWithOwner
            isPrivate
            url
            description
            primaryLanguage {
              name
            }
            repositoryTopics(first: 10) {
              nodes {
                topic {
                  name
                }
              }
            }
          }
          contributions(first: 100) {
            nodes {
              occurredAt
              commitCount
            }
          }
        }
        issueContributions(first: 100, after: $issueCursor)
          @include(if: $includeIssues) {
          nodes {
            isRestricted
            occurredAt
            issue {
              id
              title
              url
              repository {
                ...TimelinePublicRepository
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
        pullRequestContributions(first: 100, after: $pullRequestCursor)
          @include(if: $includePullRequests) {
          nodes {
            isRestricted
            occurredAt
            pullRequest {
              id
              title
              url
              repository {
                ...TimelinePublicRepository
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
        pullRequestReviewContributions(first: 100, after: $reviewCursor)
          @include(if: $includeReviews) {
          nodes {
            isRestricted
            occurredAt
            pullRequest {
              id
              title
              url
              repository {
                ...TimelinePublicRepository
              }
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
        repositoryContributions(first: 100, after: $repositoryCursor)
          @include(if: $includeRepositories) {
          nodes {
            isRestricted
            occurredAt
            repository {
              ...TimelinePublicRepository
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }

  fragment TimelinePublicRepository on Repository {
    id
    nameWithOwner
    isPrivate
    url
    description
    primaryLanguage {
      name
    }
    repositoryTopics(first: 10) {
      nodes {
        topic {
          name
        }
      }
    }
  }
`;

export type TimelineSyncKind =
  | "backfill"
  | "incremental"
  | "manual"
  | "webhook";

export interface TimelineSyncResult {
  anonymousCoverage: "complete" | "unavailable";
  anonymousDays: number;
  coverage: "complete" | "partial";
  events: number;
  kind: TimelineSyncKind;
  privateActivity: "included" | "skipped";
  rows: number;
  windowEnd: string;
  windowStart: string;
}

class TimelineSyncError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "TimelineSyncError";
  }
}

interface GitHubUserCredential {
  kind: "user";
  token: string;
}

interface GitHubInstallationCredential {
  kind: "installation";
  token: string;
}

type GitHubCredential = GitHubInstallationCredential | GitHubUserCredential;

interface DateSlice {
  end: string;
  start: string;
}

interface CollectionResult {
  coverage: "complete" | "partial";
  failedRequests: number;
  privateRecordsSkipped: number;
  publicEventCoverage: "complete" | "partial" | "unavailable";
  publicEvents: TimelinePublicEventRecord[];
  records: TimelineActivityDayRecord[];
  successfulRequests: number;
}

interface AnonymousContributionCollection {
  coverage: "complete" | "unavailable";
  records: TimelineContributionTotalRecord[];
}

interface CollectionAccumulator {
  coverage: "complete" | "partial";
  failedRequests: number;
  privateRecordsSkipped: number;
  publicEventCoverage: "complete" | "partial" | "unavailable";
  publicEvents: Map<string, TimelinePublicEventRecord>;
  records: Map<string, TimelineActivityDayRecord>;
  successfulRequests: number;
}

interface NormalizationContext {
  privacyKey: string | null;
  subject: string;
  taxonomy: ReadonlyMap<string, PrivateTaxonomyValue>;
}

interface SyncPlan {
  day: Date;
  kind: TimelineSyncKind;
  useFullWindow: boolean;
  windowEnd: string;
  windowStart: string;
  windowStartDate: Date;
}

interface GitHubRestPage {
  nextUrl: string | null;
  payload: unknown;
  status: number;
}

type GitHubRestClient = (
  url: string,
  benignStatuses?: ReadonlySet<number>
) => Promise<GitHubRestPage>;

interface RestRepository {
  apiUrl: string;
  defaultBranch: string | null;
  description: string | null;
  htmlUrl: string;
  id: string;
  isPrivate: boolean;
  language: string | null;
  nameWithOwner: string;
  topics: string[];
}

interface CommitObservation {
  day: string;
  reachedDefaultBranch: boolean;
}

interface RepositoryCollectionResult {
  coverage: "complete" | "partial";
  failedRequests: number;
  normalized: ReturnType<typeof normalizeGitHubContributionSlice>;
  successfulRequests: number;
}

interface PaginatedVisitResult {
  pages: number;
  status: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const addUtcDays = (date: Date, days: number) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days
    )
  );

const startOfUtcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

const createMonthlySlices = (start: Date, end: Date): DateSlice[] => {
  const slices: DateSlice[] = [];
  let cursor = startOfUtcDay(start);
  const finalDay = startOfUtcDay(end);

  while (cursor <= finalDay) {
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
    );
    const sliceEnd = monthEnd < finalDay ? monthEnd : finalDay;
    slices.push({ end: dateOnly(sliceEnd), start: dateOnly(cursor) });
    cursor = addUtcDays(sliceEnd, 1);
  }

  return slices;
};

const base64Url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

const createGitHubAppJwt = (appId: string, privateKey: string) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ exp: now + 540, iat: now - 60, iss: appId })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(
    createPrivateKey(privateKey.replaceAll("\\n", "\n")),
    "base64url"
  );
  return `${unsigned}.${signature}`;
};

const normalizedSetting = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const writeSyncDiagnostic = (diagnostic: Record<string, unknown>) => {
  if (process.env.TIMELINE_SYNC_DIAGNOSTICS === "1") {
    process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
  }
};

const readInstallationIds = (rawInstallationIds: string) => {
  const installationIds = rawInstallationIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    installationIds.length === 0 ||
    installationIds.length > 20 ||
    installationIds.some((value) => !/^\d+$/.test(value))
  ) {
    throw new TimelineSyncError("github-app-installations-invalid");
  }
  return installationIds;
};

const fetchInstallationToken = async (
  appJwt: string,
  installationId: string
) => {
  const response = await fetch(
    `${GITHUB_API_URL}/app/installations/${installationId}/access_tokens`,
    {
      body: JSON.stringify({ permissions: { contents: "read" } }),
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "Content-Type": "application/json",
        "User-Agent": "f0rr0.dev-timeline",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      method: "POST",
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new TimelineSyncError("github-app-token-failed");
  }

  const payload: unknown = await response.json();
  if (!isObject(payload) || typeof payload.token !== "string") {
    throw new TimelineSyncError("github-app-token-invalid");
  }
  const token = payload.token.trim();
  if (token.length === 0) {
    throw new TimelineSyncError("github-app-token-invalid");
  }
  return token;
};

const readUserCredentials = (): GitHubUserCredential[] => {
  const tokens = [
    process.env.GITHUB_PUBLIC_ACTIVITY_TOKEN,
    process.env.GITHUB_ACTIVITY_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GH_TOKEN,
  ]
    .map(normalizedSetting)
    .filter((value): value is string => value !== undefined);
  return [...new Set(tokens)].map((token) => ({ kind: "user", token }));
};

const readInstallationCredentials = async (): Promise<
  GitHubInstallationCredential[]
> => {
  const appId = normalizedSetting(process.env.GITHUB_APP_ID);
  const privateKey = normalizedSetting(process.env.GITHUB_APP_PRIVATE_KEY);
  const rawInstallationIds = normalizedSetting(
    process.env.GITHUB_APP_INSTALLATION_IDS
  );
  const hasAnyAppSetting =
    appId !== undefined ||
    privateKey !== undefined ||
    rawInstallationIds !== undefined;
  if (!hasAnyAppSetting) {
    return [];
  }
  if (
    appId === undefined ||
    privateKey === undefined ||
    rawInstallationIds === undefined
  ) {
    throw new TimelineSyncError("github-app-configuration-incomplete");
  }

  let appJwt: string;
  try {
    appJwt = createGitHubAppJwt(appId, privateKey);
  } catch {
    throw new TimelineSyncError("github-app-private-key-invalid");
  }

  const credentials: GitHubInstallationCredential[] = [];
  for (const installationId of readInstallationIds(rawInstallationIds)) {
    credentials.push({
      kind: "installation",
      token: await fetchInstallationToken(appJwt, installationId),
    });
  }
  return credentials;
};

const deduplicateCredentials = (credentials: readonly GitHubCredential[]) => {
  const unique = new Map<string, GitHubCredential>();
  for (const credential of credentials) {
    const key = createHash("sha256")
      .update(credential.kind)
      .update("\0")
      .update(credential.token)
      .digest("hex");
    unique.set(key, credential);
  }
  return [...unique.values()];
};

const readGitHubCredentials = async (): Promise<GitHubCredential[]> => {
  const userCredentials = readUserCredentials();
  const installationCredentials = await readInstallationCredentials();
  const credentials = deduplicateCredentials([
    ...userCredentials,
    ...installationCredentials,
  ]);
  if (credentials.length === 0) {
    throw new TimelineSyncError("github-credentials-missing");
  }
  return credentials;
};

const contributionConnections = [
  {
    connection: "issueContributions",
    cursor: "issueCursor",
    include: "includeIssues",
  },
  {
    connection: "pullRequestContributions",
    cursor: "pullRequestCursor",
    include: "includePullRequests",
  },
  {
    connection: "pullRequestReviewContributions",
    cursor: "reviewCursor",
    include: "includeReviews",
  },
  {
    connection: "repositoryContributions",
    cursor: "repositoryCursor",
    include: "includeRepositories",
  },
] as const;

type ContributionConnection = (typeof contributionConnections)[number];

interface ContributionPage {
  endCursor: string | null;
  hasNextPage: boolean;
  nodes: unknown[];
}

const contributionCollectionFromResponse = (payload: unknown) => {
  if (
    !isObject(payload) ||
    !isObject(payload.data) ||
    !isObject(payload.data.user) ||
    !isObject(payload.data.user.contributionsCollection)
  ) {
    return null;
  }
  return payload.data.user.contributionsCollection;
};

const contributionPageFrom = (
  collection: Record<string, unknown>,
  connection: ContributionConnection["connection"]
): ContributionPage | null => {
  const value = collection[connection];
  if (
    !isObject(value) ||
    !Array.isArray(value.nodes) ||
    !isObject(value.pageInfo) ||
    typeof value.pageInfo.hasNextPage !== "boolean"
  ) {
    return null;
  }
  const { endCursor, hasNextPage } = value.pageInfo;
  if (endCursor !== null && typeof endCursor !== "string") {
    return null;
  }
  return {
    endCursor,
    hasNextPage,
    nodes: value.nodes,
  };
};

const fetchContributionPage = async (
  credential: GitHubCredential,
  slice: DateSlice,
  activeConnections: ReadonlySet<ContributionConnection["connection"]>,
  cursors: ReadonlyMap<ContributionConnection["connection"], string | null>,
  includeCommits: boolean
) => {
  const variables: Record<string, boolean | string | null> = {
    from: `${slice.start}T00:00:00Z`,
    includeCommits,
    login: GITHUB_LOGIN,
    to: `${slice.end}T23:59:59Z`,
  };
  for (const configuration of contributionConnections) {
    variables[configuration.include] = activeConnections.has(
      configuration.connection
    );
    variables[configuration.cursor] =
      cursors.get(configuration.connection) ?? null;
  }

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    body: JSON.stringify({
      query: contributionQuery,
      variables,
    }),
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${credential.token}`,
      "Content-Type": "application/json",
      "User-Agent": "f0rr0.dev-timeline",
    },
    method: "POST",
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new TimelineSyncError(`github-graphql-http-${response.status}`);
  }

  const payload: unknown = await response.json();
  if (isObject(payload) && Array.isArray(payload.errors)) {
    writeSyncDiagnostic({
      errors: payload.errors.map((error) =>
        isObject(error)
          ? {
              path: Array.isArray(error.path)
                ? error.path.filter(
                    (value): value is number | string =>
                      typeof value === "number" || typeof value === "string"
                  )
                : null,
              type: typeof error.type === "string" ? error.type : null,
            }
          : null
      ),
      phase: "graphql-response",
      slice,
    });
  }
  return payload;
};

const allContributionConnections = new Set(
  contributionConnections.map(({ connection }) => connection)
);

const fetchContributionSlice = async (
  credential: GitHubCredential,
  slice: DateSlice
) => {
  const cursors = new Map<
    ContributionConnection["connection"],
    string | null
  >();
  let activeConnections = allContributionConnections;
  const payload = await fetchContributionPage(
    credential,
    slice,
    activeConnections,
    cursors,
    true
  );
  const mergedCollection = contributionCollectionFromResponse(payload);
  if (mergedCollection === null) {
    return payload;
  }

  for (let pageNumber = 1; pageNumber < GITHUB_MAX_PAGES; pageNumber += 1) {
    const nextConnections = new Set<ContributionConnection["connection"]>();
    for (const configuration of contributionConnections) {
      if (!activeConnections.has(configuration.connection)) {
        continue;
      }
      const page = contributionPageFrom(
        mergedCollection,
        configuration.connection
      );
      if (page?.hasNextPage !== true) {
        continue;
      }
      if (page.endCursor === null || page.endCursor.length === 0) {
        return payload;
      }
      cursors.set(configuration.connection, page.endCursor);
      nextConnections.add(configuration.connection);
    }
    if (nextConnections.size === 0) {
      return payload;
    }

    let nextPayload: unknown;
    try {
      nextPayload = await fetchContributionPage(
        credential,
        slice,
        nextConnections,
        cursors,
        false
      );
    } catch {
      return payload;
    }
    const nextCollection = contributionCollectionFromResponse(nextPayload);
    if (nextCollection === null) {
      return payload;
    }
    for (const configuration of contributionConnections) {
      if (!nextConnections.has(configuration.connection)) {
        continue;
      }
      const mergedConnection = mergedCollection[configuration.connection];
      const nextConnection = nextCollection[configuration.connection];
      const nextPage = contributionPageFrom(
        nextCollection,
        configuration.connection
      );
      if (
        !isObject(mergedConnection) ||
        !Array.isArray(mergedConnection.nodes) ||
        !isObject(nextConnection) ||
        nextPage === null
      ) {
        return payload;
      }
      mergedConnection.nodes.push(...nextPage.nodes);
      mergedConnection.pageInfo = nextConnection.pageInfo;
    }
    activeConnections = nextConnections;
  }

  return payload;
};

const createCollectionAccumulator = (): CollectionAccumulator => ({
  coverage: "complete",
  failedRequests: 0,
  privateRecordsSkipped: 0,
  publicEventCoverage: "unavailable",
  publicEvents: new Map(),
  records: new Map(),
  successfulRequests: 0,
});

const mergeRecord = (
  records: Map<string, TimelineActivityDayRecord>,
  record: TimelineActivityDayRecord
) => {
  const existing = records.get(record.id);
  records.set(record.id, {
    ...record,
    commitCount: Math.max(existing?.commitCount ?? 0, record.commitCount),
    reachedDefaultBranch:
      record.reachedDefaultBranch || (existing?.reachedDefaultBranch ?? false),
  });
};

const mergeNormalizedSlice = (
  accumulator: CollectionAccumulator,
  normalized: NonNullable<ReturnType<typeof normalizeGitHubContributionSlice>>
) => {
  accumulator.successfulRequests += 1;
  accumulator.privateRecordsSkipped += normalized.privateRecordsSkipped;
  if (normalized.coverage === "partial") {
    accumulator.coverage = "partial";
  }
  if (normalized.publicEventCoverage !== "unavailable") {
    accumulator.publicEventCoverage =
      normalized.publicEventCoverage === "partial" ||
      accumulator.publicEventCoverage === "partial"
        ? "partial"
        : "complete";
  }
  for (const event of normalized.publicEvents) {
    accumulator.publicEvents.set(event.id, event);
  }
  for (const record of normalized.records) {
    mergeRecord(accumulator.records, record);
  }
};

const markCollectionFailure = (accumulator: CollectionAccumulator) => {
  accumulator.coverage = "partial";
  accumulator.failedRequests += 1;
};

const isFatalGitHubError = (error: unknown) =>
  error instanceof TimelineSyncError &&
  (error.code === "github-rate-limit-exhausted" ||
    error.code === "github-rest-http-401" ||
    error.code === "github-rest-http-403");

const finishCollection = (
  accumulator: CollectionAccumulator
): CollectionResult => ({
  coverage: accumulator.coverage,
  failedRequests: accumulator.failedRequests,
  privateRecordsSkipped: accumulator.privateRecordsSkipped,
  publicEventCoverage: accumulator.publicEventCoverage,
  publicEvents: [...accumulator.publicEvents.values()],
  records: [...accumulator.records.values()],
  successfulRequests: accumulator.successfulRequests,
});

const collectProfileContributions = async (
  credential: GitHubCredential,
  slices: readonly DateSlice[],
  context: NormalizationContext
): Promise<CollectionResult> => {
  const accumulator = createCollectionAccumulator();
  for (const slice of slices) {
    try {
      const payload = await fetchContributionSlice(credential, slice);
      const normalized = normalizeGitHubContributionSlice(payload, {
        ...context,
        windowEnd: slice.end,
        windowStart: slice.start,
      });
      if (normalized === null) {
        writeSyncDiagnostic({ phase: "profile-normalization", slice });
        markCollectionFailure(accumulator);
      } else {
        if (normalized.coverage === "partial") {
          writeSyncDiagnostic({
            eventCoverage: normalized.publicEventCoverage,
            phase: "profile-coverage",
            repositoriesSeen: normalized.repositoriesSeen,
            slice,
          });
        }
        mergeNormalizedSlice(accumulator, normalized);
      }
    } catch (error) {
      writeSyncDiagnostic({
        code: error instanceof TimelineSyncError ? error.code : "unexpected",
        phase: "profile-request",
        slice,
      });
      markCollectionFailure(accumulator);
      accumulator.publicEventCoverage = "partial";
    }
  }
  return finishCollection(accumulator);
};

const retryDelayFrom = (response: Response, attempt: number) => {
  if (attempt >= GITHUB_MAX_RETRIES) {
    return null;
  }

  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
  }

  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    return Number.isFinite(reset)
      ? Math.max(0, reset * 1000 - Date.now())
      : null;
  }

  return response.status === 429 || response.status >= 500
    ? 250 * 2 ** attempt
    : null;
};

const createRequestPacer = () => {
  let nextRequestAt = 0;
  return async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) {
      await delay(wait);
    }
    nextRequestAt = Date.now() + GITHUB_REST_INTERVAL_MS;
  };
};

const fetchRestResponse = async (
  token: string,
  url: string,
  benignStatuses: ReadonlySet<number>,
  pace: () => Promise<void>
) => {
  for (let attempt = 0; attempt <= GITHUB_MAX_RETRIES; attempt += 1) {
    await pace();
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "f0rr0.dev-timeline",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (response.ok || benignStatuses.has(response.status)) {
      return response;
    }

    const retryDelay = retryDelayFrom(response, attempt);
    if (retryDelay === null) {
      throw new TimelineSyncError(`github-rest-http-${response.status}`);
    }
    if (retryDelay > GITHUB_MAX_RETRY_DELAY_MS) {
      throw new TimelineSyncError("github-rate-limit-exhausted");
    }
    await delay(retryDelay);
  }
  throw new TimelineSyncError("github-rest-unavailable");
};

const nextLinkFrom = (header: string | null) => {
  if (header === null) {
    return null;
  }
  for (const link of header.split(",")) {
    const match = /<([^>]+)>;\s*rel="([^"]+)"/.exec(link.trim());
    if (match?.[2] !== "next") {
      continue;
    }
    const url = new URL(match[1]);
    if (
      url.origin !== GITHUB_API_URL ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new TimelineSyncError("github-pagination-invalid");
    }
    return url.toString();
  }
  return null;
};

const createGitHubRestClient = (token: string): GitHubRestClient => {
  const pace = createRequestPacer();
  return async (url, benignStatuses = new Set()) => {
    const response = await fetchRestResponse(token, url, benignStatuses, pace);
    const payload = benignStatuses.has(response.status)
      ? null
      : ((await response.json()) as unknown);
    return {
      nextUrl: nextLinkFrom(response.headers.get("link")),
      payload,
      status: response.status,
    };
  };
};

const visitPaginatedItems = async (
  client: GitHubRestClient,
  initialUrl: string,
  itemsFrom: (payload: unknown) => unknown[] | null,
  visit: (items: readonly unknown[]) => Promise<void> | void,
  benignStatuses: ReadonlySet<number> = new Set()
): Promise<PaginatedVisitResult> => {
  const visited = new Set<string>();
  let nextUrl: string | null = initialUrl;
  let pages = 0;
  let status = 200;

  while (nextUrl !== null && pages < GITHUB_MAX_PAGES) {
    if (visited.has(nextUrl)) {
      throw new TimelineSyncError("github-pagination-cycle");
    }
    visited.add(nextUrl);
    const page = await client(nextUrl, benignStatuses);
    const { nextUrl: followingUrl, payload, status: pageStatus } = page;
    pages += 1;
    status = pageStatus;
    if (benignStatuses.has(status)) {
      return { pages, status };
    }
    const items = itemsFrom(payload);
    if (items === null) {
      throw new TimelineSyncError("github-rest-payload-invalid");
    }
    await visit(items);
    nextUrl = followingUrl;
  }

  if (nextUrl !== null) {
    throw new TimelineSyncError("github-pagination-limit");
  }
  return { pages, status };
};

const repositoryItemsFrom = (payload: unknown) =>
  isObject(payload) && Array.isArray(payload.repositories)
    ? payload.repositories
    : null;

const commitItemsFrom = (payload: unknown) =>
  Array.isArray(payload) ? payload : null;

const normalizedRepositoryApiUrl = (value: unknown, nameWithOwner: string) => {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    const expectedPath = `/repos/${nameWithOwner}`.toLocaleLowerCase("en-US");
    return url.origin === GITHUB_API_URL &&
      url.pathname.toLocaleLowerCase("en-US") === expectedPath &&
      url.search.length === 0 &&
      url.hash.length === 0
      ? url.toString().replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
};

const restRepositoryFrom = (value: unknown): RestRepository | null => {
  if (!isObject(value)) {
    return null;
  }
  const id =
    typeof value.node_id === "string"
      ? value.node_id
      : typeof value.id === "number" && Number.isSafeInteger(value.id)
        ? String(value.id)
        : null;
  const nameWithOwner =
    typeof value.full_name === "string" ? value.full_name : null;
  if (
    id === null ||
    id.length === 0 ||
    id.length > 200 ||
    nameWithOwner === null ||
    !/^(?:[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/[a-z\d._-]{1,100}$/i.test(
      nameWithOwner
    ) ||
    typeof value.private !== "boolean" ||
    typeof value.html_url !== "string"
  ) {
    return null;
  }
  const apiUrl = normalizedRepositoryApiUrl(value.url, nameWithOwner);
  if (apiUrl === null) {
    return null;
  }

  return {
    apiUrl,
    defaultBranch:
      typeof value.default_branch === "string" &&
      value.default_branch.length > 0 &&
      value.default_branch.length <= 255
        ? value.default_branch
        : null,
    description:
      typeof value.description === "string" ? value.description : null,
    htmlUrl: value.html_url,
    id,
    isPrivate: value.private,
    language: typeof value.language === "string" ? value.language : null,
    nameWithOwner,
    topics: Array.isArray(value.topics)
      ? value.topics
          .filter((topic): topic is string => typeof topic === "string")
          .slice(0, 10)
      : [],
  };
};

const normalizedCommitDay = (
  value: unknown,
  windowStart: string,
  windowEnd: string
) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const day = parsed.toISOString().slice(0, 10);
  return day >= windowStart && day <= windowEnd ? day : null;
};

const commitObservationFrom = (
  value: unknown,
  repositoryId: string,
  reachedDefaultBranch: boolean,
  windowStart: string,
  windowEnd: string
) => {
  if (!isObject(value) || !isObject(value.commit)) {
    return null;
  }
  const rawSha = value.sha;
  if (typeof rawSha !== "string" || !/^[a-f\d]{40,64}$/i.test(rawSha)) {
    return null;
  }
  const authorDate = isObject(value.commit.author)
    ? value.commit.author.date
    : null;
  const committerDate = isObject(value.commit.committer)
    ? value.commit.committer.date
    : null;
  const day =
    normalizedCommitDay(authorDate, windowStart, windowEnd) ??
    normalizedCommitDay(committerDate, windowStart, windowEnd);
  if (day === null) {
    return null;
  }
  return {
    key: createHash("sha256")
      .update(repositoryId)
      .update("\0")
      .update(rawSha)
      .digest("hex"),
    observation: { day, reachedDefaultBranch } satisfies CommitObservation,
  };
};

const mergeCommitItems = (
  commitByKey: Map<string, CommitObservation>,
  items: readonly unknown[],
  repositoryId: string,
  reachedDefaultBranch: boolean,
  windowStart: string,
  windowEnd: string
) => {
  let invalidItems = 0;
  for (const item of items) {
    const parsed = commitObservationFrom(
      item,
      repositoryId,
      reachedDefaultBranch,
      windowStart,
      windowEnd
    );
    if (parsed === null) {
      invalidItems += 1;
      continue;
    }
    const existing = commitByKey.get(parsed.key);
    commitByKey.set(parsed.key, {
      day: parsed.observation.day,
      reachedDefaultBranch:
        parsed.observation.reachedDefaultBranch ||
        (existing?.reachedDefaultBranch ?? false),
    });
  }
  return invalidItems;
};

const commitUrlFor = (
  repository: RestRepository,
  branch: string | null,
  windowStart: string,
  windowEnd: string
) => {
  const url = new URL(`${repository.apiUrl}/commits`);
  url.searchParams.set("author", GITHUB_LOGIN);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("since", `${windowStart}T00:00:00Z`);
  url.searchParams.set("until", `${windowEnd}T23:59:59Z`);
  if (branch !== null) {
    url.searchParams.set("sha", branch);
  }
  return url.toString();
};

const dailyNodesFrom = (
  commitByKey: ReadonlyMap<string, CommitObservation>
) => {
  const byDay = new Map<
    string,
    { commitCount: number; reachedDefaultBranch: boolean }
  >();
  for (const observation of commitByKey.values()) {
    const current = byDay.get(observation.day);
    byDay.set(observation.day, {
      commitCount: (current?.commitCount ?? 0) + 1,
      reachedDefaultBranch:
        observation.reachedDefaultBranch ||
        (current?.reachedDefaultBranch ?? false),
    });
  }
  return [...byDay.entries()].map(([day, summary]) => ({
    commitCount: summary.commitCount,
    occurredAt: `${day}T00:00:00Z`,
    reachedDefaultBranch: summary.reachedDefaultBranch,
  }));
};

const normalizeRestRepositoryActivity = (
  repository: RestRepository,
  commitByKey: ReadonlyMap<string, CommitObservation>,
  context: NormalizationContext,
  windowStart: string,
  windowEnd: string
) =>
  normalizeGitHubContributionSlice(
    {
      data: {
        user: {
          contributionsCollection: {
            commitContributionsByRepository: [
              {
                contributions: { nodes: dailyNodesFrom(commitByKey) },
                repository: {
                  description: repository.isPrivate
                    ? null
                    : repository.description,
                  id: repository.id,
                  isPrivate: repository.isPrivate,
                  nameWithOwner: repository.nameWithOwner,
                  primaryLanguage:
                    repository.isPrivate || repository.language === null
                      ? null
                      : { name: repository.language },
                  repositoryTopics: {
                    nodes: repository.isPrivate
                      ? []
                      : repository.topics.map((name) => ({
                          topic: { name },
                        })),
                  },
                  url: repository.htmlUrl,
                },
              },
            ],
          },
        },
      },
    },
    { ...context, windowEnd, windowStart }
  );

const collectRepositoryRef = async (
  client: GitHubRestClient,
  repository: RestRepository,
  branch: string | null,
  reachedDefaultBranch: boolean,
  optional: boolean,
  commitByKey: Map<string, CommitObservation>,
  windowStart: string,
  windowEnd: string
) => {
  let invalidItems = 0;
  const result = await visitPaginatedItems(
    client,
    commitUrlFor(repository, branch, windowStart, windowEnd),
    commitItemsFrom,
    (items) => {
      invalidItems += mergeCommitItems(
        commitByKey,
        items,
        repository.id,
        reachedDefaultBranch,
        windowStart,
        windowEnd
      );
    },
    new Set(optional ? [404, 409] : [409])
  );
  return { invalidItems, requests: result.pages };
};

const collectRepositoryActivity = async (
  client: GitHubRestClient,
  repository: RestRepository,
  context: NormalizationContext,
  windowStart: string,
  windowEnd: string
): Promise<RepositoryCollectionResult> => {
  if (repository.isPrivate && context.privacyKey === null) {
    return {
      coverage: "complete",
      failedRequests: 0,
      normalized: {
        coverage: "complete",
        privateRecordsSkipped: 1,
        publicEventCoverage: "unavailable",
        publicEvents: [],
        records: [],
        repositoriesSeen: 1,
      },
      successfulRequests: 0,
    };
  }

  const commitByKey = new Map<string, CommitObservation>();
  let coverage: "complete" | "partial" = "complete";
  let failedRequests = 0;
  let successfulRequests = 0;
  const refs = [
    {
      branch: repository.defaultBranch,
      optional: false,
      reachedDefaultBranch: true,
    },
    ...(repository.defaultBranch === "gh-pages"
      ? []
      : [
          {
            branch: "gh-pages",
            optional: true,
            reachedDefaultBranch: false,
          },
        ]),
  ];

  for (const ref of refs) {
    try {
      const result = await collectRepositoryRef(
        client,
        repository,
        ref.branch,
        ref.reachedDefaultBranch,
        ref.optional,
        commitByKey,
        windowStart,
        windowEnd
      );
      successfulRequests += result.requests;
      if (result.invalidItems > 0) {
        coverage = "partial";
        failedRequests += 1;
      }
    } catch (error) {
      writeSyncDiagnostic({
        code: error instanceof TimelineSyncError ? error.code : "unexpected",
        phase: "repository-ref",
        private: repository.isPrivate,
        ref: ref.reachedDefaultBranch ? "default" : "auxiliary",
      });
      if (isFatalGitHubError(error)) {
        throw error;
      }
      coverage = "partial";
      failedRequests += 1;
    }
  }

  return {
    coverage,
    failedRequests,
    normalized: normalizeRestRepositoryActivity(
      repository,
      commitByKey,
      context,
      windowStart,
      windowEnd
    ),
    successfulRequests,
  };
};

const absorbRepositoryResult = (
  accumulator: CollectionAccumulator,
  result: RepositoryCollectionResult
) => {
  accumulator.successfulRequests += result.successfulRequests;
  accumulator.failedRequests += result.failedRequests;
  if (result.coverage === "partial") {
    accumulator.coverage = "partial";
  }
  if (result.normalized === null) {
    markCollectionFailure(accumulator);
    return;
  }
  accumulator.privateRecordsSkipped += result.normalized.privateRecordsSkipped;
  if (result.normalized.publicEventCoverage !== "unavailable") {
    accumulator.publicEventCoverage = result.normalized.publicEventCoverage;
  }
  for (const event of result.normalized.publicEvents) {
    accumulator.publicEvents.set(event.id, event);
  }
  for (const record of result.normalized.records) {
    mergeRecord(accumulator.records, record);
  }
};

const collectInstallationContributions = async (
  credential: GitHubInstallationCredential,
  context: NormalizationContext,
  windowStart: string,
  windowEnd: string
): Promise<CollectionResult> => {
  const accumulator = createCollectionAccumulator();
  const client = createGitHubRestClient(credential.token);
  const url = new URL("/installation/repositories", GITHUB_API_URL);
  url.searchParams.set("per_page", "100");

  const inventory = await visitPaginatedItems(
    client,
    url.toString(),
    repositoryItemsFrom,
    async (items) => {
      for (const item of items) {
        const repository = restRepositoryFrom(item);
        if (repository === null) {
          writeSyncDiagnostic({ phase: "repository-normalization" });
          markCollectionFailure(accumulator);
          continue;
        }
        const result = await collectRepositoryActivity(
          client,
          repository,
          context,
          windowStart,
          windowEnd
        );
        absorbRepositoryResult(accumulator, result);
      }
    }
  );
  accumulator.successfulRequests += inventory.pages;
  return finishCollection(accumulator);
};

const mergeCollection = (
  accumulator: CollectionAccumulator,
  result: CollectionResult
) => {
  accumulator.successfulRequests += result.successfulRequests;
  accumulator.failedRequests += result.failedRequests;
  accumulator.privateRecordsSkipped += result.privateRecordsSkipped;
  if (result.publicEventCoverage !== "unavailable") {
    accumulator.publicEventCoverage =
      result.publicEventCoverage === "partial" ||
      accumulator.publicEventCoverage === "partial"
        ? "partial"
        : "complete";
  }
  for (const event of result.publicEvents) {
    accumulator.publicEvents.set(event.id, event);
  }
  if (result.coverage === "partial") {
    accumulator.coverage = "partial";
  }
  for (const record of result.records) {
    mergeRecord(accumulator.records, record);
  }
};

const collectTimelineActivity = async (
  credentials: readonly GitHubCredential[],
  slices: readonly DateSlice[],
  context: NormalizationContext,
  windowStart: string,
  windowEnd: string
) => {
  const accumulator = createCollectionAccumulator();
  for (const credential of credentials) {
    try {
      const profileResult = await collectProfileContributions(
        credential,
        slices,
        context
      );
      mergeCollection(accumulator, profileResult);

      if (credential.kind === "installation") {
        const repositoryResult = await collectInstallationContributions(
          credential,
          context,
          windowStart,
          windowEnd
        );
        mergeCollection(accumulator, repositoryResult);
      }
    } catch (error) {
      writeSyncDiagnostic({
        code: error instanceof TimelineSyncError ? error.code : "unexpected",
        kind: credential.kind,
        phase: "credential-collection",
      });
      markCollectionFailure(accumulator);
    }
  }

  const result = finishCollection(accumulator);
  if (result.successfulRequests === 0) {
    throw new TimelineSyncError("github-activity-unavailable");
  }
  return result;
};

const createSyncPlan = async (options: {
  forceBackfill?: boolean;
  kind?: TimelineSyncKind;
  now?: Date;
}): Promise<SyncPlan> => {
  const day = startOfUtcDay(options.now ?? new Date());
  const storedCount = await countStoredTimelineActivity(GITHUB_LOGIN);
  const lastSync = await readLastCompletedTimelineSync();
  const scheduledWeeklyReconciliation =
    options.kind !== "webhook" && day.getUTCDay() === 0;
  const useFullWindow =
    options.forceBackfill === true ||
    storedCount === 0 ||
    lastSync === null ||
    scheduledWeeklyReconciliation;
  const kind = options.kind ?? (useFullWindow ? "backfill" : "incremental");
  const lookbackDays = useFullWindow
    ? TIMELINE_WINDOW_DAYS
    : INCREMENTAL_LOOKBACK_DAYS;
  const windowStartDate = addUtcDays(day, -(lookbackDays - 1));
  return {
    day,
    kind,
    useFullWindow,
    windowEnd: dateOnly(day),
    windowStart: dateOnly(windowStartDate),
    windowStartDate,
  };
};

const collectAnonymousContributionTotals = async (
  plan: SyncPlan
): Promise<AnonymousContributionCollection> => {
  const windowStart = dateOnly(
    addUtcDays(plan.day, -(TIMELINE_WINDOW_DAYS - 1))
  );
  try {
    const days = await fetchPublicGitHubContributionDays({
      login: GITHUB_LOGIN,
      windowEnd: plan.windowEnd,
      windowStart,
    });
    return {
      coverage: "complete",
      records: days.map(({ contributionCount, day }) => ({
        contributionCount,
        day,
        id: createHash("sha256")
          .update(`github-public-calendar:${GITHUB_LOGIN}:${day}`)
          .digest("hex"),
        source: "github-public-calendar",
        subject: GITHUB_LOGIN,
      })),
    };
  } catch {
    writeSyncDiagnostic({ phase: "anonymous-contribution-calendar" });
    return { coverage: "unavailable", records: [] };
  }
};

const removeStaleActivity = async (
  records: readonly TimelineActivityDayRecord[],
  privacyKey: string | null,
  plan: SyncPlan
) => {
  const existing = await readTimelineActivityDays(
    GITHUB_LOGIN,
    plan.windowStart,
    plan.windowEnd
  );
  const currentIds = new Set(records.map((record) => record.id));
  const staleIds = existing.flatMap((record) => {
    if (record.source !== "github-profile" || currentIds.has(record.id)) {
      return [];
    }
    if (record.visibility === "private" && privacyKey === null) {
      return [];
    }
    return [record.id];
  });
  await deleteTimelineActivityByIds(staleIds);
};

const removeStalePublicEvents = async (
  records: readonly TimelinePublicEventRecord[],
  windowStart: string,
  windowEnd: string
) => {
  const existing = await readTimelinePublicEvents(
    GITHUB_LOGIN,
    windowStart,
    windowEnd
  );
  const currentIds = new Set(records.map((record) => record.id));
  const staleIds = existing.flatMap((record) =>
    record.source === "github-profile" && !currentIds.has(record.id)
      ? [record.id]
      : []
  );
  await deleteTimelinePublicEventsByIds(staleIds);
  return staleIds.length;
};

const persistCollection = async (
  collection: CollectionResult,
  anonymousCollection: AnonymousContributionCollection,
  privacyKey: string | null,
  plan: SyncPlan,
  runId: string
) => {
  await Promise.all([
    upsertTimelineActivityDays(collection.records),
    upsertTimelineContributionTotals(anonymousCollection.records),
    upsertTimelinePublicEvents(collection.publicEvents),
  ]);
  if (collection.failedRequests === 0 && collection.coverage === "complete") {
    await removeStaleActivity(collection.records, privacyKey, plan);
  }
  const retentionCutoff = dateOnly(addUtcDays(plan.day, -RETENTION_DAYS));
  // A permission-bound partial event view is still reconciled fail-closed:
  // inaccessible identities are omitted rather than retained from an older run.
  if (collection.publicEventCoverage !== "unavailable") {
    const staleEventCount = await removeStalePublicEvents(
      collection.publicEvents,
      dateOnly(addUtcDays(plan.day, -(TIMELINE_WINDOW_DAYS - 1))),
      plan.windowEnd
    );
    if (staleEventCount > 0) {
      await rejectPublishedTimelineEditions();
    }
  }
  await Promise.all([
    pruneTimelineActivityBefore(GITHUB_LOGIN, retentionCutoff),
    pruneTimelineContributionTotalsBefore(GITHUB_LOGIN, retentionCutoff),
    pruneTimelinePublicEventsBefore(GITHUB_LOGIN, retentionCutoff),
  ]);
  await completeTimelineSyncRun(
    runId,
    collection.records.length,
    collection.publicEvents.length,
    collection.publicEventCoverage,
    anonymousCollection.records.length,
    anonymousCollection.coverage,
    collection.coverage
  );
};

const safeErrorCode = (error: unknown) => {
  if (error instanceof TimelineSyncError) {
    return error.code;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "github-timeout";
  }
  return "timeline-sync-failed";
};

const executeTimelineSync = async (plan: SyncPlan, runId: string) => {
  const credentials = await readGitHubCredentials();
  const privacyKey = normalizeTimelinePrivacyKey(
    process.env.TIMELINE_PRIVACY_KEY
  );
  const context: NormalizationContext = {
    privacyKey,
    subject: GITHUB_LOGIN,
    taxonomy: parsePrivateTimelineTaxonomy(
      process.env.TIMELINE_PRIVATE_TAXONOMY
    ),
  };
  const [collection, anonymousCollection] = await Promise.all([
    collectTimelineActivity(
      credentials,
      createMonthlySlices(
        addUtcDays(plan.day, -(TIMELINE_WINDOW_DAYS - 1)),
        plan.day
      ),
      context,
      plan.windowStart,
      plan.windowEnd
    ),
    collectAnonymousContributionTotals(plan),
  ]);
  await persistCollection(
    collection,
    anonymousCollection,
    privacyKey,
    plan,
    runId
  );

  return {
    anonymousCoverage: anonymousCollection.coverage,
    anonymousDays: anonymousCollection.records.length,
    coverage: collection.coverage,
    events: collection.publicEvents.length,
    kind: plan.kind,
    privateActivity:
      privacyKey === null || collection.privateRecordsSkipped > 0
        ? ("skipped" as const)
        : ("included" as const),
    rows: collection.records.length,
    windowEnd: plan.windowEnd,
    windowStart: plan.windowStart,
  };
};

export const syncGitHubTimeline = async (
  options: {
    forceBackfill?: boolean;
    kind?: TimelineSyncKind;
    now?: Date;
  } = {}
): Promise<TimelineSyncResult> => {
  if (!isTimelineDatabaseConfigured()) {
    throw new TimelineSyncError("timeline-database-missing");
  }

  const plan = await createSyncPlan(options);
  const runId = await beginTimelineSyncRun({
    fullWindow: plan.useFullWindow,
    kind: plan.kind,
    windowEnd: plan.windowEnd,
    windowStart: plan.windowStart,
  });

  try {
    return await executeTimelineSync(plan, runId);
  } catch (error) {
    await failTimelineSyncRun(runId, safeErrorCode(error));
    if (error instanceof TimelineSyncError) {
      throw error;
    }
    throw new TimelineSyncError(safeErrorCode(error));
  }
};
