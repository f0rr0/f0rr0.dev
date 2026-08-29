import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { env } from "@/env";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

let client: ReturnType<typeof postgres> | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

const readDatabaseUrl = () => {
  const value = env.DATABASE_URL?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

export const isDatabaseConfigured = () => readDatabaseUrl() !== null;

export const getDatabase = () => {
  if (database !== null) {
    return database;
  }

  const databaseUrl = readDatabaseUrl();
  if (databaseUrl === null) {
    throw new DatabaseConfigurationError();
  }

  client = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
  });
  database = drizzle({ client, schema });
  return database;
};

export const closeDatabase = async () => {
  const activeClient = client;
  client = null;
  database = null;
  if (activeClient !== null) {
    await activeClient.end({ timeout: 5 });
  }
};
