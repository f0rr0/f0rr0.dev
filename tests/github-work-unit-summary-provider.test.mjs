import { describe, expect, test } from "bun:test";

import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";

import {
  generateGitHubWorkUnitSummary,
  GITHUB_WORK_UNIT_SUMMARY_MAX_OUTPUT_TOKENS,
  GITHUB_WORK_UNIT_SUMMARY_MODEL,
  GitHubWorkUnitSummaryInvalidInputError,
} from "../src/lib/github-work-unit-summary-provider.ts";

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
  recipe: "github-work-unit-outcome-v1",
  repository: {
    description: "Public session recovery for the example product.",
    fullName: "example/product",
    homepageUrl: null,
    topics: ["sessions"],
  },
  version: 1,
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
    let call;
    const input = request();
    const result = await generateGitHubWorkUnitSummary(input, {
      generateText: async (options) => {
        call = options;
        return {
          output: { outcome: "Added resilient session recovery." },
          usage,
        };
      },
    });

    expect(call).toBeDefined();
    expect(call.model.modelId).toBe(GITHUB_WORK_UNIT_SUMMARY_MODEL);
    expect(call.maxOutputTokens).toBe(
      GITHUB_WORK_UNIT_SUMMARY_MAX_OUTPUT_TOKENS
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

    const responseFormat = await call.output.responseFormat;
    expect(responseFormat).toMatchObject({
      schema: {
        additionalProperties: false,
        properties: { outcome: { type: "string" } },
        required: ["outcome"],
        type: "object",
      },
      type: "json",
    });
    expect(result).toMatchObject({
      inputTokens: 12,
      model: GITHUB_WORK_UNIT_SUMMARY_MODEL,
      outcome: "Added resilient session recovery.",
      outputTokens: 6,
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("propagates an upstream failure unchanged for worker retry", async () => {
    const upstream = new Error("network unavailable");
    let calls = 0;

    await expect(
      generateGitHubWorkUnitSummary(request(), {
        generateText: async () => {
          calls += 1;
          throw upstream;
        },
      })
    ).rejects.toBe(upstream);
    expect(calls).toBe(1);
  });

  test("makes structured and semantic rejection terminal with no fallback", async () => {
    let semanticCalls = 0;
    const semanticFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: async () => {
        semanticCalls += 1;
        return {
          output: { outcome: "See https://example.com/details." },
          usage,
        };
      },
    });
    await expect(semanticFailure).rejects.toMatchObject({
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "url",
      retryable: false,
    });
    expect(semanticCalls).toBe(1);

    const structuredFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: async () => {
        throw new NoOutputGeneratedError();
      },
    });
    await expect(structuredFailure).rejects.toMatchObject({
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "invalid_shape",
      retryable: false,
    });

    const schemaFailure = generateGitHubWorkUnitSummary(request(), {
      generateText: async () => {
        throw new NoObjectGeneratedError({
          finishReason: "stop",
          response: {
            id: "response-id",
            modelId: GITHUB_WORK_UNIT_SUMMARY_MODEL,
            timestamp: new Date(0),
          },
          text: JSON.stringify({ outcome: "Safe.", extra: true }),
          usage,
        });
      },
    });
    await expect(schemaFailure).rejects.toMatchObject({
      name: "GitHubWorkUnitSummaryInvalidOutputError",
      reason: "invalid_shape",
      retryable: false,
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
        output: { outcome: "Unused." },
        usage,
      };
    };
    for (const serializedInput of invalidInputs) {
      let receivedError;
      try {
        await generateGitHubWorkUnitSummary(request({ serializedInput }), {
          generateText: generateUnusedSummary,
        });
      } catch (error) {
        receivedError = error;
      }
      expect(receivedError).toBeInstanceOf(
        GitHubWorkUnitSummaryInvalidInputError
      );
      expect(receivedError).toMatchObject({
        name: "GitHubWorkUnitSummaryInvalidInputError",
        retryable: false,
      });
    }
    expect(calls).toBe(0);
  });

  test("does not start after the deadline and aborts an in-flight request", async () => {
    let calls = 0;
    await expect(
      generateGitHubWorkUnitSummary(request({ deadlineAt: Date.now() - 1 }), {
        generateText: async () => {
          calls += 1;
          return { output: { outcome: "Unused." }, usage };
        },
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(calls).toBe(0);

    let observedSignal;
    const inFlight = generateGitHubWorkUnitSummary(
      request({ deadlineAt: Date.now() + 20 }),
      {
        generateText: async ({ abortSignal }) => {
          observedSignal = abortSignal;
          await Bun.sleep(30);
          abortSignal.throwIfAborted();
          return { output: { outcome: "Unused." }, usage };
        },
      }
    );
    await expect(inFlight).rejects.toMatchObject({ name: "TimeoutError" });
    expect(observedSignal.aborted).toBe(true);
  });
});
