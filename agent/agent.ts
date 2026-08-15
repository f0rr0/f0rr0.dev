import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const gatewayOptions = {
  disallowPromptTraining: true,
  ...(process.env.AI_GATEWAY_ZERO_DATA_RETENTION === "true"
    ? { zeroDataRetention: true }
    : {}),
} satisfies GatewayProviderOptions;

const openAIKey = (process.env.OPENAI_API_KEY ?? "").trim();
const useDirectOpenAI = openAIKey.length > 0;

// Deployment policy: OPENAI direct wins whenever present.
const selectedModel = useDirectOpenAI
  ? openai("gpt-5.4-mini")
  : "openai/gpt-5.4-mini";

export default defineAgent({
  limits: {
    maxInputTokensPerSession: 120_000,
    maxOutputTokensPerSession: 16_000,
    sessionTimeoutMs: 30 * 60 * 1000,
  },
  model: selectedModel,
  ...(useDirectOpenAI
    ? {}
    : {
        modelOptions: {
          providerOptions: { gateway: gatewayOptions },
        },
      }),
  reasoning: "medium",
});
