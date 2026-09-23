import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { TokenUsageDetails } from "../src/components/token-details";
import { tokenPreferences } from "../src/content/tokens";
import {
  analyticsSchemas,
  buildTokenDetails,
  fetchAnalytics,
} from "../src/lib/codex/analytics";
import type { AnalyticsSnapshot } from "../src/lib/codex/analytics";
import { mockFetch } from "./helpers";

const now = new Date("2026-09-23T12:00:00Z");
const meta = {
  fetchedAt: now.toISOString(),
  start: "2026-08-25",
  end: "2026-09-23",
};
const fixture = () => ({
  activity: {
    ...meta,
    response: analyticsSchemas.activity.parse({
      private: "secret",
      data: [
        {
          date: "2026-09-22",
          totals: {
            turns: 3,
            uncached_text_input_tokens: 10,
            cached_text_input_tokens: 90,
            text_output_tokens: 5,
            credits: 999,
          },
          models: [{ model: "example-model", turns: 3 }],
          clients: [{ client_id: "CODEX_DESKTOP_APP", turns: 3 }],
        },
      ],
    }),
  },
  plugins: {
    ...meta,
    response: {
      data: [
        {
          date: "2026-09-22",
          plugin_usage_overviews: [
            { plugin_name: "private-tool", invocation_counts: 20 },
            { plugin_name: "public-tool", invocation_counts: 2 },
          ],
        },
      ],
    },
  },
  skills: { ...meta, response: { data: [] } },
});

test("combines counts and weighted cache rate while preserving privacy", () => {
  const first: AnalyticsSnapshot = fixture();
  const second = fixture();
  second.activity.response.data[0].totals.cached_text_input_tokens = 10;
  const preferences = { ...tokenPreferences, excludedTools: ["private-tool"] };
  const result = buildTokenDetails([first, second], 7, now, preferences);
  expect(result.start).toBe("2026-09-17");
  expect(result.activity?.tokens).toBe(130);
  expect(result.activity?.turns).toBe(6);
  expect(result.activity?.cacheHit).toBeCloseTo((100 / 120) * 100);
  expect(result.models?.rows).toEqual([{ label: "example-model", value: 6 }]);
  expect(result.plugins?.rows).toEqual([
    { name: "public-tool", label: "public-tool", value: 4 },
  ]);
  expect(JSON.stringify(result)).not.toContain("private-tool");
  expect(JSON.stringify(first.activity)).not.toContain("credits");
  expect(JSON.stringify(first.activity)).not.toContain("secret");
  const html = renderToStaticMarkup(
    <TokenUsageDetails stats={null} details={result} weekDetails={result} />
  );
  expect(html).toContain('id="models-title"');
  expect(html).not.toContain("Account 2");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("UTC");
  expect(html).toContain("Last 7 days");
  expect(html).not.toContain("/tokens?days=");
  expect(html).not.toContain("private-tool");
});

test("missing, zero, retained, and disabled sections stay distinct", () => {
  const partial = buildTokenDetails([fixture(), undefined], 7, now);
  expect(partial.activity?.status.partial).toBe(true);
  expect(partial.activity?.status.available).toBe(1);
  const old = fixture();
  old.activity.end = "2026-09-22";
  old.activity.fetchedAt = "2026-09-22T12:00:00Z";
  expect(buildTokenDetails([old], 7, now).activity?.status.partial).toBe(true);
  const empty = buildTokenDetails([{}], 7, now);
  expect(empty.activity?.tokens).toBeNull();
  const zero = fixture();
  zero.activity.response.data[0].totals = {
    turns: 0,
    uncached_text_input_tokens: 0,
    cached_text_input_tokens: 0,
    text_output_tokens: 0,
  };
  expect(buildTokenDetails([zero], 7, now).activity?.tokens).toBe(0);
  expect(buildTokenDetails([zero], 7, now).activity?.cacheHit).toBeNull();
  const hidden = buildTokenDetails([fixture()], 7, now, {
    ...tokenPreferences,
    sections: {
      activity: false,
      composition: false,
      models: false,
      tools: false,
      delegation: false,
      limits: false,
    },
  });
  expect(hidden.activity).toBeNull();
  expect(hidden.plugins).toBeNull();
  expect(hidden.models).toBeNull();
  expect(JSON.stringify(hidden)).not.toContain("private-tool");
  expect(
    renderToStaticMarkup(<TokenUsageDetails stats={null} details={hidden} />)
  ).not.toContain('id="breakdowns"');
  expect(
    analyticsSchemas.activity.safeParse({ data: [{ date: "not-a-date" }] })
      .success
  ).toBe(false);
});

