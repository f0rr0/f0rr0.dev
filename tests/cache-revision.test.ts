import { expect, test } from "bun:test";
import assert from "node:assert/strict";

import { readPublicSnapshot } from "../src/lib/public-snapshot";

test("snapshot reads preserve results and failures and bound a stalled database", async () => {
  expect(await readPublicSnapshot(async () => "42")).toBe("42");
  const failure = new Error("database unavailable");
  await assert.rejects(
    readPublicSnapshot(async () => {
      throw failure;
    }),
    failure
  );
  const start = performance.now();
  let complete: ((value: string) => void) | undefined;
  // oxlint-disable-next-line promise/avoid-new -- Control the late completion after a timeout.
  const stalled = new Promise<string>((resolve) => {
    complete = resolve;
  });
  await assert.rejects(
    readPublicSnapshot(async () => await stalled),
    /timed out/u
  );
  expect(performance.now() - start).toBeLessThan(2000);
  complete?.("late revision");
});
