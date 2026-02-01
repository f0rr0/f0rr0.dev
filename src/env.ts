import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    VERCEL_URL: z.string().min(1).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
