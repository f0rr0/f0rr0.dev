import { setTimeout as delay } from "node:timers/promises";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

const readDefaultGitHubToken = () => {
  const token =
    process.env.GITHUB_TOKEN?.trim() ?? process.env.GITHUB_F0RR0_TOKEN?.trim();
  return token === undefined || token.length === 0 ? null : token;
};

export const githubApiUrl = (path: string) => new URL(path, GITHUB_API_ORIGIN);

export const fetchGitHub = async (
  url: URL,
  options: { token?: string | null } = {}
) => {
  if (url.origin !== GITHUB_API_ORIGIN) {
    throw new Error("Refusing to fetch a non-GitHub pagination URL.");
  }

  const token =
    options.token === undefined ? readDefaultGitHubToken() : options.token;
  for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
          "User-Agent": "f0rr0.dev",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
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
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    if (attempt === REQUEST_ATTEMPTS - 1) {
      throw new Error(`GitHub returned HTTP ${response.status}.`);
    }
    await delay(250 * 2 ** attempt);
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
