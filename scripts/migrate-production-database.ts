import { spawn } from "node:child_process";
import { once } from "node:events";

import postgres from "postgres";

const MIGRATION_LOCK_NAME = "f0rr0.dev:drizzle-migrations";

type Environment = Readonly<Record<string, string | undefined>>;

export class ProductionMigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionMigrationConfigurationError";
  }
}

const configuredValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
};

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

export const productionMigrationDatabaseUrl = (environment: Environment) => {
  const configured =
    configuredValue(environment.DATABASE_URL_UNPOOLED) ??
    configuredValue(environment.POSTGRES_URL_NON_POOLING) ??
    configuredValue(environment.DATABASE_URL);
  if (configured === null) {
    throw new ProductionMigrationConfigurationError(
      "A production database URL is not configured in Vercel."
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ProductionMigrationConfigurationError(
      "The production database URL is invalid."
    );
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new ProductionMigrationConfigurationError(
      "The production database URL must use PostgreSQL."
    );
  }

  if (url.port === "6543") {
    if (!url.hostname.endsWith(".pooler.supabase.com")) {
      throw new ProductionMigrationConfigurationError(
        "A transaction-pooler database URL cannot run migrations."
      );
    }
    url.port = "5432";
  }
  return url.toString();
};

const runDrizzleMigrations = async (databaseUrl: string) => {
  const migrationProcess = spawn(process.execPath, ["run", "db:migrate"], {
    env: {
      ...process.env,
      DATABASE_URL_UNPOOLED: databaseUrl,
    },
    stdio: "inherit",
  });
  const [code, signal] = (await once(migrationProcess, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];
  if (signal !== null) {
    throw new Error(`Database migration received signal ${signal}.`);
  }
  const exitCode = code ?? 1;
  if (exitCode !== 0) {
    throw new Error(`Database migration exited with code ${String(exitCode)}.`);
  }
};

export const applyProductionMigrations = async (
  environment: Environment = process.env
) => {
  if (!shouldApplyProductionMigrations(environment)) {
    process.stdout.write("Skipping production database migrations.\n");
    return;
  }

  const databaseUrl = productionMigrationDatabaseUrl(environment);
  const lockConnection = postgres(databaseUrl, {
    connect_timeout: 10,
    max: 1,
    prepare: false,
  });
  let locked = false;
  try {
    process.stdout.write("Applying production database migrations.\n");
    await lockConnection`
      select pg_advisory_lock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))
    `;
    locked = true;
    await runDrizzleMigrations(databaseUrl);
  } finally {
    if (locked) {
      await lockConnection`
        select pg_advisory_unlock(hashtextextended(${MIGRATION_LOCK_NAME}, 0))
      `;
    }
    await lockConnection.end({ timeout: 5 });
  }
};

if (import.meta.main) {
  await applyProductionMigrations();
}
