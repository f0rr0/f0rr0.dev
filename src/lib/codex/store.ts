import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { codexAccounts } from "@/db/codex-schema";
import { mergeAnalyticsSnapshots } from "@/lib/codex/analytics";
import type { CodexAccountSnapshot, CodexUsageBucket } from "@/lib/codex/stats";

const AUTH_SECRET_PREFIX = "codex_auth_";
const VAULT_DESCRIPTION = "Codex usage dashboard credentials";

export interface StoredCodexAccount {
  authJson: string;
  id: string;
  snapshot?: CodexAccountSnapshot | null;
}

export const codexAuthSecretName = (id: string) => `${AUTH_SECRET_PREFIX}${id}`;

export const readCodexAccounts = async (): Promise<
  readonly StoredCodexAccount[]
> => {
  const rows = await getDatabase().execute<{
    authJson: string | null;
    id: string;
    snapshot: CodexAccountSnapshot | null;
  }>(sql`
    select
      account.id,
      account.snapshot,
      secret.decrypted_secret as "authJson"
    from ${codexAccounts} as account
    left join vault.decrypted_secrets as secret
      on secret.name = ${AUTH_SECRET_PREFIX} || account.id
    where account.enabled
  `);
  return rows.map(({ authJson, id, snapshot }) => {
    if (authJson === null) {
      throw new Error(`Codex auth secret is missing for ${id}.`);
    }
    return { authJson, id, snapshot };
  });
};

const mergeBuckets = (
  old: readonly CodexUsageBucket[] | null | undefined,
  next: readonly CodexUsageBucket[] | null
) =>
  old || next
    ? [
        ...new Map(
          [...(old ?? []), ...(next ?? [])].map((row) => [row.startDate, row])
        ).values(),
      ].toSorted((a, b) => a.startDate.localeCompare(b.startDate))
    : null;

export const mergeCodexSnapshots = (
  previous: CodexAccountSnapshot | null | undefined,
  snapshot: CodexAccountSnapshot
): CodexAccountSnapshot => ({
  ...snapshot,
  dailyUsageBuckets: mergeBuckets(
    previous?.dailyUsageBuckets,
    snapshot.dailyUsageBuckets
  ),
  cumulativeDailyUsageBuckets: mergeBuckets(
    previous?.cumulativeDailyUsageBuckets,
    snapshot.cumulativeDailyUsageBuckets
  ),
  analytics: mergeAnalyticsSnapshots(
    previous?.analytics ?? {},
    snapshot.analytics ?? {}
  ),
});

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

    const [current] = await transaction
      .select({ snapshot: codexAccounts.snapshot })
      .from(codexAccounts)
      .where(eq(codexAccounts.id, account.id))
      .for("update");
    const previous = current?.snapshot;
    const preserved = mergeCodexSnapshots(previous, snapshot);
    const [updated] = await transaction
      .update(codexAccounts)
      .set({ snapshot: preserved, snapshotAt: new Date() })
      .where(eq(codexAccounts.id, account.id))
      .returning({ id: codexAccounts.id });
    if (updated === undefined) {
      throw new Error(`Codex account ${account.id} is missing.`);
    }
  });
};
