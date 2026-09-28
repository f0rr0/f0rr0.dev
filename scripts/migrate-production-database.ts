import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

import {
  administrationDatabaseUrl,
  postgresConnectionOptions,
} from "../src/db/connection";
import { env } from "../src/env";
import { reportOperationalError } from "../src/lib/operational-error";

// Keep the historical lock key so overlapping old/new deployments still coordinate.
const MIGRATION_LOCK_NAME = "f0rr0.dev:drizzle-migrations";

type Environment = Pick<
  typeof env,
  "DATABASE_URL" | "DATABASE_URL_UNPOOLED" | "VERCEL" | "VERCEL_ENV"
>;

export class ProductionMigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionMigrationConfigurationError";
  }
}

export const shouldApplyProductionMigrations = (environment: Environment) => {
  if (environment.VERCEL !== "1") {
    return false;
  }
  if (
    environment.VERCEL_ENV === "preview" ||
    environment.VERCEL_ENV === "development"
  ) {
    return false;
  }
  if (environment.VERCEL_ENV !== "production") {
    throw new ProductionMigrationConfigurationError(
      "VERCEL_ENV is unavailable during a Vercel build."
    );
  }
  return true;
};

export const productionMigrationDatabaseUrl = (environment: Environment) =>
  administrationDatabaseUrl(environment);

const migrateDatabase = async (databaseUrl: string) => {
  // The lock and every migration use this same session. Closing it releases the lock.
  const client = new Client({
    ...postgresConnectionOptions(databaseUrl),
    application_name: "f0rr0.dev:migrations",
    connectionTimeoutMillis: 10_000,
  });
  client.on("error", (error) => {
    reportOperationalError("database-migration", error);
  });
  try {
    await client.connect();
    const database = drizzle(client);
    await database.execute(sql`set lock_timeout = '60s'`);
    await database.execute(
      sql`select pg_advisory_lock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))`
    );
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await client.end();
  }
};

export const applyProductionMigrations = async (
  environment: Environment = env
) => {
  if (!shouldApplyProductionMigrations(environment)) {
    process.stdout.write("Skipping production database migrations.\n");
    return;
  }

  process.stdout.write("Applying production database migrations.\n");
  await migrateDatabase(productionMigrationDatabaseUrl(environment));
};

if (import.meta.main) {
  await (process.argv.includes("--local")
    ? migrateDatabase(administrationDatabaseUrl(env))
    : applyProductionMigrations());
}
