import { setTimeout as delay } from "node:timers/promises";

import { env } from "@/env";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const MAXIMUM_INLINE_RETRY_DELAY_MS = 2000;
const MAXIMUM_GITHUB_ERROR_BODY_BYTES = 16 * 1024;
const SECONDARY_RATE_LIMIT_RETRY_MS = 60_000;
const MAXIMUM_DATE_MILLISECONDS = 8_640_000_000_000_000;

export class GitHubResponseError extends Error {
  readonly retryable: boolean;
  readonly retryAt: Date | null;
  readonly status: number;

  constructor(
    status: number,
    options: { retryable?: boolean; retryAt?: Date | null } = {}
  ) {
    super(`GitHub returned HTTP ${status}.`);
    this.name = "GitHubResponseError";
    this.retryable = options.retryable ?? false;
    this.retryAt = options.retryAt ?? null;
    this.status = status;
  }
}

// oxlint-disable-next-line eslint/max-classes-per-file -- Callers distinguish deadline exhaustion from provider failures.
export class GitHubRequestDeadlineError extends Error {
  constructor() {
    super("The GitHub request deadline was reached.");
    this.name = "GitHubRequestDeadlineError";
  }
}

const retryAtFrom = (headers: Headers, now = Date.now()) => {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter !== undefined && retryAfter !== "") {
    if (/^\d+$/.test(retryAfter)) {
      const timestamp = now + Number(retryAfter) * 1000;
      if (
        Number.isFinite(timestamp) &&
        timestamp <= MAXIMUM_DATE_MILLISECONDS
      ) {
        return new Date(timestamp);
      }
    }
    const parsed = new Date(retryAfter);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const reset = headers.get("x-ratelimit-reset")?.trim();
  if (
    headers.get("x-ratelimit-remaining") === "0" &&
    reset !== undefined &&
    /^\d+$/.test(reset)
  ) {
    const timestamp = Number(reset) * 1000;
    if (Number.isFinite(timestamp) && timestamp <= MAXIMUM_DATE_MILLISECONDS) {
      return new Date(timestamp);
    }
  }
  return null;
};

