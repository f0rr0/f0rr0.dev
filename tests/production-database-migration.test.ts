import { describe, expect, test } from "bun:test";

import {
  shouldConfigureSupabaseCronForProduction,
  supabaseCronSiteUrlFrom,
  supabaseCronJobsFrom,
  supabaseCronUrlsFrom,
} from "../scripts/configure-supabase-cron.ts";
import { shouldApplyProductionMigrations } from "../scripts/migrate-production-database.ts";

describe("production migration environment", () => {
  test("runs only for Vercel production deployments", () => {
    expect(
      shouldApplyProductionMigrations({
        VERCEL: "1",
        VERCEL_ENV: "production",
      })
    ).toBe(true);
    expect(shouldApplyProductionMigrations({})).toBe(false);
    expect(
      shouldApplyProductionMigrations({
        VERCEL: "1",
        VERCEL_ENV: "preview",
      })
    ).toBe(false);
    expect(
      shouldConfigureSupabaseCronForProduction({
        VERCEL: "1",
        VERCEL_ENV: "production",
      })
    ).toBe(true);
    expect(
      shouldConfigureSupabaseCronForProduction({
        VERCEL: "1",
        VERCEL_ENV: "preview",
      })
    ).toBe(false);
  });
});

describe("production Supabase cron URLs", () => {
  test("uses Vercel's production hostname without a managed site URL", () => {
    expect(
      supabaseCronSiteUrlFrom({
        VERCEL_PROJECT_PRODUCTION_URL: "project.example",
      })
    ).toBe("https://project.example");
    expect(() => supabaseCronSiteUrlFrom({})).toThrow();
  });

  test("builds every bounded production endpoint from the site URL", () => {
    expect(supabaseCronUrlsFrom("https://project.example")).toEqual({
      codexStats: "https://project.example/api/cron/codex-stats",
      events: "https://project.example/api/cron/github-sync",
      headRefs: "https://project.example/api/cron/github-refs?repositories=8",
      summary: "https://project.example/api/cron/github-summary",
      worker: "https://project.example/api/cron/github-worker",
    });
    expect(() => supabaseCronUrlsFrom("http://localhost:3000")).toThrow(
      "HTTPS"
    );
  });
});

const enabledNames = (
  configuration: Parameters<typeof supabaseCronJobsFrom>[0],
  codex = false
) =>
  supabaseCronJobsFrom(configuration, codex)
    .filter((job) => job.enabled)
    .map((job) => job.name);

test("schedules only configured services while retaining disabled jobs for cleanup", () => {
  const environment = { VERCEL_PROJECT_PRODUCTION_URL: "example.vercel.app" };
  expect(enabledNames(environment)).toEqual([
    "github-activity-worker-every-five-minutes",
  ]);
  expect(enabledNames(environment, true)).toEqual([
    "github-activity-worker-every-five-minutes",
    "codex-stats-every-fifteen-minutes",
  ]);
  expect(
    enabledNames({ ...environment, OPENAI_API_KEY: "test-key" })
  ).toHaveLength(2);
  const github = {
    ...environment,
    GITHUB_TOKENS: JSON.stringify({ f0rr0: "test-token" }),
  };
  expect(enabledNames(github)).toHaveLength(3);
  expect(
    enabledNames({ ...github, OPENAI_API_KEY: "test-key" }, true)
  ).toHaveLength(5);
  expect(supabaseCronJobsFrom(environment, false)).toHaveLength(5);
  for (const job of supabaseCronJobsFrom(github, true)) {
    expect(new URL(job.url).origin).toBe("https://example.vercel.app");
  }
});
