import { describe, expect, test } from "bun:test";

import { GitHubWorkUnitSummaryInvalidOutputError } from "../src/lib/github-work-unit-summary-provider.ts";
import { runGitHubWorkUnitSummaryWorker } from "../src/lib/github-work-unit-summary-worker.ts";

const now = new Date("2026-09-01T12:00:00.000Z");
const claim = Object.freeze({
  attributionMode: "tracked_authored_pr",
  leaseToken: "10000000-0000-4000-8000-000000000001",
  outcomeDigest: "a".repeat(64),
  revision: 1,
  serializedInput: '{"evidence":"public"}',
  startedRequests: 1,
  summaryInputDigest: "b".repeat(64),
  workUnitId: "20000000-0000-4000-8000-000000000001",
});
const providerResult = Object.freeze({
  inputTokens: 20,
  latencyMs: 10,
  model: "gpt-5.4-nano-2026-03-17",
  outcome: "Builds the current public outcome.",
  outputTokens: 8,
});

const dependenciesFrom = (overrides = {}) => ({
  claim: async () => claim,
  complete: async () => ({ accepted: true }),
  defer: async () => "deferred",
  generate: async () => providerResult,
  now: () => new Date(now),
  providerConfigured: () => true,
  terminal: async () => true,
  ...overrides,
});

describe("GitHub work-unit summary worker", () => {
  test("claims, generates, and settles one summary in its isolated budget", async () => {
    let claimed = 0;
    let completed = 0;
    let generated = 0;
    const result = await runGitHubWorkUnitSummaryWorker(
      58_000,
      dependenciesFrom({
        claim: async ({ now: claimedAt }) => {
          claimed += 1;
          expect(claimedAt).toEqual(now);
          return claim;
        },
        complete: async (completedClaim, output, completedAt) => {
          completed += 1;
          expect(completedClaim).toBe(claim);
          expect(output).toBe(providerResult);
          expect(completedAt).toEqual(now);
          return { accepted: true };
        },
        generate: async (request) => {
          generated += 1;
          expect(request.serializedInput).toBe(claim.serializedInput);
          expect(request.deadlineAt).toBeGreaterThan(now.getTime());
          return providerResult;
        },
      })
    );

    expect({ claimed, completed, generated }).toEqual({
      claimed: 1,
      completed: 1,
      generated: 1,
    });
    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      deferred: 0,
      failed: 0,
      unavailable: 0,
    });
  });

  test("does not claim without a complete provider budget or configuration", async () => {
    let claims = 0;
    const dependencies = dependenciesFrom({
      claim: async () => {
        claims += 1;
        return claim;
      },
    });

    expect(await runGitHubWorkUnitSummaryWorker(20_000, dependencies)).toEqual({
      claimed: 0,
      completed: 0,
      deferred: 0,
      failed: 0,
      unavailable: 0,
    });
    expect(
      await runGitHubWorkUnitSummaryWorker(58_000, {
        ...dependencies,
        providerConfigured: () => false,
      })
    ).toEqual({
      claimed: 0,
      completed: 0,
      deferred: 0,
      failed: 0,
      unavailable: 0,
    });
    expect(claims).toBe(0);
  });

  test("defers one transient provider failure without a second request", async () => {
    let generated = 0;
    let deferred = 0;
    const result = await runGitHubWorkUnitSummaryWorker(
      58_000,
      dependenciesFrom({
        defer: async (deferredClaim, retryAt, deferredAt) => {
          deferred += 1;
          expect(deferredClaim).toBe(claim);
          expect(retryAt.getTime()).toBeGreaterThan(deferredAt.getTime());
          return "deferred";
        },
        generate: async () => {
          generated += 1;
          throw new Error("transient provider failure");
        },
      })
    );

    expect({ deferred, generated }).toEqual({ deferred: 1, generated: 1 });
    expect(result).toMatchObject({
      claimed: 1,
      deferred: 1,
      failed: 0,
      unavailable: 0,
    });
  });

  test("settles invalid provider output as facts-only", async () => {
    let terminalized = 0;
    const result = await runGitHubWorkUnitSummaryWorker(
      58_000,
      dependenciesFrom({
        generate: async () => {
          throw new GitHubWorkUnitSummaryInvalidOutputError("url");
        },
        terminal: async (terminalClaim, terminalAt) => {
          terminalized += 1;
          expect(terminalClaim).toBe(claim);
          expect(terminalAt).toEqual(now);
          return true;
        },
      })
    );

    expect(terminalized).toBe(1);
    expect(result).toMatchObject({
      claimed: 1,
      deferred: 0,
      failed: 0,
      unavailable: 1,
    });
  });
});
