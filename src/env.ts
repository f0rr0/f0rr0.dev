import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_PORT: z.string().min(1).optional(),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: {
    NEXT_PUBLIC_PORT: process.env.NEXT_PUBLIC_PORT,
  },
  server: {
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    AI_GATEWAY_ZERO_DATA_RETENTION: z.enum(["true", "false"]).optional(),
    CRON_SECRET: z.string().min(16).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    GH_TOKEN: z.string().min(1).optional(),
    GITHUB_ACTIVITY_TOKEN: z.string().min(1).optional(),
    GITHUB_PUBLIC_ACTIVITY_TOKEN: z.string().min(1).optional(),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_INSTALLATION_IDS: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    PORT: z.string().min(1).optional(),
    SITE_URL: z.string().min(1).optional(),
    TIMELINE_PRIVATE_TAXONOMY: z.string().min(2).optional(),
    TIMELINE_PRIVACY_KEY: z.string().min(32).optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
    VERCEL_URL: z.string().min(1).optional(),
  },
});
