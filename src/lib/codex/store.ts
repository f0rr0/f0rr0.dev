import { randomUUID } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { codexAccounts, codexUsageDays } from "@/db/codex-schema";
import {
  liveCodexSnapshot,
  mergeCodexDay,
  mutableCodexStart,
  partitionCodexHistory,
  restoreCodexHistory,
} from "@/lib/codex/daily-history";
import { validateCodexAuthJson } from "@/lib/codex/stats";
import type { CodexAccountSnapshot } from "@/lib/codex/stats";

const AUTH_SECRET_PREFIX = "codex_auth_";
const VAULT_DESCRIPTION = "Codex usage dashboard credentials";

export interface StoredCodexAccount {
  authJson: string;
  id: string;
  syncToken?: string;
  snapshot?: CodexAccountSnapshot | null;
}

export const codexAuthSecretName = (id: string) => `${AUTH_SECRET_PREFIX}${id}`;

export const readCodexAccountIds = async () =>
  await getDatabase()
    .select({ id: codexAccounts.id })
    .from(codexAccounts)
    .where(eq(codexAccounts.enabled, true));

// A lease is acquired before reading credentials or contacting the provider.
export const claimCodexAccount = async (
  id: string
): Promise<StoredCodexAccount | null> => {
  const syncToken = randomUUID();
  return await getDatabase().transaction(async (transaction) => {
    const [row] = await transaction.execute<{
      id: string;
      snapshot: CodexAccountSnapshot | null;
      authJson: string;
    }>(sql`
      update ${codexAccounts} as account
      set sync_token = ${syncToken}::uuid, sync_until = clock_timestamp() + interval '5 minutes'
      where account.id = ${id} and account.enabled
        and (account.sync_until is null or account.sync_until < clock_timestamp())
      returning account.id, account.snapshot,
        (select decrypted_secret from vault.decrypted_secrets where name = ${AUTH_SECRET_PREFIX} || account.id) as "authJson"
    `);
    if (row === undefined) {
      return null;
    }
    if (!row.authJson) {
      throw new Error(`Codex auth secret is missing for ${id}.`);
    }
    const providerAccountId = validateCodexAuthJson(row.authJson).tokens
      .account_id;
    const [identity] = await transaction
      .update(codexAccounts)
      .set({ providerAccountId })
      .where(
        and(
          eq(codexAccounts.id, id),
          sql`(${codexAccounts.providerAccountId} is null or ${codexAccounts.providerAccountId} = ${providerAccountId})`
        )
      )
      .returning({ id: codexAccounts.id });
    if (identity === undefined) {
      throw new Error(`Codex account identity changed for ${id}.`);
    }
    const days = await transaction
      .select({ payload: codexUsageDays.payload })
      .from(codexUsageDays)
      .where(
        and(
          eq(codexUsageDays.accountId, id),
          gte(codexUsageDays.day, mutableCodexStart(new Date()))
        )
      );
    return {
      ...row,
      syncToken,
      snapshot: row.snapshot
        ? restoreCodexHistory(
            row.snapshot,
            days.map((day) => day.payload)
          )
        : null,
    };
  });
};

export const releaseCodexAccount = async (account: StoredCodexAccount) => {
  if (account.syncToken === undefined) {
    return;
  }
  await getDatabase()
    .update(codexAccounts)
    .set({ syncToken: null, syncUntil: null })
    .where(
      and(
        eq(codexAccounts.id, account.id),
        eq(codexAccounts.syncToken, account.syncToken)
      )
    );
};

export const saveCodexAccount = async (
  account: StoredCodexAccount,
  authJson: string,
  snapshot: CodexAccountSnapshot
) => {
  await getDatabase().transaction(async (transaction) => {
    if (account.syncToken === undefined) {
      throw new Error("Codex sync requires an account lease.");
    }
    const [current] = await transaction
      .select({ id: codexAccounts.id })
      .from(codexAccounts)
      .where(
        and(
          eq(codexAccounts.id, account.id),
          eq(codexAccounts.syncToken, account.syncToken),
          sql`${codexAccounts.syncUntil} > clock_timestamp()`
        )
      )
      .for("update");
    if (current === undefined) {
      throw new Error(`Codex sync lease expired for ${account.id}.`);
    }
    if (authJson !== account.authJson) {
      const updated = await transaction.execute<{ id: string }>(sql`
        select vault.update_secret(
          secret.id,
          ${authJson},
          secret.name,
          ${VAULT_DESCRIPTION}
        ) as id
        from vault.secrets as secret
        where secret.name = ${codexAuthSecretName(account.id)}
      `);
      if (updated.length !== 1) {
        throw new Error(`Codex auth secret is missing for ${account.id}.`);
      }
    }

    const now = new Date();
    const mutableStart = mutableCodexStart(now);
    const previousDays = await transaction
      .select()
      .from(codexUsageDays)
      .where(
        and(
          eq(codexUsageDays.accountId, account.id),
          gte(codexUsageDays.day, mutableStart)
        )
      );
    const previous = new Map(previousDays.map((row) => [row.day, row.payload]));
    const days = [...partitionCodexHistory(snapshot)].filter(
      ([day]) => day <= now.toISOString().slice(0, 10)
    );
    // Explicit backfills may fill missing days; an already closed day never changes.
    for (const [day, payload] of days) {
      await transaction
        .insert(codexUsageDays)
        .values({
          accountId: account.id,
          day,
          payload: mergeCodexDay(previous.get(day), payload),
        })
        .onConflictDoUpdate({
          target: [codexUsageDays.accountId, codexUsageDays.day],
          set: {
            payload: mergeCodexDay(previous.get(day), payload),
            recordedAt: now,
          },
          setWhere: gte(codexUsageDays.day, mutableStart),
        });
    }
    const [updated] = await transaction
      .update(codexAccounts)
      .set({
        snapshot: liveCodexSnapshot(snapshot),
        snapshotAt: now,
        syncUntil: new Date(now.getTime() + 5 * 60 * 1000),
      })
      .where(eq(codexAccounts.id, account.id))
      .returning({ id: codexAccounts.id });
    if (updated === undefined) {
      throw new Error(`Codex account ${account.id} is missing.`);
    }
  });
};
