import { createHmac, timingSafeEqual } from "node:crypto";

const CURSOR_MAX_LENGTH = 512;
const CURSOR_VERSION = 1;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/u;

export interface GitHubActivityCursor {
  beforeDay: string;
  snapshotAt: string;
  version: typeof CURSOR_VERSION;
}

const validUtcDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !UTC_DAY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const validIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
};

const validCursor = (value: unknown): value is GitHubActivityCursor => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === CURSOR_VERSION &&
    validUtcDay(candidate.beforeDay) &&
    validIsoDate(candidate.snapshotAt)
  );
};

const cursorSecret = (value: string | undefined) => {
  const secret = value?.trim();
  if (secret === undefined || secret.length < 32) {
    throw new TypeError("The GitHub activity cursor secret is invalid.");
  }
  return secret;
};

const signatureFor = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export const encodeGitHubActivityCursor = (
  cursor: GitHubActivityCursor,
  secret = process.env.CRON_SECRET
) => {
  if (!validCursor(cursor)) {
    throw new TypeError("The GitHub activity cursor is invalid.");
  }
  const payload = Buffer.from(JSON.stringify(cursor), "utf-8").toString(
    "base64url"
  );
  return `${payload}.${signatureFor(payload, cursorSecret(secret))}`;
};

export const decodeGitHubActivityCursor = (
  value: string | null,
  secret = process.env.CRON_SECRET
): GitHubActivityCursor | null => {
  if (value === null || value.length === 0) {
    return null;
  }
  if (value.length > CURSOR_MAX_LENGTH) {
    throw new TypeError("The GitHub activity cursor is invalid.");
  }
  try {
    const [payload, signature, extra] = value.split(".");
    if (
      payload === undefined ||
      payload.length === 0 ||
      signature === undefined ||
      signature.length === 0 ||
      extra !== undefined ||
      Buffer.from(payload, "base64url").toString("base64url") !== payload
    ) {
      throw new TypeError("The GitHub activity cursor is invalid.");
    }
    const expected = Buffer.from(
      signatureFor(payload, cursorSecret(secret)),
      "base64url"
    );
    const actual = Buffer.from(signature, "base64url");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new TypeError("The GitHub activity cursor is invalid.");
    }
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as unknown;
    if (!validCursor(decoded)) {
      throw new TypeError("The GitHub activity cursor is invalid.");
    }
    return decoded;
  } catch (error) {
    if (error instanceof TypeError) {
      throw error;
    }
    throw new TypeError("The GitHub activity cursor is invalid.", {
      cause: error,
    });
  }
};
