import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import type { CodexAccountSnapshot } from "@/lib/codex/stats";

const VAULT_DESCRIPTION = "Codex usage dashboard credentials";

export interface ClaimedCodexAccount {
  authSecretName: string;
  id: string;
  leaseToken: string;
}

export class CodexStoreError extends Error {
  readonly code: "auth_missing" | "lease_lost";

  constructor(code: "auth_missing" | "lease_lost", message: string) {
    super(message);
    this.code = code;
    this.name = "CodexStoreError";
  }
}

export const claimCodexAccounts = async (): Promise<
  readonly ClaimedCodexAccount[]
> => {
  const rows = await getDatabase().execute<{
    authSecretName: string;
    id: string;
    leaseToken: string;
  }>(sql`
    update ${codexAccounts}
    set
      last_attempt_at = now(),
      sync_lease_token = gen_random_uuid(),
      sync_lease_until = now() + interval '2 minutes'
    where
      ${codexAccounts.enabled}
      and (
        ${codexAccounts.syncLeaseUntil} is null
        or ${codexAccounts.syncLeaseUntil} < now()
      )
    returning
      ${codexAccounts.id} as "id",
      ${codexAccounts.authSecretName} as "authSecretName",
      ${codexAccounts.syncLeaseToken}::text as "leaseToken"
  `);
  return rows;
};

export const readCodexAuthSecret = async (name: string) => {
  const [row] = await getDatabase().execute<{ value: string }>(sql`
    select decrypted_secret as "value"
    from vault.decrypted_secrets
    where name = ${name}
    limit 1
  `);
  if (row === undefined) {
    throw new CodexStoreError(
      "auth_missing",
      `Codex auth secret ${name} is missing.`
    );
  }
  return row.value;
};

export const updateCodexAuthSecret = async (
  account: ClaimedCodexAccount,
  refreshedAuthJson: string
) => {
  const updated = await getDatabase().execute<{ id: string }>(sql`
    select
      account.id as "id",
      vault.update_secret(
        secret.id,
        ${refreshedAuthJson},
        secret.name,
        ${VAULT_DESCRIPTION}
      )
    from vault.secrets as secret
    join ${codexAccounts} as account
      on account.auth_secret_name = secret.name
    where
      account.id = ${account.id}
      and account.sync_lease_token = ${account.leaseToken}::uuid
  `);
  if (updated.length !== 1) {
    throw new CodexStoreError(
      "lease_lost",
      `Codex account ${account.id} lost its synchronization lease.`
    );
  }
};

export const completeCodexAccountSync = async (
  account: ClaimedCodexAccount,
  snapshot: CodexAccountSnapshot
) => {
  const [updated] = await getDatabase()
    .update(codexAccounts)
    .set({
      lastErrorCode: null,
      snapshot,
      snapshotAt: new Date(),
      syncLeaseToken: null,
      syncLeaseUntil: null,
    })
    .where(
      and(
        eq(codexAccounts.id, account.id),
        eq(codexAccounts.syncLeaseToken, account.leaseToken)
      )
    )
    .returning({ id: codexAccounts.id });
  if (updated === undefined) {
    throw new CodexStoreError(
      "lease_lost",
      `Codex account ${account.id} lost its synchronization lease.`
    );
  }
};

export const failCodexAccountSync = async (
  account: ClaimedCodexAccount,
  errorCode: string
) => {
  await getDatabase()
    .update(codexAccounts)
    .set({
      lastErrorCode: errorCode.slice(0, 64),
      syncLeaseToken: null,
      syncLeaseUntil: null,
    })
    .where(
      and(
        eq(codexAccounts.id, account.id),
        eq(codexAccounts.syncLeaseToken, account.leaseToken)
      )
    );
};
