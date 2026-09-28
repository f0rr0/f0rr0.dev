import { expect, test } from "bun:test";

import { supabaseCronDatabaseUrlFrom } from "../scripts/configure-supabase-cron";
import {
  administrationDatabaseUrl,
  runtimeDatabaseUrl,
} from "../src/db/connection";

const transaction =
  "postgresql://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require";
const session = transaction.replace(":6543/", ":5432/");

test("runtime preserves the supplied transaction URL and rejects Supabase session connections", () => {
  expect(runtimeDatabaseUrl(transaction)).toBe(transaction);
  expect(() => runtimeDatabaseUrl(session)).toThrow("transaction pooler");
  expect(() =>
    runtimeDatabaseUrl(
      "postgresql://postgres:secret@db.project.supabase.co:5432/postgres"
    )
  ).toThrow("transaction pooler");
  expect(
    runtimeDatabaseUrl("postgresql://user:secret@localhost:5432/test")
  ).toBe("postgresql://user:secret@localhost:5432/test");
});

test("all administration requires an explicit session-capable URL without rewriting credentials or ports", () => {
  for (const read of [administrationDatabaseUrl, supabaseCronDatabaseUrlFrom]) {
    expect(read({ DATABASE_URL_UNPOOLED: session })).toBe(session);
    expect(() => read({ DATABASE_URL_UNPOOLED: transaction })).toThrow(
      "direct connection or session pooler"
    );
    for (const value of [
      undefined,
      "",
      "   ",
      "not-a-url",
      "https://secret@example.com",
    ]) {
      expect(() => read({ DATABASE_URL_UNPOOLED: value })).toThrow();
    }
  }
  expect(() => runtimeDatabaseUrl("https://secret@example.com")).toThrow(
    "must use PostgreSQL"
  );
});