test("missing token fields preserve turns and models without inventing zero usage", async () => {
  const missing = {
    date: "2026-09-23",
    totals: { turns: 2 },
    models: [{ model: "example-model", turns: 2 }],
  };
  const response = await fetchAnalytics(
    {},
    mockFetch(async () =>
      Response.json({
        data: [...fixture().activity.response.data, missing],
      })
    ),
    now
  );
  expect(response.activity?.response.data).toHaveLength(2);
  const mixed = buildTokenDetails([response, fixture()], 7, now);
  expect(mixed.activity?.turns).toBe(8);
  expect(mixed.models?.rows).toEqual([{ label: "example-model", value: 8 }]);
  expect(mixed.models?.status.partial).toBe(false);
  expect(mixed.activity?.tokens).toBe(210);
  expect(mixed.activity?.cacheHit).toBe(90);
  expect(mixed.activity?.status.partial).toBe(true);

  for (const tokens of [
    {},
    { cached_text_input_tokens: null },
    { text_output_tokens: 5 },
  ]) {
    const account = {
      activity: {
        ...meta,
        response: analyticsSchemas.activity.parse({
          data: [{ ...missing, totals: { turns: 2, ...tokens } }],
        }),
      },
    };
    const result = buildTokenDetails([account], 7, now);
    expect(result.activity?.turns).toBe(2);
    expect(result.activity?.tokens).toBeNull();
    expect(result.activity?.composition).toBeNull();
    expect(result.activity?.cacheHit).toBeNull();
    expect(result.models?.rows).toEqual([{ label: "example-model", value: 2 }]);
  }
  expect(
    analyticsSchemas.activity.safeParse({
      data: [{ ...missing, totals: { turns: 2, text_output_tokens: -1 } }],
    }).success
  ).toBe(false);
});

test("optional source failures retain original timestamps while successful sources advance", async () => {
  const previous = fixture();
  previous.activity.fetchedAt = "2026-09-22T12:00:00Z";
  const response = await fetchAnalytics(
    {},
    mockFetch(async (url) =>
      (url instanceof Request ? url.url : String(url)).includes("daily-skill")
        ? Response.json({ data: [] })
        : new Response(null, { status: 503 })
    ),
    now,
    previous
  );
  expect(response.activity).toEqual(previous.activity);
  expect(response.plugins).toEqual(previous.plugins);
  expect(response.skills?.fetchedAt).toBe(now.toISOString());
  const bad = await fetchAnalytics(
    {},
    mockFetch(async () => Response.json({ data: "malformed" })),
    now,
    previous
  );
  expect(bad.activity).toEqual(previous.activity);
  const disabled = await fetchAnalytics(
    {},
    mockFetch(async () => {
      throw new Error("must not fetch");
    }),
    now,
    previous,
    { ...tokenPreferences, enabled: false }
  );
  expect(disabled).toEqual({});
});

test("disabled configuration hides the route and public data without querying a database", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--eval",
      `
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    import { tokenPreferences } from "./src/content/tokens.ts";
    mock.module("server-only", () => ({}));
    mock.module("./src/env.ts", () => ({ env: {} }));
    mock.module("./src/components/site-shell.tsx", () => ({ SiteShell: () => null }));
    mock.module("./src/content/tokens.ts", () => ({ tokenPreferences: { ...tokenPreferences, enabled: false } }));
    mock.module("./src/db/client.ts", () => ({
      isDatabaseConfigured: () => { throw new Error("must not query"); },
      getDatabase: () => { throw new Error("must not query"); },
    }));
    const { getPublicCodexStats, getPublicTokenDetails } = await import("./src/lib/codex/public-stats.ts");
    assert.equal(await getPublicCodexStats(), null);
    assert.equal(await getPublicTokenDetails(7), null);
    const { default: TokensPage } = await import("./src/app/(portfolio)/tokens/page.tsx");
    await assert.rejects(TokensPage({ searchParams: Promise.resolve({}) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  `,
    ],
    { cwd: new URL("..", import.meta.url).pathname }
  );
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});

