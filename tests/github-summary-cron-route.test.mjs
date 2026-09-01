import { describe, expect, test } from "bun:test";

import { POST } from "../src/app/api/cron/github-summary/route.ts";

describe("GitHub summary cron route", () => {
  test("rejects an unauthenticated invocation before running summary work", async () => {
    const response = await POST(
      new Request("https://f0rr0.dev/api/cron/github-summary", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
  });
});
