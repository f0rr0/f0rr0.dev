import { expect, test } from "bun:test";

import { databaseConnectionUrl } from "../src/db/client";

test("Postgres.js uses Supabase session pooling without changing credentials or other endpoints", () => {
  const transaction =
    "postgresql://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require";
  const session = transaction.replace(":6543/", ":5432/");
  expect(databaseConnectionUrl(transaction)).toBe(session);
  for (const url of [
    session,
    "postgresql://user:password@db.project.supabase.co:5432/postgres",
    "postgresql://user:password@localhost:6543/postgres",
    "postgresql://user:password@pooler.supabase.com.example:6543/postgres",
  ]) {
    expect(databaseConnectionUrl(url)).toBe(url);
  }
});
