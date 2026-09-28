import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { postgresConnectionOptions, runtimeDatabaseUrl } from "@/db/connection";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { reportOperationalError } from "@/lib/operational-error";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

// Keep one pool per process, including across development module reloads.
const state = globalThis as typeof globalThis & {
  portfolioDatabase?: ReturnType<typeof drizzle<typeof schema, Pool>>;
};

const readDatabaseUrl = () => {
  const value = env.DATABASE_URL?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

export const isDatabaseConfigured = () => readDatabaseUrl() !== null;

export const getDatabase = () => {
  if (state.portfolioDatabase !== undefined) {
    return state.portfolioDatabase;
  }

  const databaseUrl = readDatabaseUrl();
  if (databaseUrl === null) {
    throw new DatabaseConfigurationError();
  }

  const client = new Pool({
    ...postgresConnectionOptions(runtimeDatabaseUrl(databaseUrl)),
    application_name: "f0rr0.dev:app",
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5000,
    max: 1,
  });
  client.on("error", (error) => {
    reportOperationalError("database-pool", error);
  });
  attachDatabasePool(client);
  state.portfolioDatabase = drizzle({ client, schema });
  return state.portfolioDatabase;
};

export const closeDatabase = async () => {
  const database = state.portfolioDatabase;
  delete state.portfolioDatabase;
  await database?.$client.end();
};
