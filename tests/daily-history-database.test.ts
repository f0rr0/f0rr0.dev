import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

// Opt-in integration test. Always creates and drops its own localhost database.
test.skipIf(process.env.TEST_DATABASE_URL === undefined)(
  "daily history migration, leases, summary pinning and retention",
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
    const admin = postgres(url.toString(), { max: 1 });
    const name = `daily_history_${randomUUID().replaceAll("-", "")}`;
    try {
      await admin.unsafe(`create database ${name}`);
      url.pathname = `/${name}`;
      const child = Bun.spawn(
        [process.execPath, "scripts/test-daily-history-database.ts"],
        {
          cwd: new URL("..", import.meta.url).pathname,
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            DATABASE_URL_UNPOOLED: url.toString(),
          },
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const [code, output, errors] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) {
        throw new Error(`${output}\n${errors}`);
      }
      expect(output).toContain("daily history database checks passed");
    } finally {
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    }
  },
  60_000
);