test("ranked tools carry dynamic logos without exposing excluded tool metadata", () => {
  const account: AnalyticsSnapshot = {
    ...fixture(),
    pluginLogos: {
      "public-tool": {
        logoUrl: "https://files.openai.com/public.svg",
        logoUrlDark: "https://files.openai.com/public-dark.svg",
      },
      "private-tool": { logoUrl: "https://files.openai.com/private.svg" },
    },
  };
  const details = buildTokenDetails([account], 30, now, {
    ...tokenPreferences,
    excludedTools: ["private-tool"],
  });
  expect(details.plugins?.rows[0]).toEqual({
    name: "public-tool",
    label: "public-tool",
    value: 2,
    ...account.pluginLogos?.["public-tool"],
  });
  expect(JSON.stringify(details)).not.toContain("private.svg");
});

test("empty sections disappear while reported zero usage remains visible", () => {
  const empty = buildTokenDetails([{}], 30, now);
  const html = renderToStaticMarkup(
    <TokenUsageDetails stats={null} details={empty} />
  );
  for (const id of ["breakdowns", "models", "tools", "skills"]) {
    expect(html).not.toContain(`id="${id}"`);
  }
  const zero = fixture();
  zero.activity.response.data[0].totals = {
    turns: 0,
    uncached_text_input_tokens: 0,
    cached_text_input_tokens: 0,
    text_output_tokens: 0,
  };
  zero.activity.response.data[0].models = [];
  zero.plugins.response.data = [];
  const details = buildTokenDetails([zero], 30, now);
  const zeroHtml = renderToStaticMarkup(
    <TokenUsageDetails stats={null} details={details} weekDetails={empty} />
  );
  expect(zeroHtml).toContain('id="breakdowns"');
  for (const id of ["models", "tools", "skills"]) {
    expect(zeroHtml).not.toContain(`id="${id}"`);
  }
  expect(zeroHtml).not.toContain("Last 7 days");
});

test("backfills once, refreshes recent dates, and retains bounded history on failure", async () => {
  const first = fixture();
  const old = { ...first.activity.response.data[0], date: "2026-05-25" };
  const requested: URL[] = [];
  const fetcher = mockFetch(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requested.push(url);
    return url.pathname.endsWith("daily-workspace-usage-counts")
      ? Response.json({ data: [old, ...first.activity.response.data] })
      : Response.json({ data: [] });
  });
  const initial = await fetchAnalytics({}, fetcher, now);
  expect(
    requested
      .find((url) => url.pathname.endsWith("daily-workspace-usage-counts"))
      ?.searchParams.get("start_date")
  ).toBe("2025-09-24");
  expect(
    requested
      .find((url) => url.pathname.endsWith("daily-skill-usage-metrics"))
      ?.searchParams.get("top_skill_limit")
  ).toBe("100");
  expect(initial.activity?.response.data).toHaveLength(2);
  requested.length = 0;
  const next = await fetchAnalytics(
    {},
    fetcher,
    new Date("2026-09-24T12:00:00Z"),
    initial
  );
  expect(
    requested
      .find((url) => url.pathname.endsWith("daily-workspace-usage-counts"))
      ?.searchParams.get("start_date")
  ).toBe("2026-08-26");
  expect(next.activity?.response.data).toHaveLength(2);
  expect(next.activity?.response.data[0].date).toBe("2026-05-25");
  const failure = await fetchAnalytics(
    {},
    mockFetch(async () => new Response(null, { status: 503 })),
    new Date("2026-09-25T12:00:00Z"),
    next
  );
  expect(failure.activity).toEqual(next.activity);
  const expired = await fetchAnalytics(
    {},
    fetcher,
    new Date("2027-09-24T12:00:00Z"),
    next
  );
  expect(expired.activity?.response.data).toEqual([]);
  requested.length = 0;
  await fetchAnalytics({}, fetcher, new Date("2026-12-24T12:00:00Z"), next);
  expect(
    requested
      .find((url) => url.pathname.endsWith("daily-workspace-usage-counts"))
      ?.searchParams.get("start_date")
  ).toBe("2026-09-25");
});

