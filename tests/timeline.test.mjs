import { describe, expect, test } from "bun:test";

import {
  containsPrivateIdentifier,
  createTimelineEdition,
  editionMatchesTimelinePrivacyPolicy,
  validateTimelinePlanAgainstDigest,
} from "../src/lib/timeline-core.ts";
import {
  calculateAnonymousContributionDays,
  createTimelineActivityDigest,
} from "../src/lib/timeline-editorial.ts";
import { createFallbackTimelineEdition } from "../src/lib/timeline-fallback.ts";
import {
  normalizeGitHubContributionSlice,
  normalizeTimelinePrivacyKey,
  parsePrivateTimelineTaxonomy,
  privateTimelineRepoKey,
  publicTimelineRepoKey,
} from "../src/lib/timeline-privacy.ts";
import { timelineRevocationFromWebhook } from "../src/lib/timeline-webhook.ts";

const privacyKey = "0123456789abcdefFEDCBA9876543210timeline-safety-key";
const windowStart = "2025-07-09";
const windowEnd = "2026-08-12";

const repositoryGroup = ({
  commitCount = 4,
  day = "2026-08-01T12:00:00Z",
  id,
  isPrivate,
  nameWithOwner,
  reachedDefaultBranch,
}) => ({
  contributions: {
    nodes: [
      {
        commitCount,
        occurredAt: day,
        ...(reachedDefaultBranch === undefined ? {} : { reachedDefaultBranch }),
      },
    ],
  },
  repository: {
    description: isPrivate === true ? "Secret client roadmap" : "A public tool",
    id,
    isPrivate,
    nameWithOwner,
    primaryLanguage: { name: "TypeScript" },
    repositoryTopics: {
      nodes: [{ topic: { name: isPrivate === true ? "secret" : "tooling" } }],
    },
    url: `https://github.com/${nameWithOwner}`,
  },
});

const emptyConnection = () => ({
  nodes: [],
  pageInfo: { hasNextPage: false },
});

const contributionPayload = (groups, connections = {}) => ({
  data: {
    user: {
      contributionsCollection: {
        commitContributionsByRepository: groups,
        ...connections,
      },
    },
  },
});

const normalizeOptions = (overrides = {}) => ({
  privacyKey,
  subject: "f0rr0",
  taxonomy: parsePrivateTimelineTaxonomy(
    JSON.stringify({
      "secret-org/stealth-client": {
        bucket: "Applied AI",
        domain: "Product",
      },
    })
  ),
  windowEnd,
  windowStart,
  ...overrides,
});

const storedRow = (overrides = {}) => ({
  bucket: "Private product work",
  commitCount: 6,
  day: "2026-07-02",
  id: "a".repeat(64),
  languageFamily: "withheld",
  privacyDomainKey: "domain-a",
  privacyPolicyVersion: "policy",
  publicRepoName: null,
  publicRepoUrl: null,
  reachedDefaultBranch: true,
  repoKey: "repo-a",
  source: "github-profile",
  subject: "f0rr0",
  updatedAt: new Date("2026-08-12T00:00:00Z"),
  visibility: "private",
  ...overrides,
});

const activityCluster = (index, overrides = {}) => {
  const date = `2026-0${index + 1}-0${index + 1}`;
  return {
    bucket: "Open source",
    cadence: "clustered",
    endDate: date,
    facts: ["Several public changes landed together."],
    key: `public:source-${index}`,
    kind: "commit-run",
    magnitude: "steady",
    maxImportance: index === 0 ? "lead" : index < 2 ? "story" : "brief",
    publicHref: `https://github.com/f0rr0/project-${index}`,
    publicLabel: "View project",
    publicTitle: `project-${index}`,
    publishable: true,
    rollupOf: [],
    seriesKey: `series:project-${index}`,
    startDate: date,
    visibility: "public",
    ...overrides,
  };
};

