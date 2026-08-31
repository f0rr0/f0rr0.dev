import { describe, expect, test } from "bun:test";

import { ensureGitHubEvidenceIntegrity } from "../src/lib/github-activity-worker-store.ts";

describe("GitHub evidence integrity preflight", () => {
  test("fails before opening a transaction when the backfill deadline expired", async () => {
    await expect(
      ensureGitHubEvidenceIntegrity(new Date("2026-08-30T00:00:00.000Z"), {
        deadlineAt: Date.now() - 1,
      })
    ).rejects.toThrow("deadline was reached");
  });
});
