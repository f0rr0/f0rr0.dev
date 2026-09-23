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
  expect(result.plugins?.rows).toEqual([{ label: "public-tool", value: 4 }]);
  expect(JSON.stringify(result)).not.toContain("private-tool");
  expect(JSON.stringify(first.activity)).not.toContain("credits");
  expect(JSON.stringify(first.activity)).not.toContain("secret");
  const html = renderToStaticMarkup(
    <TokenUsageDetails stats={null} details={result} weekDetails={result} />
  );
  expect(html).toContain(">Models</h2>");
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