const digest = {
  clusters: [
    activityCluster(0),
    activityCluster(1),
    activityCluster(2),
    activityCluster(3),
    activityCluster(4),
    activityCluster(5, {
      bucket: "Private product work",
      endDate: "2026-07-01",
      facts: ["A broad private work pattern was sustained."],
      key: "private:source-six",
      kind: "private-month",
      magnitude: "sustained",
      maxImportance: "story",
      publicHref: undefined,
      publicLabel: undefined,
      publicTitle: undefined,
      seriesKey: "private-series:general-work",
      startDate: "2026-07-01",
      visibility: "private",
    }),
  ],
  coverage: "complete",
  generatedAt: "2026-08-12T00:00:00.000Z",
  windowEnd,
  windowStart,
};

const candidatePlan = {
  selections: digest.clusters.map((cluster, index) => ({
    importance:
      index === 0 ? "lead" : index === 1 || index === 5 ? "story" : "brief",
    sourceKey: cluster.key,
  })),
  windowEnd,
  windowStart,
};

const storedPublicEvent = (overrides = {}) => ({
  bucket: "Open source",
  day: "2026-08-01",
  eventKind: "issue_opened",
  id: "e".repeat(64),
  publicRepoName: "upstream/public-tool",
  publicRepoUrl: "https://github.com/upstream/public-tool",
  publicTitle: "Document the edge case",
  publicUrl: "https://github.com/upstream/public-tool/issues/42",
  repoKey: "f".repeat(64),
  source: "github-profile",
  subject: "f0rr0",
  updatedAt: new Date("2026-08-12T00:00:00Z"),
  ...overrides,
});

const availableActivity = {
  activeDays: 24,
  from: "2025-08-13",
  restrictedContributions: null,
  status: "available",
  to: "2026-08-12",
  totalContributions: 72,
  weeks: Array.from({ length: 10 }, (_, index) => ({
    contributionCount: index + 2,
    level: 2,
    weekStart:
      index < 5
        ? `2025-${String(index + 8).padStart(2, "0")}-01`
        : `2026-${String(index - 4).padStart(2, "0")}-01`,
  })),
};

