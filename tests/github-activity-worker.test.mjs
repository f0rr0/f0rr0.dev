import { describe, expect, test } from "bun:test";

import {
  ActivityProcessingError,
  GitHubGraphQlResponseError,
} from "../src/lib/github-activity-processor.ts";
import {
  boundedWorkerLimit,
  githubActivityRetryAt,
  githubPullRequestSnapshotDisposition,
  githubPrReconciliationCutoff,
  githubSummaryCanStart,
  GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
  nextGitHubPullRequestReconciliationAt,
  workerBatchSizeFrom,
  workerDeadlineReached,
} from "../src/lib/github-activity-worker-core.ts";
import {
  GITHUB_ACTIVITY_TERMINAL_ATTEMPTS,
  githubActivityFailureIsTerminal,
} from "../src/lib/github-activity-worker.ts";
import { GitHubResponseError } from "../src/lib/github-api.ts";

describe("GitHub activity terminal gaps", () => {
  test("given a deterministic REST gap, it becomes unavailable on the third worker claim", () => {
    for (const status of [403, 404, 410, 422]) {
      const error = new GitHubResponseError(status, { retryable: false });
      expect(
        githubActivityFailureIsTerminal(
          error,
          GITHUB_ACTIVITY_TERMINAL_ATTEMPTS - 1
        )
      ).toBe(false);
      expect(
        githubActivityFailureIsTerminal(
          error,
          GITHUB_ACTIVITY_TERMINAL_ATTEMPTS
        )
      ).toBe(true);
    }
  });

  test("given rate-limit evidence, repeated REST or GraphQL failures stay retryable", () => {
    expect(
      githubActivityFailureIsTerminal(
        new GitHubResponseError(403, { retryable: true }),
        GITHUB_ACTIVITY_TERMINAL_ATTEMPTS + 10
      )
    ).toBe(false);
    expect(
      githubActivityFailureIsTerminal(
        new GitHubGraphQlResponseError("rate_limited", { retryable: true }),
        GITHUB_ACTIVITY_TERMINAL_ATTEMPTS + 10
      )
    ).toBe(false);
  });

  test("given repeatedly unusable provider evidence, it becomes a terminal coverage gap", () => {
    expect(
      githubActivityFailureIsTerminal(
        new GitHubGraphQlResponseError("request_rejected", {
          retryable: false,
        }),
        GITHUB_ACTIVITY_TERMINAL_ATTEMPTS
      )
    ).toBe(true);
    expect(
      githubActivityFailureIsTerminal(
        new ActivityProcessingError("source_invalid", "invalid source"),
        GITHUB_ACTIVITY_TERMINAL_ATTEMPTS
      )
    ).toBe(true);
    for (const code of [
      "membership_incomplete",
      "source_auth_missing",
      "source_incomplete",
      "source_invalid",
      "source_unavailable",
    ]) {
      expect(
        githubActivityFailureIsTerminal(
          new ActivityProcessingError(code, "unusable source"),
          GITHUB_ACTIVITY_TERMINAL_ATTEMPTS - 1
        )
      ).toBe(false);
      expect(
        githubActivityFailureIsTerminal(
          new ActivityProcessingError(code, "unusable source"),
          GITHUB_ACTIVITY_TERMINAL_ATTEMPTS
        )
      ).toBe(true);
    }
  });
});

describe("GitHub activity worker bounds", () => {
  test("accepts only deliberately small batches", () => {
    expect(boundedWorkerLimit()).toBe(8);
    expect(boundedWorkerLimit(8)).toBe(8);
    expect(() => boundedWorkerLimit(0)).toThrow("batch size");
    expect(() => boundedWorkerLimit(9)).toThrow("batch size");
    expect(workerBatchSizeFrom(null)).toBeUndefined();
    expect(workerBatchSizeFrom("8")).toBe(8);
    expect(workerBatchSizeFrom("9")).toBeNull();
    expect(workerBatchSizeFrom("0")).toBeNull();
    expect(workerBatchSizeFrom("08")).toBeNull();
  });

  test("uses a deterministic wall-clock deadline", () => {
    expect(workerDeadlineReached(1000, 10_000, 10_999)).toBe(false);
    expect(workerDeadlineReached(1000, 10_000, 11_000)).toBe(true);
  });

  test("starts summary work only with a complete provider budget", () => {
    expect(githubSummaryCanStart(26_000, 1000)).toBe(true);
    expect(githubSummaryCanStart(25_999, 1000)).toBe(false);
    expect(() => githubSummaryCanStart(Number.NaN, 1000)).toThrow(RangeError);
  });

  test("stops terminal PR polling", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(nextGitHubPullRequestReconciliationAt("merged", now)).toBeNull();
    expect(nextGitHubPullRequestReconciliationAt("closed", now)).toBeNull();
    expect(
      nextGitHubPullRequestReconciliationAt("open", now)?.toISOString()
    ).toBe("2026-08-28T15:00:00.000Z");
  });

  test("keeps open PR reconciliation unbounded with age-aware cadence", () => {
    expect(GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS).toBe(Infinity);
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(githubPrReconciliationCutoff(Infinity, now)).toBeNull();
    expect(
      githubPrReconciliationCutoff(Number.MAX_SAFE_INTEGER, now)
    ).toBeNull();
    expect(
      nextGitHubPullRequestReconciliationAt(
        "open",
        now,
        new Date("2026-06-01T00:00:00.000Z")
      )?.toISOString()
    ).toBe("2026-08-29T12:00:00.000Z");
    expect(
      nextGitHubPullRequestReconciliationAt(
        "open",
        now,
        new Date("2025-01-01T00:00:00.000Z")
      )?.toISOString()
    ).toBe("2026-09-04T12:00:00.000Z");
  });

  test("backs off repeated transient work with a provider-aware cap", () => {
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(githubActivityRetryAt(1, now).toISOString()).toBe(
      "2026-08-28T12:15:00.000Z"
    );
    expect(githubActivityRetryAt(20, now).toISOString()).toBe(
      "2026-08-29T12:00:00.000Z"
    );
    expect(
      githubActivityRetryAt(
        1,
        now,
        new Date("2026-08-28T14:00:00.000Z")
      ).toISOString()
    ).toBe("2026-08-28T14:00:00.000Z");
  });

  test("lets authoritative REST settle same-second close and synchronize races", () => {
    const providerSecond = new Date("2026-08-28T12:00:00.000Z");
    expect(
      githubPullRequestSnapshotDisposition(
        providerSecond,
        providerSecond,
        false
      )
    ).toBe("equal_observed");
    expect(
      githubPullRequestSnapshotDisposition(providerSecond, providerSecond, true)
    ).toBe("equal_authoritative");
  });
});
