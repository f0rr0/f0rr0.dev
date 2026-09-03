import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { validateCodexAuthJson } from "@/lib/codex/stats";

const [id, rawLabel, codexHome] = process.argv.slice(2);
if (id === undefined || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id)) {
  throw new Error(
    "Usage: bun run codex:account <id> <public-label> <codex-home>"
  );
}
const label = rawLabel?.trim();
if (label === undefined || label.length === 0 || label.length > 80) {
  throw new Error("Public label must contain 1–80 characters.");
}
if (codexHome === undefined) {
  throw new Error("A dedicated Codex home is required.");
}

const databaseUrl = [
  process.env.DATABASE_URL_UNPOOLED?.trim(),
  process.env.DATABASE_URL?.trim(),
].find((value): value is string => value !== undefined && value.length > 0);
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
}

const authJson = await readFile(path.resolve(codexHome, "auth.json"), "utf-8");
validateCodexAuthJson(authJson);
const secretName = `codex_auth_${id}`;
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql`create schema if not exists vault`;
  await sql`create extension if not exists supabase_vault with schema vault`;
  const [secret] = await sql<{ id: string }[]>`
    select id::text from vault.secrets where name = ${secretName} limit 1
  `;
  await (secret === undefined
    ? sql`
        select vault.create_secret(
          ${authJson},
          ${secretName},
          'Codex usage dashboard credentials'
        )
      `
    : sql`
        select vault.update_secret(
          ${secret.id}::uuid,
          ${authJson},
          ${secretName},
          'Codex usage dashboard credentials'
        )
      `);

  await sql`
    insert into codex_accounts (id, public_label, auth_secret_name, enabled)
    values (${id}, ${label}, ${secretName}, true)
    on conflict (id) do update set
      public_label = excluded.public_label,
      auth_secret_name = excluded.auth_secret_name,
      enabled = true,
      snapshot = null,
      snapshot_at = null,
      last_error_code = null,
      sync_lease_token = null,
      sync_lease_until = null
  `;
  process.stdout.write(`Configured Codex stats account ${id}.\n`);
} finally {
  await sql.end({ timeout: 5 });
}
