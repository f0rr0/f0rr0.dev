import { defineConfig } from "drizzle-kit";

import { administrationDatabaseUrl } from "./src/db/connection";
import { env } from "./src/env";

const databaseUrl =
  env.DATABASE_URL_UNPOOLED === undefined
    ? undefined
    : administrationDatabaseUrl(env);

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