describe("timeline privacy boundary", () => {
  test("discards private identity before creating storage records", () => {
    const normalized = normalizeGitHubContributionSlice(
      contributionPayload([
        repositoryGroup({
          id: "R_private_secret_identifier",
          isPrivate: true,
          nameWithOwner: "secret-org/stealth-client",
        }),
        repositoryGroup({
          id: "R_public_identifier",
          isPrivate: false,
          nameWithOwner: "f0rr0/public-tool",
        }),
      ]),
      normalizeOptions()
    );

    expect(normalized).not.toBeNull();
    const privateRecord = normalized.records.find(
      (record) => record.visibility === "private"
    );
    expect(privateRecord).toMatchObject({
      bucket: "Applied AI",
      languageFamily: "withheld",
      publicRepoName: null,
      publicRepoUrl: null,
      visibility: "private",
    });
    expect(privateRecord.privacyPolicyVersion).toHaveLength(64);
    expect(JSON.stringify(privateRecord)).not.toContain("stealth-client");
    expect(JSON.stringify(privateRecord)).not.toContain(
      "R_private_secret_identifier"
    );
  });

  test("fails closed for private rows without a valid privacy key", () => {
    const normalized = normalizeGitHubContributionSlice(
      contributionPayload([
        repositoryGroup({
          id: "R_private",
          isPrivate: true,
          nameWithOwner: "secret-org/stealth-client",
        }),
      ]),
      normalizeOptions({ privacyKey: null })
    );

    expect(normalized.records).toEqual([]);
    expect(normalized.privateRecordsSkipped).toBe(1);
    expect(normalizeTimelinePrivacyKey("x".repeat(64))).toBeNull();
  });

  test("preserves an explicit non-default contribution branch marker", () => {
    const normalized = normalizeGitHubContributionSlice(
      contributionPayload([
        repositoryGroup({
          id: "R_public_gh_pages",
          isPrivate: false,
          nameWithOwner: "f0rr0/public-pages",
          reachedDefaultBranch: false,
        }),
      ]),
      normalizeOptions()
    );

    expect(normalized.records).toHaveLength(1);
    expect(normalized.records[0].reachedDefaultBranch).toBe(false);
  });

  test("keeps verified public issue and pull-request events as exact evidence", () => {
    const repository = {
      description: "A public infrastructure tool",
      id: "R_upstream_public_tool",
      isPrivate: false,
      nameWithOwner: "upstream/public-tool",
      primaryLanguage: { name: "Go" },
      repositoryTopics: { nodes: [{ topic: { name: "infrastructure" } }] },
      url: "https://github.com/upstream/public-tool",
    };
    const normalized = normalizeGitHubContributionSlice(
      contributionPayload([], {
        issueContributions: {
          nodes: [
            {
              isRestricted: false,
              issue: {
                id: "I_public_issue",
                repository,
                title: "Document the edge case",
                url: "https://github.com/upstream/public-tool/issues/42",
              },
              occurredAt: "2026-08-01T12:00:00Z",
            },
          ],
          pageInfo: { hasNextPage: false },
        },
        pullRequestContributions: {
          nodes: [
            {
              isRestricted: false,
              occurredAt: "2026-08-02T12:00:00Z",
              pullRequest: {
                id: "PR_public_change",
                repository,
                title: "Handle an empty response",
                url: "https://github.com/upstream/public-tool/pull/51",
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
        pullRequestReviewContributions: emptyConnection(),
        repositoryContributions: emptyConnection(),
      }),
      normalizeOptions()
    );

    expect(normalized.publicEventCoverage).toBe("complete");
    expect(normalized.publicEvents).toHaveLength(2);
    expect(normalized.publicEvents[0]).toMatchObject({
      eventKind: "issue_opened",
      publicRepoName: "upstream/public-tool",
      publicTitle: "Document the edge case",
      publicUrl: "https://github.com/upstream/public-tool/issues/42",
    });
    expect(normalized.publicEvents[1]).toMatchObject({
      eventKind: "pull_request_opened",
      publicTitle: "Handle an empty response",
      publicUrl: "https://github.com/upstream/public-tool/pull/51",
    });
  });

  test("keeps accessible public events when GitHub forbids individual nodes", () => {
    const repository = {
      description: "A public infrastructure tool",
      id: "R_upstream_public_tool",
      isPrivate: false,
      nameWithOwner: "upstream/public-tool",
      primaryLanguage: { name: "Go" },
      repositoryTopics: { nodes: [] },
      url: "https://github.com/upstream/public-tool",
    };
    const payload = contributionPayload([], {
      issueContributions: emptyConnection(),
      pullRequestContributions: {
        nodes: [
          null,
          {
            isRestricted: false,
            occurredAt: "2026-08-02T12:00:00Z",
            pullRequest: {
              id: "PR_accessible_change",
              repository,
              title: "Handle an empty response",
              url: "https://github.com/upstream/public-tool/pull/51",
            },
          },
        ],
        pageInfo: { hasNextPage: false },
      },
      pullRequestReviewContributions: emptyConnection(),
      repositoryContributions: emptyConnection(),
    });
    payload.errors = [
      {
        message: "intentionally ignored",
        path: [
          "user",
          "contributionsCollection",
          "pullRequestContributions",
          "nodes",
          0,
        ],
        type: "FORBIDDEN",
      },
    ];

    const normalized = normalizeGitHubContributionSlice(
      payload,
      normalizeOptions()
    );

    expect(normalized.coverage).toBe("complete");
    expect(normalized.publicEventCoverage).toBe("partial");
    expect(normalized.publicEvents).toHaveLength(1);
    expect(normalized.publicEvents[0].publicTitle).toBe(
      "Handle an empty response"
    );
    expect(JSON.stringify(normalized)).not.toContain("intentionally ignored");
  });

  test("drops all private and restricted event identity before storage", () => {
    const privateRepository = {
      description: "Secret roadmap",
      id: "R_private_event_repo",
      isPrivate: true,
      nameWithOwner: "secret-org/private-event-repo",
      url: "https://github.com/secret-org/private-event-repo",
    };
    const normalized = normalizeGitHubContributionSlice(
      contributionPayload([], {
        issueContributions: {
          nodes: [
            {
              isRestricted: false,
              issue: {
                id: "I_secret_123",
                repository: privateRepository,
                title: "Unannounced client launch",
                url: "https://github.com/secret-org/private-event-repo/issues/9",
              },
              occurredAt: "2026-08-01T12:00:00Z",
            },
          ],
          pageInfo: { hasNextPage: false },
        },
        pullRequestContributions: emptyConnection(),
        pullRequestReviewContributions: emptyConnection(),
        repositoryContributions: emptyConnection(),
      }),
      normalizeOptions()
    );
    const serialized = JSON.stringify(normalized);

    expect(normalized.publicEvents).toEqual([]);
    expect(serialized).not.toContain("private-event-repo");
    expect(serialized).not.toContain("Unannounced client launch");
    expect(serialized).not.toContain("I_secret_123");
  });

  test("canonicalizes approved domains and rejects ambiguous taxonomy", () => {
    const taxonomy = parsePrivateTimelineTaxonomy(
      JSON.stringify({
        "secret-org/stealth-client": {
          bucket: "Applied AI",
          domain: " Payments ",
        },
      })
    );
    expect(taxonomy.get("secret-org/stealth-client")?.domain).toBe("payments");
    expect(() =>
      parsePrivateTimelineTaxonomy(
        JSON.stringify({
          "secret-org/stealth-client": {
            bucket: "Applied AI",
            domain: "payments/internal",
          },
        })
      )
    ).toThrow("timeline-taxonomy-invalid");
    expect(() =>
      parsePrivateTimelineTaxonomy(
        JSON.stringify({
          "secret-org/stealth-client": { bucket: "Across the work" },
        })
      )
    ).toThrow("timeline-taxonomy-invalid");
  });

  test("normalizes Unicode before private-copy checks", () => {
    expect(containsPrivateIdentifier("Private work １２")).toBe(true);
    expect(containsPrivateIdentifier("secret／repository")).toBe(true);
    expect(containsPrivateIdentifier("A broad protected work pattern")).toBe(
      false
    );
  });

  test("collapses sparse hidden buckets into one monthly generic cluster", () => {
    const rows = [
      storedRow({
        bucket: "Applied AI",
        day: "2026-07-02",
        id: "a".repeat(64),
        repoKey: "private-repo-a",
      }),
      storedRow({
        bucket: "Applied AI",
        day: "2026-07-09",
        id: "b".repeat(64),
        repoKey: "private-repo-b",
      }),
      storedRow({
        bucket: "Infrastructure",
        day: "2026-07-16",
        id: "c".repeat(64),
        privacyDomainKey: "domain-b",
        repoKey: "private-repo-c",
      }),
      storedRow({
        bucket: "Infrastructure",
        day: "2026-07-23",
        id: "d".repeat(64),
        privacyDomainKey: "domain-b",
        repoKey: "private-repo-d",
      }),
    ];
    const result = createTimelineActivityDigest({
      coverage: "complete",
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows,
      windowEnd,
      windowStart,
    });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({
      bucket: "Private product work",
      visibility: "private",
    });
    expect(JSON.stringify(result.clusters)).not.toContain("private-repo");
  });

  test("caps large digests deterministically", () => {
    const rows = Array.from({ length: 130 }, (_, index) =>
      storedRow({
        bucket: "Open source",
        commitCount: 1,
        day: "2026-08-01",
        id: index.toString(16).padStart(64, "0"),
        languageFamily: "web",
        privacyDomainKey: null,
        privacyPolicyVersion: null,
        publicRepoName: `f0rr0/public-${index}`,
        publicRepoUrl: `https://github.com/f0rr0/public-${index}`,
        repoKey: `public-repo-${index}`,
        visibility: "public",
      })
    );
    const result = createTimelineActivityDigest({
      coverage: "complete",
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows,
      windowEnd,
      windowStart,
    });
    expect(result.clusters).toHaveLength(120);
  });

  test("uses issues as dispatches while suppressing a redundant nearby commit run", () => {
    const repoKey = "c".repeat(64);
    const publicRows = ["2026-07-30", "2026-08-01", "2026-08-03"].map(
      (day, index) =>
        storedRow({
          bucket: "Open source",
          commitCount: 2,
          day,
          id: String(index + 1).padStart(64, "0"),
          languageFamily: "web",
          privacyDomainKey: null,
          privacyPolicyVersion: null,
          publicRepoName: "upstream/public-tool",
          publicRepoUrl: "https://github.com/upstream/public-tool",
          repoKey,
          visibility: "public",
        })
    );
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events: [storedPublicEvent({ repoKey })],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: publicRows,
      windowEnd,
      windowStart,
    });

    expect(
      result.clusters.some((cluster) => cluster.kind === "issue-opened")
    ).toBe(true);
    expect(
      result.clusters.some((cluster) => cluster.kind === "commit-run")
    ).toBe(false);
  });

  test("deduplicates only the exact curated pull-request artifact", () => {
    const repoKey = "9".repeat(64);
    const rows = [
      storedRow({
        bucket: "Applied AI",
        commitCount: 1,
        day: "2026-03-16",
        id: "8".repeat(64),
        languageFamily: "systems",
        privacyDomainKey: null,
        privacyPolicyVersion: null,
        publicRepoName: "f0rr0/zeroclaw",
        publicRepoUrl: "https://github.com/f0rr0/zeroclaw",
        repoKey,
        visibility: "public",
      }),
    ];
    const duplicate = storedPublicEvent({
      day: "2026-03-16",
      eventKind: "pull_request_opened",
      id: "7".repeat(64),
      publicRepoName: "f0rr0/zeroclaw",
      publicRepoUrl: "https://github.com/f0rr0/zeroclaw",
      publicTitle: "The raw title for PR 8",
      publicUrl: "https://github.com/f0rr0/zeroclaw/pull/8",
      repoKey,
    });
    const distinct = storedPublicEvent({
      day: "2026-03-16",
      eventKind: "pull_request_opened",
      id: "6".repeat(64),
      publicRepoName: "f0rr0/zeroclaw",
      publicRepoUrl: "https://github.com/f0rr0/zeroclaw",
      publicTitle: "A different public change",
      publicUrl: "https://github.com/f0rr0/zeroclaw/pull/9",
      repoKey,
    });
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events: [duplicate, distinct],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows,
      windowEnd,
      windowStart,
    });

    expect(
      result.clusters.filter(
        (cluster) =>
          cluster.publicHref === "https://github.com/f0rr0/zeroclaw/pull/8"
      )
    ).toHaveLength(1);
    expect(
      result.clusters.some(
        (cluster) =>
          cluster.kind === "pull-request-opened" &&
          cluster.publicHref === "https://github.com/f0rr0/zeroclaw/pull/9"
      )
    ).toBe(true);
  });

  test("keeps a meaningful commit trend beside one issue dispatch", () => {
    const repoKey = "5".repeat(64);
    const rows = Array.from({ length: 9 }, (_, index) =>
      storedRow({
        bucket: "Open source",
        commitCount: 4,
        day: `2026-07-${String(15 + index * 2).padStart(2, "0")}`,
        id: index.toString(16).padStart(64, "4"),
        languageFamily: "web",
        privacyDomainKey: null,
        privacyPolicyVersion: null,
        publicRepoName: "upstream/public-tool",
        publicRepoUrl: "https://github.com/upstream/public-tool",
        repoKey,
        visibility: "public",
      })
    );
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events: [storedPublicEvent({ day: "2026-07-24", repoKey })],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows,
      windowEnd,
      windowStart,
    });

    expect(
      result.clusters.some((cluster) => cluster.kind === "issue-opened")
    ).toBe(true);
    expect(
      result.clusters.some((cluster) => cluster.kind === "commit-run")
    ).toBe(true);
  });

  test("keeps representative monthly dispatches instead of a PR wall", () => {
    const pullRequests = Array.from({ length: 8 }, (_, index) =>
      storedPublicEvent({
        day: `2026-07-${String(20 + index).padStart(2, "0")}`,
        eventKind: "pull_request_opened",
        id: index.toString(16).padStart(64, "1"),
        publicTitle: `Public change ${index + 1}`,
        publicUrl: `https://github.com/upstream/public-tool/pull/${index + 1}`,
      })
    );
    const issue = storedPublicEvent({
      day: "2026-07-19",
      id: "e".repeat(64),
    });
    const repository = storedPublicEvent({
      day: "2026-07-18",
      eventKind: "repository_created",
      id: "d".repeat(64),
      publicTitle: "public-tool",
      publicUrl: "https://github.com/upstream/public-tool",
    });
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events: [...pullRequests, issue, repository],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: [],
      windowEnd,
      windowStart,
    });
    const dispatches = result.clusters.filter(
      (cluster) =>
        cluster.kind === "issue-opened" ||
        cluster.kind === "pull-request-opened" ||
        cluster.kind === "repository-created"
    );

    expect(dispatches).toHaveLength(3);
    expect(dispatches.map((cluster) => cluster.kind).toSorted()).toEqual([
      "issue-opened",
      "pull-request-opened",
      "repository-created",
    ]);
  });

  test("does not let a curated pull request erase repository creation", () => {
    const repoKey = "3".repeat(64);
    const rows = [
      storedRow({
        bucket: "Applied AI",
        commitCount: 1,
        day: "2026-03-16",
        id: "2".repeat(64),
        languageFamily: "systems",
        privacyDomainKey: null,
        privacyPolicyVersion: null,
        publicRepoName: "f0rr0/zeroclaw",
        publicRepoUrl: "https://github.com/f0rr0/zeroclaw",
        repoKey,
        visibility: "public",
      }),
    ];
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events: [
        storedPublicEvent({
          day: "2026-03-15",
          eventKind: "repository_created",
          id: "1".repeat(64),
          publicRepoName: "f0rr0/zeroclaw",
          publicRepoUrl: "https://github.com/f0rr0/zeroclaw",
          publicTitle: "zeroclaw",
          publicUrl: "https://github.com/f0rr0/zeroclaw",
          repoKey,
        }),
      ],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows,
      windowEnd,
      windowStart,
    });

    expect(
      result.clusters.some((cluster) => cluster.kind === "repository-created")
    ).toBe(true);
    expect(
      result.clusters.some(
        (cluster) =>
          cluster.publicHref === "https://github.com/f0rr0/zeroclaw/pull/8"
      )
    ).toBe(true);
  });

  test("lets issue-only weeks establish a public consistency streak", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      storedPublicEvent({
        day: `2026-07-${String(1 + index * 7).padStart(2, "0")}`,
        id: index.toString(16).padStart(64, "0"),
        publicTitle: `Public issue ${index + 1}`,
        publicUrl: `https://github.com/upstream/public-tool/issues/${index + 1}`,
      })
    );
    const result = createTimelineActivityDigest({
      coverage: "complete",
      events,
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: [],
      windowEnd,
      windowStart,
    });
    const streak = result.clusters.find(
      (cluster) => cluster.kind === "public-streak"
    );

    expect(streak).toBeDefined();
    expect(streak.facts[0]).toContain("5 consecutive weeks");
  });

  test("subtracts known commits and events from account-wide totals once", () => {
    const result = calculateAnonymousContributionDays({
      events: [
        { day: "2026-08-01", id: "event-a" },
        { day: "2026-08-01", id: "event-a" },
      ],
      rows: [
        { commitCount: 4, day: "2026-08-01" },
        { commitCount: 3, day: "2026-08-02" },
      ],
      totals: [
        { contributionCount: 10, day: "2026-08-01" },
        { contributionCount: 2, day: "2026-08-02" },
        { contributionCount: 3, day: "2026-08-03" },
      ],
    });

    expect(result).toEqual([
      { contributionCount: 5, day: "2026-08-01" },
      { contributionCount: 3, day: "2026-08-03" },
    ]);
  });

  test("uses account-wide totals for one anonymous streak without duplicating the public streak", () => {
    const activeDays = [
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
    ];
    const events = activeDays.slice(0, 5).map((day, index) =>
      storedPublicEvent({
        day,
        id: index.toString(16).padStart(64, "0"),
        publicTitle: `Public issue ${index + 1}`,
        publicUrl: `https://github.com/upstream/public-tool/issues/${index + 1}`,
      })
    );
    const result = createTimelineActivityDigest({
      anonymousTotals: activeDays.map((day) => ({
        contributionCount: 8,
        day,
      })),
      coverage: "complete",
      events,
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: [],
      windowEnd,
      windowStart,
    });
    const streak = result.clusters.find(
      (cluster) => cluster.kind === "account-wide-streak"
    );

    expect(streak).toMatchObject({
      bucket: "Across the work",
      cadence: "streak",
      visibility: "anonymous",
    });
    expect(
      result.clusters.some((cluster) => cluster.kind === "public-streak")
    ).toBe(false);
    expect(
      result.clusters.some((cluster) => cluster.kind === "anonymous-month")
    ).toBe(true);
    expect(JSON.stringify(streak)).not.toContain("upstream/public-tool");
  });
});

