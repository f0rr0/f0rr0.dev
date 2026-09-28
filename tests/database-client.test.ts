import { expect, test } from "bun:test";
import { X509Certificate } from "node:crypto";

import { Client } from "pg";

import {
  administrationDatabaseUrl,
  postgresConnectionOptions,
  runtimeDatabaseUrl,
} from "../src/db/connection";

const transaction =
  "postgresql://postgres.project:p%40ss@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require";
const session = transaction.replace(":6543/", ":5432/");

test("pg keeps the Supabase CA and hostname verification after parsing the connection URL", () => {
  for (const url of [
    transaction,
    session,
    session.replace("sslmode=require", "sslmode=verify-full"),
  ]) {
    const options = postgresConnectionOptions(url);
    const client = new Client(options);
    expect(client.host).toBe("aws-0-region.pooler.supabase.com");
    expect(client.password).toBe("p@ss");
    expect(client.ssl as unknown).toEqual(options.ssl);
    expect(options.ssl?.rejectUnauthorized).toBe(true);
    if (!options.ssl) {
      throw new Error("Missing Supabase CA");
    }
    const certificate = new X509Certificate(options.ssl.ca);
    expect(certificate.ca).toBe(true);
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"
    );
  }
  for (const url of [
    "postgresql://user:secret@localhost:5432/test",
    transaction.replace(
      ".pooler.supabase.com",
      ".pooler.supabase.com.example.org"
    ),
    ...["ssl", "sslrootcert", "sslcert", "sslkey", "sslnegotiation"].map(
      (key) => `${transaction}&${key}=custom`
    ),
  ]) {
    expect(postgresConnectionOptions(url)).toEqual({ connectionString: url });
  }
});

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
  expect(administrationDatabaseUrl({ DATABASE_URL_UNPOOLED: session })).toBe(
    session
  );
  expect(() =>
    administrationDatabaseUrl({ DATABASE_URL_UNPOOLED: transaction })
  ).toThrow("direct connection or session pooler");
  for (const value of [
    undefined,
    "",
    "   ",
    "not-a-url",
    "https://secret@example.com",
  ]) {
    expect(() =>
      administrationDatabaseUrl({ DATABASE_URL_UNPOOLED: value })
    ).toThrow();
  }
  expect(() => runtimeDatabaseUrl("https://secret@example.com")).toThrow(
    "must use PostgreSQL"
  );
});
