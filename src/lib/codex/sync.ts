import { z } from "zod";

import {
  createCodexAccountSnapshot,
  validateCodexAuthJson,
} from "@/lib/codex/stats";
import { readCodexAccounts, saveCodexAccount } from "@/lib/codex/store";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const PLUGIN_SEARCH_URL = "https://chatgpt.com/backend-api/ps/plugins/search";
const PROFILE_URL = "https://chatgpt.com/backend-api/wham/profiles/me";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const USER_AGENT = "codex-cli/1.0.0";
const TIMEOUT_MS = 10_000;

const refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
});
const pluginSearchResponseSchema = z.object({
  plugins: z.array(
    z.object({
      name: z.string(),
      release: z
        .object({
          interface: z
            .object({
              logo_url: z.string().max(2048).nullish(),
              logo_url_dark: z.string().max(2048).nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
  ),
});

type CodexAuth = ReturnType<typeof validateCodexAuthJson>;
type Fetch = typeof globalThis.fetch;

const openAiLogoUrl = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }
  const url = URL.parse(value);
  return url?.protocol === "https:" && url.hostname === "files.openai.com"
    ? url.toString()
    : null;
};

const fetchPluginLogos = async (
  names: readonly string[],
  auth: CodexAuth,
  fetcher: Fetch
) => {
  const headers = {
    Authorization: `Bearer ${auth.tokens.access_token}`,
    "ChatGPT-Account-Id": auth.tokens.account_id,
    "OAI-Product-Sku": "codex",
    "User-Agent": USER_AGENT,
  };
  const results = await Promise.all(
    [...new Set(names)].map(async (name) => {
      const url = new URL(PLUGIN_SEARCH_URL);
      url.searchParams.set("q", name);
      url.searchParams.set("scope", "GLOBAL");
      url.searchParams.set("limit", "5");
      try {
        const response = await fetcher(url, {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          return null;
        }
        const parsed = pluginSearchResponseSchema.safeParse(
          await response.json()
        );
        const plugin = parsed.success
          ? parsed.data.plugins.find((candidate) => candidate.name === name)
          : undefined;
        const logoUrl = openAiLogoUrl(plugin?.release?.interface?.logo_url);
        const logoUrlDark = openAiLogoUrl(
          plugin?.release?.interface?.logo_url_dark
        );
        const preferredLogoUrl = logoUrl ?? logoUrlDark;
        return preferredLogoUrl === null
          ? null
          : ([
              name,
              {
                logoUrl: preferredLogoUrl,
                ...(logoUrlDark === null ? {} : { logoUrlDark }),
              },
            ] as const);
      } catch {
        return null;
      }
    })
  );
  return new Map(results.filter((result) => result !== null));
};

const fetchSections = async (auth: CodexAuth, fetcher: Fetch) => {
  const headers = {
    Authorization: `Bearer ${auth.tokens.access_token}`,
    "ChatGPT-Account-Id": auth.tokens.account_id,
    "User-Agent": USER_AGENT,
  };
  const [usage, profile] = await Promise.all([
    fetcher(USAGE_URL, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    fetcher(PROFILE_URL, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  ]);
  return { profile, usage };
};

const refreshAuth = async (auth: CodexAuth, fetcher: Fetch, now: Date) => {
  const response = await fetcher(TOKEN_URL, {
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: auth.tokens.refresh_token,
    }),
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Codex token refresh failed (${String(response.status)}).`);
  }
  const tokens = refreshResponseSchema.parse(await response.json());
  return {
    ...auth,
    last_refresh: now.toISOString(),
    tokens: {
      ...auth.tokens,
      access_token: tokens.access_token,
      id_token: tokens.id_token ?? auth.tokens.id_token,
      refresh_token: tokens.refresh_token ?? auth.tokens.refresh_token,
    },
  };
};

export const fetchCodexAccountSnapshot = async (
  authJson: string,
  fetcher: Fetch = fetch,
  now = new Date()
) => {
  let auth = validateCodexAuthJson(authJson);
  let responses = await fetchSections(auth, fetcher);
  let refreshed = false;
  if (responses.usage.status === 401 || responses.profile.status === 401) {
    auth = await refreshAuth(auth, fetcher, now);
    refreshed = true;
    responses = await fetchSections(auth, fetcher);
  }
  if (!responses.usage.ok || !responses.profile.ok) {
    throw new Error(
      `Codex usage request failed (${String(responses.usage.status)}/${String(responses.profile.status)}).`
    );
  }
  const [usage, profile] = await Promise.all([
    responses.usage.json(),
    responses.profile.json(),
  ]);
  const snapshot = createCodexAccountSnapshot(profile, usage);
  const logos = await fetchPluginLogos(
    snapshot.topInvocations
      ?.filter(({ kind }) => kind === "plugin")
      .map(({ name }) => name) ?? [],
    auth,
    fetcher
  );
  return {
    authJson: refreshed ? JSON.stringify(auth) : authJson,
    snapshot: {
      ...snapshot,
      topInvocations:
        snapshot.topInvocations?.map((invocation) => ({
          ...invocation,
          ...logos.get(invocation.name),
        })) ?? null,
    },
  };
};

export const syncCodexAccounts = async () => {
  const accounts = await readCodexAccounts();
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const result = await fetchCodexAccountSnapshot(account.authJson);
      await saveCodexAccount(account, result.authJson, result.snapshot);
    })
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failed !== undefined) {
    throw failed.reason;
  }
  return { updated: accounts.length };
};
