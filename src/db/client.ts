import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

export class TimelineDatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured for the timeline store.");
    this.name = "TimelineDatabaseConfigurationError";
  }
}

type TimelineDatabase = PostgresJsDatabase<typeof schema>;

let database: TimelineDatabase | null = null;
let localClient: ReturnType<typeof postgres> | null = null;

const readDatabaseUrl = () => {
  const value = process.env.DATABASE_URL?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

const isLocalDatabaseUrl = (databaseUrl: string) => {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost"
    );
  } catch {
    return false;
  }
};

const createDatabase = (): TimelineDatabase => {
  const databaseUrl = readDatabaseUrl();
  if (databaseUrl === null) {
    throw new TimelineDatabaseConfigurationError();
  }

  if (isLocalDatabaseUrl(databaseUrl)) {
    localClient = postgres(databaseUrl, { max: 1, prepare: false });
    return drizzlePostgres({
      client: localClient,
      schema,
    });
  }

  return drizzleNeon({
    client: neon(databaseUrl),
    schema,
  }) as unknown as TimelineDatabase;
};

export const isTimelineDatabaseConfigured = () => readDatabaseUrl() !== null;

export const getTimelineDatabase = () => {
  database ??= createDatabase();
  return database;
};

export const closeTimelineDatabase = async () => {
  const client = localClient;
  database = null;
  localClient = null;
  if (client !== null) {
    await client.end({ timeout: 5 });
  }
};
