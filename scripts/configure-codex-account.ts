import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { validateCodexAuthJson } from "@/lib/codex/stats";

const [id, codexHome] = process.argv.slice(2);
if (id === undefined || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id)) {
  throw new Error("Usage: bun run codex:account <id> <codex-home>");
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
const providerAccountId = validateCodexAuthJson(authJson).tokens.account_id;
const secretName = `codex_auth_${id}`;
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql`create schema if not exists vault`;
  await sql`create extension if not exists supabase_vault with schema vault`;
  await sql.begin(async (transaction) => {
    // Account identity and credentials change atomically. A reauthorization never clears history.
    const [account] = await transaction<
      {
        provider_account_id: string | null;
        sync_until: Date | null;
        has_history: boolean;
      }[]
    >`
      select provider_account_id, sync_until,
        snapshot is not null or exists (select 1 from codex_usage_days where account_id = ${id}) as has_history
      from codex_accounts where id = ${id} for update
    `;
    if (
      account?.sync_until !== undefined &&
      account.sync_until !== null &&
      new Date(account.sync_until).getTime() > Date.now()
    ) {
      throw new Error(
        "A sync is running. Retry account configuration after it finishes."
      );
    }
    const [secret] = await transaction<
      { id: string; decrypted_secret: string }[]
    >`
      select id::text, decrypted_secret from vault.decrypted_secrets where name = ${secretName}
    `;
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
    await transaction`
      insert into codex_accounts (id, enabled, provider_account_id)
      values (${id}, true, ${providerAccountId})
      on conflict (id) do update set enabled = true, provider_account_id = excluded.provider_account_id
    `;
    await (secret === undefined
      ? transaction`select vault.create_secret(${authJson}, ${secretName}, 'Codex usage dashboard credentials')`
      : transaction`select vault.update_secret(${secret.id}::uuid, ${authJson}, ${secretName}, 'Codex usage dashboard credentials')`);
  });

  process.stdout.write(`Configured Codex stats account ${id}.\n`);
} finally {
  await sql.end({ timeout: 5 });
}
