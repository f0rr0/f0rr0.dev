import { expect, test } from "bun:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import * as codexSchema from "../src/db/codex-schema";
import * as githubSchema from "../src/db/schema";

test("all application tables enable row-level security", () => {
  for (const table of Object.values({ ...codexSchema, ...githubSchema })) {
    expect(getTableConfig(table).enableRLS).toBe(true);
  }
});
