import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { CodexUsageDay } from "@/lib/codex/daily-history";
import type { CodexAccountSnapshot } from "@/lib/codex/stats";

export const codexAccounts = pgTable(
  "codex_accounts",
  {
    enabled: boolean("enabled").default(true).notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
    providerAccountId: varchar("provider_account_id", { length: 200 }).unique(),
    syncToken: uuid("sync_token"),
    syncUntil: timestamp("sync_until", { withTimezone: true, mode: "date" }),
    snapshot: jsonb("snapshot").$type<CodexAccountSnapshot>(),
    snapshotAt: timestamp("snapshot_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      "codex_accounts_id_shape",
      sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`
    ),
    check(
      "codex_accounts_snapshot_pair",
      sql`(${table.snapshot} IS NULL) = (${table.snapshotAt} IS NULL)`
    ),
    check(
      "codex_accounts_snapshot_object",
      sql`${table.snapshot} IS NULL OR jsonb_typeof(${table.snapshot}) = 'object'`
    ),
  ]
).enableRLS();

export const codexUsageDays = pgTable(
  "codex_usage_days",
  {
    accountId: varchar("account_id", { length: 64 })
      .notNull()
      .references(() => codexAccounts.id),
    day: date("day").notNull(),
    payload: jsonb("payload").$type<CodexUsageDay>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.day] })]
).enableRLS();
