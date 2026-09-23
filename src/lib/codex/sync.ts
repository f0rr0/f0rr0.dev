import { z } from "zod";

import { tokenPreferences } from "@/content/tokens";
import {
  buildTokenDetails,
  fetchAnalytics,
  utcOffset,
} from "@/lib/codex/analytics";
import type { AnalyticsSnapshot } from "@/lib/codex/analytics";
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
  now = new Date(),
  previousAnalytics?: AnalyticsSnapshot
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
  const analytics = await fetchAnalytics(
    {
      Authorization: `Bearer ${auth.tokens.access_token}`,
      "ChatGPT-Account-Id": auth.tokens.account_id,
      "OAI-Product-Sku": "codex",
      "User-Agent": USER_AGENT,
    },
    fetcher,
    now,
    previousAnalytics
  );
  const names = [
    ...new Set([
      ...(snapshot.topInvocations
        ?.filter(({ kind }) => kind === "plugin")
        .map(({ name }) => name) ?? []),
      ...[7, 30, tokenPreferences.historyDays].flatMap(
        (days) =>
          buildTokenDetails([analytics], days, now)
            .plugins?.rows.slice(0, tokenPreferences.rankingLimit)
            .map((row) => row.name ?? row.label) ?? []
      ),
    ]),
  ];
  const logos = await fetchPluginLogos(names, auth, fetcher);
  analytics.pluginLogos = Object.fromEntries(
    names.flatMap((name) => {
      const logo = logos.get(name) ?? previousAnalytics?.pluginLogos?.[name];
      return logo ? [[name, logo]] : [];
    })
  );
  return {
    authJson: refreshed ? JSON.stringify(auth) : authJson,
    snapshot: {
      ...snapshot,
      analytics,
      topInvocations:
        snapshot.topInvocations?.map((invocation) => ({
          ...invocation,
          ...logos.get(invocation.name),
        })) ?? null,
    },
  };
};

const readUniqueCodexAccounts = async () => {
  const accounts = await readCodexAccounts();
  const identities = accounts.map(
    (account) => validateCodexAuthJson(account.authJson).tokens.account_id
  );
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      "Register each Codex account only once to avoid double-counting."
    );
  }
  return accounts;
};

export const syncCodexAccounts = async () => {
  const accounts = await readUniqueCodexAccounts();
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      const result = await fetchCodexAccountSnapshot(
        account.authJson,
        fetch,
        new Date(),
        account.snapshot?.analytics
      );
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

export const backfillCodexAccounts = async (
  since: string,
  report: (message: string) => void
) => {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (!z.iso.date().safeParse(since).success || since > end) {
    throw new Error("Provide a valid backfill start date on or before today.");
  }
  const accounts = await readUniqueCodexAccounts();
  if (!accounts.length) {
    throw new Error("No enabled Codex accounts are configured.");
  }
  let failures = 0;
  for (const account of accounts) {
    try {
      // Refresh credentials through the normal sync path, and persist rotations first.
      const result = await fetchCodexAccountSnapshot(
        account.authJson,
        fetch,
        now,
        account.snapshot?.analytics
      );
      await saveCodexAccount(account, result.authJson, result.snapshot);
      const auth = validateCodexAuthJson(result.authJson);
      const headers = {
        Authorization: `Bearer ${auth.tokens.access_token}`,
        "ChatGPT-Account-Id": auth.tokens.account_id,
        "OAI-Product-Sku": "codex",
        "User-Agent": USER_AGENT,
      };
      for (let start = since; start <= end; start = utcOffset(start, 365)) {
        const last = utcOffset(start, 364);
        const range = { start, end: last < end ? last : end };
        const analytics = await fetchAnalytics(
          headers,
          fetch,
          now,
          {},
          tokenPreferences,
          range
        );
        await saveCodexAccount(
          { ...account, authJson: result.authJson },
          result.authJson,
          { ...result.snapshot, analytics }
        );
        report(
          JSON.stringify({
            account: account.id,
            ...range,
            sources: Object.fromEntries(
              (["activity", "delegation", "plugins", "skills"] as const).map(
                (key) => [
                  key,
                  {
                    days: analytics[key]?.response.data.length ?? 0,
                    firstDay: analytics[key]?.response.data[0]?.date ?? null,
                  },
                ]
              )
            ),
          })
        );
      }
    } catch (error) {
      failures += 1;
      report(
        `${account.id}: ${error instanceof Error ? error.message : "Backfill failed"}`
      );
    }
  }
  if (failures) {
    throw new Error(
      `${failures} account backfill(s) failed. Saved history is retained; rerun to retry.`
    );
  }
  return { updated: accounts.length };
};
