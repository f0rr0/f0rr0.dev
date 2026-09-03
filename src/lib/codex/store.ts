import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import type { CodexAccountSnapshot } from "@/lib/codex/stats";

const AUTH_SECRET_PREFIX = "codex_auth_";
const VAULT_DESCRIPTION = "Codex usage dashboard credentials";

export interface StoredCodexAccount {
  authJson: string;
  id: string;
}

export const codexAuthSecretName = (id: string) => `${AUTH_SECRET_PREFIX}${id}`;

export const readCodexAccounts = async (): Promise<
  readonly StoredCodexAccount[]
> => {
  const rows = await getDatabase().execute<{
    authJson: string | null;
    id: string;
  }>(sql`
    select
      account.id,
      secret.decrypted_secret as "authJson"
    from ${codexAccounts} as account
    left join vault.decrypted_secrets as secret
      on secret.name = ${AUTH_SECRET_PREFIX} || account.id
    where account.enabled
  `);
  return rows.map(({ authJson, id }) => {
    if (authJson === null) {
      throw new Error(`Codex auth secret is missing for ${id}.`);
    }
    return { authJson, id };
  });
};

export const saveCodexAccount = async (
  account: StoredCodexAccount,
  authJson: string,
  snapshot: CodexAccountSnapshot
) => {
  await getDatabase().transaction(async (transaction) => {
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

    const [updated] = await transaction
      .update(codexAccounts)
      .set({ snapshot, snapshotAt: new Date() })
      .where(eq(codexAccounts.id, account.id))
      .returning({ id: codexAccounts.id });
    if (updated === undefined) {
      throw new Error(`Codex account ${account.id} is missing.`);
    }
  });
};
