import { describe, expect, test } from "bun:test";

import {
  ProductionMigrationConfigurationError,
  productionMigrationDatabaseUrl,
  shouldApplyProductionMigrations,
} from "../scripts/migrate-production-database.ts";

describe("production migration environment", () => {
  test("runs only for Vercel production deployments", () => {
    expect(
      shouldApplyProductionMigrations({
        VERCEL: "1",
        VERCEL_ENV: "production",
      })
    ).toBe(true);
    expect(shouldApplyProductionMigrations({})).toBe(false);
    expect(
      shouldApplyProductionMigrations({
        VERCEL: "1",
        VERCEL_ENV: "preview",
      })
    ).toBe(false);
  });
});

describe("production migration database URL", () => {
  test("prefers an explicitly non-pooling URL", () => {
    expect(
      productionMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://fallback:secret@runtime.example:6543/db",
        DATABASE_URL_UNPOOLED:
          "postgresql://primary:secret@db.example:5432/postgres",
      })
    ).toBe("postgresql://primary:secret@db.example:5432/postgres");
  });

  test("turns a synced Supabase transaction URL into its session URL", () => {
    expect(
      productionMigrationDatabaseUrl({
        DATABASE_URL:
          "postgresql://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require",
      })
    ).toBe(
      "postgresql://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require"
    );
  });

  test("rejects an unknown transaction pooler", () => {
    expect(() =>
      productionMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://user:secret@database.example:6543/db",
      })
    ).toThrow(ProductionMigrationConfigurationError);
  });
});