const readBoundedResponseText = async (response: Response) => {
  const { body } = response.clone();
  if (body === null) {
    return null;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAXIMUM_GITHUB_ERROR_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const hasSecondaryRateLimitEvidence = async (response: Response) => {
  const text = await readBoundedResponseText(response);
  if (text === null) {
    return false;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return false;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  const documentationUrl =
    typeof record.documentation_url === "string"
      ? record.documentation_url.toLowerCase()
      : "";
  return (
    message.includes("secondary rate limit") ||
    message.includes("abuse detection") ||
    message.includes("rate limit exceeded") ||
    documentationUrl.includes("rate-limits-for-the-rest-api") ||
    documentationUrl.includes("secondary-rate-limits") ||
    documentationUrl.includes("abuse-rate-limits")
  );
};

const isRateLimited = async (response: Response) =>
  response.status === 429 ||
  (response.status === 403 &&
    (response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0" ||
      (await hasSecondaryRateLimitEvidence(response))));

const readDefaultGitHubToken = () => {
  const token = env.GITHUB_TOKEN?.trim() ?? env.GITHUB_F0RR0_TOKEN?.trim();
  return token === undefined || token.length === 0 ? null : token;
};

export const githubApiUrl = (path: string) => new URL(path, GITHUB_API_ORIGIN);

interface GitHubFetchOptions {
  body?: string;
  deadlineAt?: number;
  ifNoneMatch?: string | null;
  method?: "GET" | "POST";
  token?: string | null;
}

const isSafeHttpHeaderValue = (value: string) => {
  if (value.length === 0 || value.length > 1024) {
    return false;
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) {
      return false;
    }
  }
  return true;
};

export const githubResponseEtagFrom = (response: Response) => {
  const etag = response.headers.get("etag")?.trim() ?? null;
  return etag !== null && isSafeHttpHeaderValue(etag) ? etag : null;
};

export const githubNextPollAtFrom = (
  response: Response,
  receivedAt = Date.now()
) => {
  const value = response.headers.get("x-poll-interval")?.trim();
  if (
    value === undefined ||
    !/^\d+$/.test(value) ||
    !Number.isFinite(receivedAt) ||
    receivedAt < 0
  ) {
    throw new TypeError("GitHub returned an invalid event poll interval.");
  }
  const seconds = Number(value);
  const timestamp = receivedAt + seconds * 1000;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    !Number.isFinite(timestamp) ||
    timestamp > MAXIMUM_DATE_MILLISECONDS
  ) {
    throw new TypeError("GitHub returned an invalid event poll interval.");
  }
  return new Date(timestamp);
};

const checkedGitHubRequest = (url: URL, options: GitHubFetchOptions) => {
  if (url.origin !== GITHUB_API_ORIGIN) {
    throw new Error("Refusing to fetch a non-GitHub pagination URL.");
  }
  const method = options.method ?? "GET";
  if (
    (method === "GET" && options.body !== undefined) ||
    (method === "POST" &&
      (options.body === undefined || url.pathname !== "/graphql"))
  ) {
    throw new Error("The GitHub request method and body are invalid.");
  }
  if (
    (options.ifNoneMatch !== undefined &&
      options.ifNoneMatch !== null &&
      (method !== "GET" || !isSafeHttpHeaderValue(options.ifNoneMatch))) ||
    (options.deadlineAt !== undefined &&
      (!Number.isFinite(options.deadlineAt) || options.deadlineAt < 0))
  ) {
    throw new Error("The GitHub conditional request options are invalid.");
  }
  return method;
};

const requestTimeoutFrom = (deadlineAt: number | undefined) => {
  if (deadlineAt === undefined) {
    return REQUEST_TIMEOUT_MS;
  }
  const remaining = Math.floor(deadlineAt - Date.now());
  if (remaining <= 0) {
    throw new GitHubRequestDeadlineError();
  }
  return Math.max(1, Math.min(REQUEST_TIMEOUT_MS, remaining));
};

const waitForRetry = async (
  milliseconds: number,
  deadlineAt: number | undefined
) => {
  if (
    deadlineAt !== undefined &&
    Date.now() + Math.max(0, milliseconds) >= deadlineAt
  ) {
    throw new GitHubRequestDeadlineError();
  }
  await delay(Math.max(0, milliseconds));
};

// oxlint-disable-next-line eslint/complexity -- Retry, deadline, conditional, and rate-limit branches fail independently.
export const fetchGitHub = async (
  url: URL,
  options: GitHubFetchOptions = {}
) => {
  const method = checkedGitHubRequest(url, options);

  const token =
    options.token === undefined ? readDefaultGitHubToken() : options.token;
  for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        body: options.body,
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
          ...(options.ifNoneMatch === undefined || options.ifNoneMatch === null
            ? {}
            : { "If-None-Match": options.ifNoneMatch }),
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          "User-Agent": "f0rr0.dev",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        method,
        signal: AbortSignal.timeout(requestTimeoutFrom(options.deadlineAt)),
      });
    } catch (error) {
      if (
        options.deadlineAt !== undefined &&
        Date.now() >= options.deadlineAt
      ) {
        throw new GitHubRequestDeadlineError();
      }
      if (attempt === REQUEST_ATTEMPTS - 1) {
        throw error;
      }
      await waitForRetry(250 * 2 ** attempt, options.deadlineAt);
      continue;
    }

    if (
      response.ok ||
      (response.status === 304 &&
        options.ifNoneMatch !== undefined &&
        options.ifNoneMatch !== null)
    ) {
      return response;
    }
    if (await isRateLimited(response)) {
      const retryAt = retryAtFrom(response.headers);
      throw new GitHubResponseError(response.status, {
        retryAt:
          retryAt ?? new Date(Date.now() + SECONDARY_RATE_LIMIT_RETRY_MS),
        retryable: true,
      });
    }
    if (response.status < 500) {
      throw new GitHubResponseError(response.status);
    }
    const retryAt = retryAtFrom(response.headers);
    if (attempt === REQUEST_ATTEMPTS - 1) {
      throw new GitHubResponseError(response.status, {
        retryAt,
        retryable: true,
      });
    }
    const retryDelay =
      retryAt === null ? 250 * 2 ** attempt : retryAt.getTime() - Date.now();
    if (retryDelay > MAXIMUM_INLINE_RETRY_DELAY_MS) {
      throw new GitHubResponseError(response.status, {
        retryAt,
        retryable: true,
      });
    }
    await waitForRetry(Math.max(0, retryDelay), options.deadlineAt);
  }

  throw new Error("GitHub request retry budget exhausted.");
};

export const nextGitHubPage = (response: Response) => {
  const links = response.headers.get("link");
  if (links === null) {
    return null;
  }

  for (const part of links.split(",")) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (match?.[1] !== undefined) {
      const url = new URL(match[1]);
      if (url.origin !== GITHUB_API_ORIGIN) {
        throw new Error("GitHub returned an unsafe pagination URL.");
      }
      return url;
    }
  }

  return null;
};
