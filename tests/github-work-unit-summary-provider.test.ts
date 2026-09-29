import { describe, expect, spyOn, test } from "bun:test";
import assert from "node:assert/strict";

import type { generateText } from "ai";
import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";

import {
  generateGitHubWorkUnitSummary,
  GitHubWorkUnitSummaryInvalidInputError,
} from "../src/lib/github-work-unit-summary-provider.ts";
import { GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY } from "../src/lib/github-work-unit-summary.ts";

// Only the SDK fields consumed by the provider are needed in these test doubles.
const mockGenerateText = (
  implementation: (
    options: Parameters<typeof generateText>[0]
  ) => Promise<
    Pick<Awaited<ReturnType<typeof generateText>>, "output" | "usage">
  >
): typeof generateText => implementation as typeof generateText;

const summaryInput = (overrides = {}) => ({
  attributionMode: "tracked_authored_pr",
  evidence: {
    diff: {
      additions: 1,
      deletions: 1,
      files: [
        {
          additions: 1,
          deletions: 1,
          filename: "src/session.ts",
          patch: {
            kind: "text",
            lines: ["@@ recoverSession", "-oldSession()", "+newSession()"],
          },
          previousFilename: null,
          status: "modified",
        },
      ],
    },
    mode: "net",
  },
  kind: "pull_request",
  recipe: "github-work-unit-outcome-v2",
  repository: {
    description: "Public session recovery for the example product.",
    fullName: "example/product",
    homepageUrl: null,
    topics: ["sessions"],
  },
  version: 2,
  ...overrides,
});

const request = (overrides = {}) => ({
  deadlineAt: Date.now() + 10_000,
  serializedInput: JSON.stringify(summaryInput()),
  ...overrides,
});

const usage = {
  inputTokenDetails: {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    noCacheTokens: 12,
  },
  inputTokens: 12,
  outputTokenDetails: {
    reasoningTokens: 0,
    textTokens: 6,
  },
  outputTokens: 6,
  totalTokens: 18,
};

describe("GitHub work-unit summary provider", () => {
  test("uses one strict, bounded, stateless structured-output request", async () => {
    let call: Parameters<typeof generateText>[0] | undefined;
    const input = request();
    const result = await generateGitHubWorkUnitSummary(input, {
      generateText: mockGenerateText(async (options) => {
        call = options;
        return {
          output: {
            headline: "Added resilient session recovery",
            summary: "Sessions now recover safely after expiration.",
          },
          usage,
        };
      }),
    });

    assert.ok(call);
    expect(call.model).toMatchObject({
      modelId: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.model,
    });
    expect(call.maxOutputTokens).toBe(
      GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.maxOutputTokens
    );
    expect(call.maxRetries).toBe(0);
    expect(call.providerOptions).toEqual({
      openai: {
        reasoningEffort: "none",
        store: false,
        textVerbosity: "low",
      },
    });
    expect(call.prompt).toBe(input.serializedInput);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);

    assert.ok(call.output);
    const responseFormat = await call.output.responseFormat;
    expect(responseFormat).toMatchObject({
      schema: {
        additionalProperties: false,
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
        },
        required: ["headline", "summary"],
        type: "object",
      },
      type: "json",
    });
    expect(result).toMatchObject({
      inputTokens: 12,
      model: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.model,
      outcome: JSON.stringify({
        headline: "Added resilient session recovery",
        summary: "Sessions now recover safely after expiration.",
      }),
      outputTokens: 6,
    });
  });

  test("propagates an upstream failure unchanged for worker retry", async () => {
    const upstream = new Error("network unavailable");
    let calls = 0;

    await assert.rejects(
      generateGitHubWorkUnitSummary(request(), {
        generateText: mockGenerateText(async () => {
          calls += 1;
          throw upstream;
        }),
      }),
      (error: unknown) => error === upstream
    );
    expect(calls).toBe(1);
  });

  test("reports structured and semantic rejection for bounded worker retry", async () => {
    let semanticCalls = 0;
    const semanticFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: mockGenerateText(async () => {
        semanticCalls += 1;
        return {
          output: {
            headline: "Added recovery",
            summary: "See https://example.com/details.",
          },
          usage,
        };
      }),
    });
    await assert.rejects(semanticFailure, {
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "url",
    });
    expect(semanticCalls).toBe(1);

    const structuredFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: mockGenerateText(async () => {
        throw new NoOutputGeneratedError();
      }),
    });
    await assert.rejects(structuredFailure, {
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "invalid_shape",
    });

    const schemaFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: mockGenerateText(async () => {
        throw new NoObjectGeneratedError({
          finishReason: "stop",
          response: {
            id: "response-id",
            modelId: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.model,
            timestamp: new Date(0),
          },
          text: JSON.stringify({
            extra: true,
            headline: "Safe",
            summary: "Safe.",
          }),
          usage,
        });
      }),
    });
    await assert.rejects(schemaFailure, {
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "invalid_shape",
    });
  });

  test("rejects malformed, noncanonical, or inconsistent persisted input before calling the model", async () => {
    const invalidInputs = [
      "not-json",
      "x".repeat(393_217),
      JSON.stringify({}),
      `${JSON.stringify(summaryInput())}\n`,
      JSON.stringify({ ...summaryInput(), extra: true }),
      JSON.stringify(
        summaryInput({
          attributionMode: "branch_owned_composite",
          kind: "branch",
        })
      ),
      JSON.stringify(
        summaryInput({
          repository: {
            ...summaryInput().repository,
            description: "word ".repeat(70_000),
          },
        })
      ),
      JSON.stringify(
        summaryInput({
          evidence: {
            diff: { ...summaryInput().evidence.diff, additions: 2 },
            mode: "net",
          },
        })
      ),
    ];
    let calls = 0;
    const generateUnusedSummary = async () => {
      calls += 1;
      return {
        output: { headline: "Unused", summary: "Unused." },
        usage,
      };
    };
    for (const serializedInput of invalidInputs) {
      await assert.rejects(
        generateGitHubWorkUnitSummary(request({ serializedInput }), {
          generateText: mockGenerateText(generateUnusedSummary),
        }),
        GitHubWorkUnitSummaryInvalidInputError
      );
    }
    expect(calls).toBe(0);
  });

  test("does not start after the deadline and aborts an in-flight request", async () => {
    let calls = 0;
    await assert.rejects(
      generateGitHubWorkUnitSummary(request({ deadlineAt: Date.now() - 1 }), {
        generateText: mockGenerateText(async () => {
          calls += 1;
          return { output: { headline: "Unused", summary: "Unused." }, usage };
        }),
      }),
      { name: "TimeoutError" }
    );
    expect(calls).toBe(0);

    const now = 1_790_683_200_000;
    const clock = spyOn(Date, "now").mockReturnValue(now);
    const controller = new AbortController();
    const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(
      controller.signal
    );
    const reason = new DOMException("Deadline reached", "TimeoutError");
    try {
      await assert.rejects(
        generateGitHubWorkUnitSummary(request({ deadlineAt: now + 1000 }), {
          generateText: mockGenerateText(async ({ abortSignal }) => {
            expect(abortSignal).toBe(controller.signal);
            controller.abort(reason);
            abortSignal?.throwIfAborted();
            return {
              output: { headline: "Unused", summary: "Unused." },
              usage,
            };
          }),
        }),
        reason
      );
      expect(timeout.mock.calls).toEqual([[1000]]);
    } finally {
      clock.mockRestore();
      timeout.mockRestore();
    }
  });
});
