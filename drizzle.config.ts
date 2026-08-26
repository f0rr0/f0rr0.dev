import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  ...(databaseUrl === undefined || databaseUrl.length === 0
    ? {}
    : { dbCredentials: { url: databaseUrl } }),
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  strict: true,
  verbose: true,
});