describe("timeline publication", () => {
  test("materializes all public and protected copy outside the model", () => {
    const plan = validateTimelinePlanAgainstDigest(candidatePlan, digest);
    const protectedEntry = plan.entries.find(
      (entry) => entry.visibility === "private"
    );
    const publicEntry = plan.entries.find(
      (entry) => entry.sourceKeys[0] === "public:source-0"
    );

    expect(plan.headline).toBe("The work, along one line.");
    expect(plan.standfirst).toContain("public milestones");
    expect(protectedEntry.title).not.toContain("client");
    expect(protectedEntry.description).not.toContain("strategy");
    expect(protectedEntry.metrics).toEqual([]);
    expect(publicEntry.title).toBe("project-0");
    expect(publicEntry.description).toBe(
      "Several public changes landed together."
    );
  });

  test("publishes a public issue as one exact dispatch, not generated copy", () => {
    const eventDigest = createTimelineActivityDigest({
      coverage: "complete",
      events: [storedPublicEvent()],
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: [],
      windowEnd,
      windowStart,
    });
    const issue = eventDigest.clusters.find(
      (cluster) => cluster.kind === "issue-opened"
    );
    expect(issue).toBeDefined();

    const plan = validateTimelinePlanAgainstDigest(
      {
        selections: [{ importance: "brief", sourceKey: issue.key }],
        windowEnd,
        windowStart,
      },
      eventDigest
    );

    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      cadence: "isolated",
      description:
        "Opened a public issue in upstream/public-tool; the thread remains available on GitHub.",
      href: "https://github.com/upstream/public-tool/issues/42",
      kind: "issue",
      title: "Document the edge case",
    });
  });

  test("materializes anonymous totals without a repository or theme claim", () => {
    const anonymousDigest = createTimelineActivityDigest({
      anonymousTotals: [
        "2026-06-01",
        "2026-06-08",
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
      ].map((day) => ({ contributionCount: 5, day })),
      coverage: "complete",
      generatedAt: new Date("2026-08-12T00:00:00Z"),
      rows: [],
      windowEnd,
      windowStart,
    });
    const selections = anonymousDigest.clusters.map((cluster) => ({
      importance: cluster.maxImportance,
      sourceKey: cluster.key,
    }));
    const plan = validateTimelinePlanAgainstDigest(
      { selections, windowEnd, windowStart },
      anonymousDigest
    );
    const streak = plan.entries.find((entry) => entry.cadence === "streak");

    expect(streak).toMatchObject({
      bucket: "Across the work",
      title: "A sustained account-wide cadence",
      visibility: "anonymous",
    });
    expect(streak.description).toContain("repository identity");
    expect(streak.description).not.toContain("private");
    expect(streak.metrics).toEqual([]);
    expect(
      editionMatchesTimelinePrivacyPolicy(
        createTimelineEdition(
          plan,
          anonymousDigest,
          new Date("2026-08-12T01:00:00Z")
        ),
        null,
        null
      )
    ).toBe(true);
  });

  test("rejects source reuse, inflated importance, and model-authored fields", () => {
    const reused = structuredClone(candidatePlan);
    reused.selections[5].sourceKey = reused.selections[0].sourceKey;
    expect(() => validateTimelinePlanAgainstDigest(reused, digest)).toThrow(
      "reused"
    );

    const inflated = structuredClone(candidatePlan);
    inflated.selections[3].importance = "lead";
    expect(() => validateTimelinePlanAgainstDigest(inflated, digest)).toThrow(
      "overstates"
    );

    const authored = {
      ...structuredClone(candidatePlan),
      headline: "The model wrote this",
    };
    expect(() => validateTimelinePlanAgainstDigest(authored, digest)).toThrow(
      "Unrecognized key"
    );
  });

  test("keeps edition keys stable across runtime timestamps", () => {
    const plan = validateTimelinePlanAgainstDigest(candidatePlan, digest);
    const first = createTimelineEdition(
      plan,
      digest,
      new Date("2026-08-12T01:00:00Z")
    );
    const second = createTimelineEdition(
      plan,
      { ...digest, generatedAt: "2026-08-12T03:00:00.000Z" },
      new Date("2026-08-12T03:00:00Z")
    );
    expect(first.editionKey).toBe(second.editionKey);
  });

  test("revokes protected editions when the active policy changes", () => {
    const plan = validateTimelinePlanAgainstDigest(candidatePlan, digest);
    const edition = createTimelineEdition(plan, digest);
    expect(
      editionMatchesTimelinePrivacyPolicy(edition, "policy-a", "policy-a")
    ).toBe(true);
    expect(
      editionMatchesTimelinePrivacyPolicy(edition, "policy-a", "policy-b")
    ).toBe(false);
    expect(editionMatchesTimelinePrivacyPolicy(edition, "policy-a", null)).toBe(
      false
    );
  });

  test("builds a dense year-long safe fallback and filters unknown repos", () => {
    const edition = createFallbackTimelineEdition(
      availableActivity,
      new Set(),
      new Date("2026-08-12T12:00:00Z")
    );
    expect(edition).not.toBeNull();
    expect(edition.entries.length).toBeGreaterThanOrEqual(6);
    expect(edition.entries.some((entry) => entry.href !== undefined)).toBe(
      false
    );
    expect(
      edition.entries.filter(
        (entry) => entry.importance === "brief" || entry.importance === "pulse"
      ).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      (Date.parse(edition.windowEnd) - Date.parse(edition.windowStart)) /
        86_400_000
    ).toBe(399);
  });

  test("promotes a long anonymous weekly run above monthly fallback texture", () => {
    const edition = createFallbackTimelineEdition(
      {
        ...availableActivity,
        weeks: Array.from({ length: 6 }, (_, index) => ({
          contributionCount: 4,
          level: 2,
          weekStart: new Date(Date.UTC(2026, 4, 3 + index * 7))
            .toISOString()
            .slice(0, 10),
        })),
      },
      new Set(),
      new Date("2026-08-12T12:00:00Z")
    );
    const streak = edition?.entries.find((entry) => entry.cadence === "streak");

    expect(streak).toMatchObject({
      bucket: "Across the work",
      importance: "story",
      title: "A sustained account-wide cadence",
      visibility: "anonymous",
    });
    expect(streak?.description).not.toContain("private");
  });
});

