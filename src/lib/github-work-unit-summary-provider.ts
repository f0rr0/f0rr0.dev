import { Buffer } from "node:buffer";

import { openai } from "@ai-sdk/openai";
import {
  generateText as generateAiText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";

import {
  countGitHubWorkUnitSummaryInputTokens,
  GITHUB_WORK_UNIT_SUMMARY_MAX_INPUT_TOKENS,
  GITHUB_WORK_UNIT_SUMMARY_MAX_PAYLOAD_BYTES,
  GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY,
  GITHUB_WORK_UNIT_SUMMARY_SYSTEM_PROMPT,
  githubWorkUnitSummaryInputSchema,
  githubWorkUnitSummaryOutputSchema,
  validateGitHubWorkUnitSummaryOutput,
} from "./github-work-unit-summary";
import type { GitHubWorkUnitSummaryOutputRejectionReason } from "./github-work-unit-summary";

const MAXIMUM_ABORT_SIGNAL_TIMEOUT_MS = 2_147_483_647;
const summaryOutput = Output.object({
  schema: githubWorkUnitSummaryOutputSchema,
});
const summaryModel = openai(GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.model);

export interface GitHubWorkUnitSummaryProviderRequest {
  readonly deadlineAt: number;
  readonly serializedInput: string;
}

export interface GitHubWorkUnitSummaryProviderResult {
  readonly inputTokens: number | null;
  readonly latencyMs: number;
  readonly model: (typeof GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY)["model"];
  readonly outcome: string;
  readonly outputTokens: number | null;
}

export interface GitHubWorkUnitSummaryProviderDependencies {
  readonly generateText?: typeof generateAiText;
}

export class GitHubWorkUnitSummaryInvalidInputError extends Error {
  readonly retryable = false;

  constructor(options?: ErrorOptions) {
    super("The persisted GitHub work-unit summary input is invalid.", options);
    this.name = "GitHubWorkUnitSummaryInvalidInputError";
  }
}

// oxlint-disable-next-line max-classes-per-file -- Input and output failures have different terminal meanings at the worker boundary.
export class GitHubWorkUnitSummaryInvalidOutputError extends Error {
  readonly reason: GitHubWorkUnitSummaryOutputRejectionReason;
  readonly retryable = false;

  constructor(
    reason: GitHubWorkUnitSummaryOutputRejectionReason,
    options?: ErrorOptions
  ) {
    super(
      `The generated GitHub work-unit summary was rejected: ${reason}.`,
      options
    );
    this.name = "GitHubWorkUnitSummaryInvalidOutputError";
    this.reason = reason;
  }
}

const abortSignalBefore = (deadlineAt: number) => {
  const remaining = Math.floor(deadlineAt - Date.now());
  if (!Number.isFinite(deadlineAt) || remaining <= 0) {
    throw new DOMException(
      "The GitHub work-unit summary deadline was reached.",
      "TimeoutError"
    );
  }
  return AbortSignal.timeout(
    Math.min(remaining, MAXIMUM_ABORT_SIGNAL_TIMEOUT_MS)
  );
};

const nullableTokenCount = (value: number | undefined) => value ?? null;
const isInvalidStructuredOutput = (error: unknown) =>
  NoObjectGeneratedError.isInstance(error) ||
  NoOutputGeneratedError.isInstance(error);

const validatePersistedInput = async (serializedInput: unknown) => {
  if (
    typeof serializedInput !== "string" ||
    Buffer.byteLength(serializedInput, "utf-8") >
      GITHUB_WORK_UNIT_SUMMARY_MAX_PAYLOAD_BYTES
  ) {
    throw new GitHubWorkUnitSummaryInvalidInputError();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(serializedInput);
  } catch (error) {
    throw new GitHubWorkUnitSummaryInvalidInputError({ cause: error });
  }
  const parsed = githubWorkUnitSummaryInputSchema.safeParse(decoded);
  if (!parsed.success || JSON.stringify(parsed.data) !== serializedInput) {
    throw new GitHubWorkUnitSummaryInvalidInputError(
      parsed.success ? undefined : { cause: parsed.error }
    );
  }
  if (
    (await countGitHubWorkUnitSummaryInputTokens(serializedInput)) >
    GITHUB_WORK_UNIT_SUMMARY_MAX_INPUT_TOKENS
  ) {
    throw new GitHubWorkUnitSummaryInvalidInputError();
  }
};

export const generateGitHubWorkUnitSummary = async (
  request: GitHubWorkUnitSummaryProviderRequest,
  dependencies: GitHubWorkUnitSummaryProviderDependencies = {}
): Promise<GitHubWorkUnitSummaryProviderResult> => {
  await validatePersistedInput(request.serializedInput);
  const abortSignal = abortSignalBefore(request.deadlineAt);
  const startedAt = performance.now();
  const generateText = dependencies.generateText ?? generateAiText;

  let generated: Awaited<ReturnType<typeof generateText>>;
  try {
    generated = await generateText({
      abortSignal,
      maxOutputTokens: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.maxOutputTokens,
      maxRetries: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.maxRetries,
      model: summaryModel,
      output: summaryOutput,
      prompt: request.serializedInput,
      providerOptions: {
        openai: {
          reasoningEffort:
            GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.reasoningEffort,
          store: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.store,
          textVerbosity: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.textVerbosity,
        },
      },
      system: GITHUB_WORK_UNIT_SUMMARY_SYSTEM_PROMPT,
    });
  } catch (error) {
    if (isInvalidStructuredOutput(error)) {
      throw new GitHubWorkUnitSummaryInvalidOutputError("invalid_shape", {
        cause: error,
      });
    }
    throw error;
  }

  let output: unknown;
  try {
    const { output: structuredOutput } = generated;
    output = structuredOutput;
  } catch (error) {
    if (isInvalidStructuredOutput(error)) {
      throw new GitHubWorkUnitSummaryInvalidOutputError("invalid_shape", {
        cause: error,
      });
    }
    throw error;
  }
  const validated = validateGitHubWorkUnitSummaryOutput(output);
  if (!validated.ok) {
    throw new GitHubWorkUnitSummaryInvalidOutputError(validated.reason);
  }

  return {
    inputTokens: nullableTokenCount(generated.usage.inputTokens),
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    model: GITHUB_WORK_UNIT_SUMMARY_PROVIDER_POLICY.model,
    outcome: validated.outcome,
    outputTokens: nullableTokenCount(generated.usage.outputTokens),
  };
};
