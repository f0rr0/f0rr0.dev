import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { CodexAccountSnapshot } from "@/lib/codex/stats";

export const codexAccounts = pgTable(
  "codex_accounts",
  {
    authSecretName: varchar("auth_secret_name", { length: 128 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
    lastAttemptAt: timestamp("last_attempt_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    publicLabel: varchar("public_label", { length: 80 }).notNull(),
    snapshot: jsonb("snapshot").$type<CodexAccountSnapshot>(),
    snapshotAt: timestamp("snapshot_at", {
      mode: "date",
      withTimezone: true,
    }),
    syncLeaseToken: uuid("sync_lease_token"),
    syncLeaseUntil: timestamp("sync_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("codex_accounts_auth_secret_name_unique").on(
      table.authSecretName
    ),
    check(
      "codex_accounts_id_shape",
      sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`
    ),
    check(
      "codex_accounts_auth_secret_name_shape",
      sql`${table.authSecretName} ~ '^[a-z0-9][a-z0-9_.-]{0,127}$'`
    ),
    check(
      "codex_accounts_public_label_shape",
      sql`length(btrim(${table.publicLabel})) > 0`
    ),
    check(
      "codex_accounts_snapshot_pair",
      sql`(${table.snapshot} IS NULL) = (${table.snapshotAt} IS NULL)`
    ),
    check(
      "codex_accounts_snapshot_object",
      sql`${table.snapshot} IS NULL OR jsonb_typeof(${table.snapshot}) = 'object'`
    ),
    check(
      "codex_accounts_lease_pair",
      sql`(${table.syncLeaseToken} IS NULL) = (${table.syncLeaseUntil} IS NULL)`
    ),
  ]
).enableRLS();
