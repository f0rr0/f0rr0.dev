import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import {
  decodeGitHubActivityCursor,
  encodeGitHubActivityCursor,
} from "../src/lib/github-activity-cursor.ts";

const secret = "cursor-test-secret-with-at-least-32-characters";
const otherSecret = "different-test-secret-with-at-least-32-chars";

const signed = (value) => {
  const payload = Buffer.from(JSON.stringify(value), "utf-8").toString(
    "base64url"
  );
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
};

describe("GitHub activity cursor", () => {
  test("round-trips a whole-day cursor bound to one ordering revision", () => {
    const cursor = {
      beforeDay: "2026-08-28",
      orderingRevision: "42",
      version: 2,
    };

    expect(
      decodeGitHubActivityCursor(
        encodeGitHubActivityCursor(cursor, secret),
        secret
      )
    ).toEqual(cursor);
  });

  test("rejects tampering and signatures from another capability", () => {
    const encoded = encodeGitHubActivityCursor(
      { beforeDay: "2026-08-28", orderingRevision: "42", version: 2 },
      secret
    );
    const [payload, signature] = encoded.split(".");
    const tampered = `${payload?.replace(/^./u, payload.startsWith("e") ? "f" : "e")}.${signature}`;

    expect(() => decodeGitHubActivityCursor(tampered, secret)).toThrow(
      TypeError
    );
    expect(() => decodeGitHubActivityCursor(encoded, otherSecret)).toThrow(
      TypeError
    );
  });

  test("rejects legacy, extensible, and non-canonical cursor payloads", () => {
    expect(() =>
      decodeGitHubActivityCursor(
        signed({
          beforeDay: "2026-08-28",
          snapshotAt: "2026-08-29T00:00:00.000Z",
          version: 1,
        }),
        secret
      )
    ).toThrow(TypeError);
    expect(() =>
      decodeGitHubActivityCursor(
        signed({
          beforeDay: "2026-08-28",
          orderingRevision: "042",
          version: 2,
        }),
        secret
      )
    ).toThrow(TypeError);
    expect(() =>
      decodeGitHubActivityCursor(
        signed({
          beforeDay: "2026-08-28",
          extra: true,
          orderingRevision: "42",
          version: 2,
        }),
        secret
      )
    ).toThrow(TypeError);
  });
});