describe("signed webhook revocation projection", () => {
  test("immediately maps a public-to-private transition to its stable key", () => {
    const body = JSON.stringify({
      action: "privatized",
      repository: {
        name: "must-not-survive",
        node_id: "R_stable_node_identifier",
        private: true,
      },
    });
    const revocation = timelineRevocationFromWebhook(
      body,
      "repository",
      privacyKey
    );
    expect(revocation).toEqual({
      repoKeys: [
        publicTimelineRepoKey("R_stable_node_identifier"),
        privateTimelineRepoKey("R_stable_node_identifier", privacyKey),
      ],
      withdrawAllPrivateActivity: false,
    });
    expect(JSON.stringify(revocation)).not.toContain("must-not-survive");
    expect(
      timelineRevocationFromWebhook(
        JSON.stringify({
          repository: {
            node_id: "R_stable_node_identifier",
            private: false,
          },
        }),
        "repository",
        privacyKey
      )
    ).toEqual({ repoKeys: [], withdrawAllPrivateActivity: false });
  });

  test("withdraws protected activity when an installation is suspended", () => {
    expect(
      timelineRevocationFromWebhook(
        JSON.stringify({ action: "suspend" }),
        "installation",
        privacyKey
      )
    ).toEqual({ repoKeys: [], withdrawAllPrivateActivity: true });
  });
});
