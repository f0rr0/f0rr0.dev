import { readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

import { validateCodexAuthJson } from "@/lib/codex/stats";

import {
  administrationDatabaseUrl,
  postgresConnectionOptions,
} from "../src/db/connection";

const [id, codexHome] = process.argv.slice(2);
if (id === undefined || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id)) {
  throw new Error("Usage: bun run codex:account <id> <codex-home>");
}
if (codexHome === undefined) {
  throw new Error("A dedicated Codex home is required.");
}

const databaseUrl = administrationDatabaseUrl({
  DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
});

const authJson = await readFile(path.resolve(codexHome, "auth.json"), "utf-8");
const providerAccountId = validateCodexAuthJson(authJson).tokens.account_id;
const secretName = `codex_auth_${id}`;
const client = new Client({
  ...postgresConnectionOptions(databaseUrl),
  connectionTimeoutMillis: 10_000,
});
try {
  await client.connect();
  await client.query("create schema if not exists vault");
  await client.query(
    "create extension if not exists supabase_vault with schema vault"
  );
  await client.query("begin");
  const {
    rows: [account],
  } = await client.query<{
    provider_account_id: string | null;
    sync_until: Date | null;
    has_history: boolean;
  }>(
    `select provider_account_id, sync_until,
    snapshot is not null or exists (select 1 from codex_usage_days where account_id = $1) as has_history
    from codex_accounts where id = $1 for update`,
    [id]
  );
  if (account?.sync_until && account.sync_until.getTime() > Date.now()) {
    throw new Error(
      "A sync is running. Retry account configuration after it finishes."
    );
  }
  const {
    rows: [secret],
  } = await client.query<{ id: string; decrypted_secret: string }>(
    "select id::text, decrypted_secret from vault.decrypted_secrets where name = $1",
    [secretName]
  );
  const previousIdentity =
    account?.provider_account_id ??
    (secret === undefined
      ? null
      : validateCodexAuthJson(secret.decrypted_secret).tokens.account_id);
  if (previousIdentity === null && account?.has_history) {
    throw new Error(
      "This alias has history but its account identity cannot be verified. Use a new alias."
    );
  }
  if (previousIdentity !== null && previousIdentity !== providerAccountId) {
    throw new Error(
      "This alias belongs to a different Codex account. Use a new alias."
    );
  }
  await client.query(
    `insert into codex_accounts (id, enabled, provider_account_id) values ($1, true, $2)
    on conflict (id) do update set enabled = true, provider_account_id = excluded.provider_account_id`,
    [id, providerAccountId]
  );
  await (secret === undefined
    ? client.query("select vault.create_secret($1, $2, $3)", [
        authJson,
        secretName,
        "Codex usage dashboard credentials",
      ])
    : client.query("select vault.update_secret($1::uuid, $2, $3, $4)", [
        secret.id,
        authJson,
        secretName,
        "Codex usage dashboard credentials",
      ]));
  await client.query("commit");
  process.stdout.write(`Configured Codex stats account ${id}.\n`);
} catch (error) {
  await client.query("rollback").catch(() => {
    // Preserve the original failure if the connection cannot roll back.
  });
  throw error;
} finally {
  await client.end();
}
