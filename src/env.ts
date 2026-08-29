import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

export const env = createEnv({
  client: {
    NEXT_PUBLIC_PORT: optionalString,
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: {
    NEXT_PUBLIC_PORT: process.env.NEXT_PUBLIC_PORT,
  },
  server: {
    CRON_SECRET: z.string().min(32).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    GH_TOKEN: optionalString,
    GITHUB_BACKFILL_SECRET: z.string().min(32).optional(),
    GITHUB_F0RR0_TOKEN: optionalString,
    GITHUB_TOKEN: optionalString,
    GITHUB_WEBHOOK_SECRET: z.string().min(32).optional(),
    GITHUB_YUPPIESTECHDEV_TOKEN: optionalString,
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    OPENAI_API_KEY: optionalString,
    PORT: optionalString,
    POSTGRES_URL_NON_POOLING: z.url().optional(),
    SITE_URL: optionalString,
    VERCEL: z.literal("1").optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: optionalString,
    VERCEL_URL: optionalString,
  },
});
