import { setTimeout as delay } from "node:timers/promises";

import { env } from "@/env";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const MAXIMUM_INLINE_RETRY_DELAY_MS = 2000;

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

const retryAtFrom = (headers: Headers, now = Date.now()) => {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter !== undefined && retryAfter !== "") {
    if (/^\d+$/.test(retryAfter)) {
      const timestamp = now + Number(retryAfter) * 1000;
      if (Number.isFinite(timestamp) && timestamp <= 8_640_000_000_000_000) {
        return new Date(timestamp);
      }
    }
    const parsed = new Date(retryAfter);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const reset = headers.get("x-ratelimit-reset")?.trim();
  if (reset !== undefined && /^\d+$/.test(reset)) {
    const timestamp = Number(reset) * 1000;
    if (Number.isFinite(timestamp) && timestamp <= 8_640_000_000_000_000) {
      return new Date(timestamp);
    }
  }
  return null;
};

const isRateLimited = (response: Response) =>
  response.status === 429 ||
  (response.status === 403 &&
    (response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0"));

const readDefaultGitHubToken = () => {
  const token = env.GITHUB_TOKEN?.trim() ?? env.GITHUB_F0RR0_TOKEN?.trim();
  return token === undefined || token.length === 0 ? null : token;
};

export const githubApiUrl = (path: string) => new URL(path, GITHUB_API_ORIGIN);

interface GitHubFetchOptions {
  body?: string;
  method?: "GET" | "POST";
  token?: string | null;
}

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
  return method;
};

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
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          "User-Agent": "f0rr0.dev",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === REQUEST_ATTEMPTS - 1) {
        throw error;
      }
      await delay(250 * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      return response;
    }
    if (isRateLimited(response)) {
      throw new GitHubResponseError(response.status, {
        retryAt: retryAtFrom(response.headers),
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
    await delay(Math.max(0, retryDelay));
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
