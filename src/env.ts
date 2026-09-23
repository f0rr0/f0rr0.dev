import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

export const env = createEnv({
  extends: [vercel()],
  client: {
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: optionalString,
    NEXT_PUBLIC_VERCEL_ENV: z
      .enum(["development", "preview", "production"])
      .optional(),
    NEXT_PUBLIC_POSTHOG_KEY: optionalString,
    NEXT_PUBLIC_POSTHOG_REGION: z.enum(["us", "eu"]).default("us"),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: {
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL:
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_REGION: process.env.NEXT_PUBLIC_POSTHOG_REGION,
  },
  server: {
    CRON_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    GITHUB_ACTIVITY_CURSOR_SECRET: z.string().min(32).optional(),
    GITHUB_TOKENS: optionalString,
    GITHUB_TOKEN: optionalString,
    GITHUB_WEBHOOK_SECRET: z.string().min(32).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    OPENAI_API_KEY: optionalString,
    PORT: optionalString,
  },
});
