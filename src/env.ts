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
    CRON_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    GH_TOKEN: z.string().min(1).optional(),
    GITHUB_BACKFILL_SECRET: z.string().min(32).optional(),
    GITHUB_F0RR0_TOKEN: z.string().min(1).optional(),
    GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS: z
      .string()
      .regex(/^(?:[1-9]\d*|infinity)$/i)
      .optional(),
    GITHUB_TOKEN: z.string().min(1).optional(),
    GITHUB_WEBHOOK_SECRET: z.string().min(32).optional(),
    GITHUB_YUPPIESTECHDEV_TOKEN: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    PORT: z.string().min(1).optional(),
    SITE_URL: z.string().min(1).optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
    VERCEL_URL: z.string().min(1).optional(),
  },
});