test("delegation stays per-account and missing model detail preserves other metrics", () => {
  const account = fixture();
  const input = {
    ...account,
    delegation: {
      ...meta,
      response: analyticsSchemas.delegation.parse({
        units: "percent",
        data: [
          {
            date: "2026-09-22",
            product_surface_usage_values: { desktop_app: 20 },
            attribution: [
              { thread_source: "user", value: 10, model: "private-field" },
              { thread_source: "subagent", value: 5 },
              { thread_source: "unknown", value: 5 },
            ],
          },
          {
            date: "2026-09-23",
            product_surface_usage_values: { desktop_app: 5 },
          },
        ],
      }),
    },
  };
  const second = {
    ...input,
    activity: {
      ...meta,
      response: analyticsSchemas.activity.parse({
        data: [{ date: "2026-09-22", totals: { turns: 7 }, models: null }],
      }),
    },
  };
  const result = buildTokenDetails([input, second], 30, now, tokenPreferences, [
    "Personal",
    "Projects",
  ]);
  expect(result.delegation?.accounts.map((value) => value.label)).toEqual([
    "Personal",
    "Projects",
  ]);
  expect(result.delegation?.accounts[0].rows).toEqual([
    { label: "Tasks", value: 40 },
    { label: "Subagents", value: 20 },
    { label: "Unattributed", value: 40 },
  ]);
  expect(result.activity?.turns).toBe(10);
  expect(result.models?.rows).toEqual([{ label: "example-model", value: 3 }]);
  expect(result.models?.status.partial).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private-field");
});

test("tool names combine across accounts independently of their display labels", () => {
  const first = fixture();
  first.plugins.response = analyticsSchemas.plugins.parse({
    data: [
      {
        date: "2026-09-22",
        plugin_usage_overviews: [
          {
            plugin_name: "public-tool",
            display_name: "Readable Tool",
            invocation_counts: 2,
          },
        ],
      },
    ],
  });
  const result = buildTokenDetails([first, first], 30, now);
  expect(result.plugins?.rows).toEqual([
    { name: "public-tool", label: "Readable Tool", value: 4 },
  ]);
  expect(result.plugins?.total).toBe(4);
  expect(result.plugins?.distinct).toBe(1);
});

test("a change of allowance units cannot mix old percentages with credits", async () => {
  const old = {
    delegation: {
      ...meta,
      historyDays: 365,
      start: "2025-09-24",
      response: {
        units: "percent",
        data: [
          {
            date: "2026-05-25",
            product_surface_usage_values: { desktop_app: 80 },
          },
        ],
      },
    },
  };
  const source = await fetchAnalytics(
    {},
    mockFetch(async () =>
      Response.json({
        units: "credits",
        data: [
          {
            date: "2026-09-22",
            product_surface_usage_values: { desktop_app: 10 },
          },
        ],
      })
    ),
    now,
    old
  );
  expect(source.delegation?.response.data).toHaveLength(1);
  expect(source.delegation?.start).toBe("2026-08-25");
  expect(source.delegation?.historyDays).toBeUndefined();
});

test("delegation combines raw usage for matching plans before calculating shares", () => {
  const account = (units: string, tasks: number, subagents: number) => ({
    delegation: {
      ...meta,
      response: analyticsSchemas.delegation.parse({
        units,
        data: [
          {
            date: "2026-09-22",
            product_surface_usage_values: { desktop_app: tasks + subagents },
            attribution: [
              { thread_source: "user", value: tasks },
              { thread_source: "subagent", value: subagents },
            ],
          },
        ],
      }),
    },
  });
  const first = account("percent", 9, 1);
  const second = account("percent", 1, 89);
  const details = (accounts: (typeof first)[], plans: string[]) =>
    buildTokenDetails(accounts, 30, now, tokenPreferences, [], plans);
  expect(details([first, second], ["pro", "pro"]).delegation?.accounts).toEqual(
    [
      {
        label: "",
        rows: [
          { label: "Tasks", value: 10 },
          { label: "Subagents", value: 90 },
        ],
      },
    ]
  );
  expect(
    details([first, second], ["pro", "plus"]).delegation?.accounts
  ).toHaveLength(2);
  expect(details([first, second], []).delegation?.accounts).toHaveLength(2);
  expect(
    details([first, account("credits", 1, 9)], ["pro", "pro"]).delegation
      ?.accounts
  ).toHaveLength(2);
  expect(
    details([account("credits", 9, 1), account("credits", 1, 89)], [])
      .delegation?.accounts
  ).toHaveLength(1);
});

test("accounts starting on different dates do not imply missing usage", () => {
  const first = fixture();
  const later = fixture();
  first.activity.response.data[0].date = "2026-08-25";
  later.activity.response.data[0].date = "2026-09-23";
  const details = buildTokenDetails([first, later], 30, now);
  expect(details.activity?.status.partial).toBe(false);
  expect(details.activity?.tokens).toBe(210);
  expect(details.models?.status.partial).toBe(false);
});
