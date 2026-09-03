import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import type { CodexAccountSnapshot } from "@/lib/codex/stats";

export const codexAccounts = pgTable(
  "codex_accounts",
  {
    enabled: boolean("enabled").default(true).notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
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
