import postgres from "postgres";

import { env } from "../src/env";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  GITHUB_EVENTS_CRON_JOB,
  GITHUB_HEAD_REFS_CRON_JOB,
  GITHUB_REF_REPOSITORY_BATCH_SIZE,
  GITHUB_WORKER_HTTP_TIMEOUT_MS,
  GITHUB_WORKER_CRON_JOB,
} from "../src/lib/github-cron-config";
import { CANONICAL_SITE_URL } from "../src/lib/site-url";
import { shouldApplyProductionMigrations } from "./migrate-production-database";

const SECRET_DESCRIPTION = "Vercel GitHub sync cron configuration";
const SECRET_NAME = "github_sync_bearer_secret";
const URL_NAME = "github_sync_url";
const HEAD_REFS_URL_NAME = "github_head_refs_url";
const WORKER_URL_NAME = "github_worker_url";
const LEGACY_JOB_NAME = "github-sync-every-three-hours";
const LEGACY_REFS_JOB_NAME = "github-refs-every-fifteen-minutes";
const LEGACY_TAG_REFS_JOB_NAME = "github-tag-refs-every-fifteen-minutes";
const CRON_CONFIGURATION_LOCK_NAME = "f0rr0.dev:supabase-cron";

interface SupabaseCronEnvironment {
  CRON_SECRET?: string;
  DATABASE_URL?: string;
  DATABASE_URL_UNPOOLED?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

const requiredEnvironmentValue = (
  name: string,
  configured: string | undefined
) => {
  const value = configured?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
};

export const supabaseCronDatabaseUrlFrom = (
  environment: SupabaseCronEnvironment
) => {
  const unpooledDatabaseUrl = environment.DATABASE_URL_UNPOOLED?.trim();
  return unpooledDatabaseUrl === undefined || unpooledDatabaseUrl.length === 0
    ? requiredEnvironmentValue("DATABASE_URL", environment.DATABASE_URL)
    : unpooledDatabaseUrl;
};

export const supabaseCronUrlsFrom = (configuredSiteUrl: string) => {
  const siteUrl = new URL(configuredSiteUrl);
  if (siteUrl.protocol !== "https:") {
    throw new Error(
      "The Supabase cron target must use HTTPS so it can reach Vercel."
    );
  }
  const events = new URL("/api/cron/github-sync", siteUrl).toString();
  const headRefs = new URL("/api/cron/github-refs", siteUrl);
  headRefs.searchParams.set(
    "repositories",
    String(GITHUB_REF_REPOSITORY_BATCH_SIZE)
  );
  return {
    events,
    headRefs: headRefs.toString(),
    worker: new URL("/api/cron/github-worker", siteUrl).toString(),
  };
};

export const supabaseCronSiteUrlFrom = (
  environment: SupabaseCronEnvironment
) => {
  const productionHostname = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHostname === undefined || productionHostname.length === 0
    ? CANONICAL_SITE_URL
    : `https://${productionHostname}`;
};

const upsertVaultSecret = async (
  sql: ReturnType<typeof postgres>,
  input: { name: string; value: string }
) => {
  const [existing] = await sql<{ id: string }[]>`
    select id::text
    from vault.secrets
    where name = ${input.name}
    limit 1
  `;

  if (existing === undefined) {
    await sql`
      select vault.create_secret(
        ${input.value},
        ${input.name},
        ${SECRET_DESCRIPTION}
      )
    `;
    return;
  }

  await sql`
    select vault.update_secret(
      ${existing.id}::uuid,
      ${input.value},
      ${input.name},
      ${SECRET_DESCRIPTION}
    )
  `;
};

const cronHttpPostCommand = (
  urlSecretName: string,
  timeoutMilliseconds = GITHUB_CRON_EXECUTION_DURATION_MS
) => `
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = '${urlSecretName}'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = '${SECRET_NAME}'
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron'),
    timeout_milliseconds := ${String(timeoutMilliseconds)}
  ) as request_id
`;

export const configureSupabaseCron = async (
  environment: SupabaseCronEnvironment = env
) => {
  const databaseUrl = supabaseCronDatabaseUrlFrom(environment);
  const cronSecret = requiredEnvironmentValue(
    "CRON_SECRET",
    environment.CRON_SECRET
  );
  if (cronSecret.length < 32) {
    throw new Error("CRON_SECRET must contain at least 32 characters.");
  }
  const urls = supabaseCronUrlsFrom(supabaseCronSiteUrlFrom(environment));
  const sql = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
  });

  try {
    const jobs = await sql.begin(async (transaction) => {
      await transaction`
        select pg_advisory_xact_lock(
          hashtextextended(${CRON_CONFIGURATION_LOCK_NAME}, 0)
        )
      `;
      await transaction`create schema if not exists extensions`;
      await transaction`create schema if not exists vault`;
      await transaction`create extension if not exists pg_cron`;
      await transaction`create extension if not exists pg_net with schema extensions`;
      await transaction`create extension if not exists supabase_vault with schema vault`;

      await upsertVaultSecret(transaction, {
        name: URL_NAME,
        value: urls.events,
      });
      await upsertVaultSecret(transaction, {
        name: HEAD_REFS_URL_NAME,
        value: urls.headRefs,
      });
      await upsertVaultSecret(transaction, {
        name: WORKER_URL_NAME,
        value: urls.worker,
      });
      await upsertVaultSecret(transaction, {
        name: SECRET_NAME,
        value: cronSecret,
      });

      await transaction`
        select cron.unschedule(jobid)
        from cron.job
        where jobname in (
          ${LEGACY_JOB_NAME},
          ${LEGACY_REFS_JOB_NAME},
          ${LEGACY_TAG_REFS_JOB_NAME},
          ${GITHUB_EVENTS_CRON_JOB.name},
          ${GITHUB_HEAD_REFS_CRON_JOB.name},
          ${GITHUB_WORKER_CRON_JOB.name}
        )
      `;

      const [eventsJob] = await transaction<{ jobId: number }[]>`
        select cron.schedule(
          ${GITHUB_EVENTS_CRON_JOB.name},
          ${GITHUB_EVENTS_CRON_JOB.schedule},
          ${cronHttpPostCommand(URL_NAME)}
        ) as "jobId"
      `;
      const [headRefsJob] = await transaction<{ jobId: number }[]>`
        select cron.schedule(
          ${GITHUB_HEAD_REFS_CRON_JOB.name},
          ${GITHUB_HEAD_REFS_CRON_JOB.schedule},
          ${cronHttpPostCommand(HEAD_REFS_URL_NAME)}
        ) as "jobId"
      `;
      const [workerJob] = await transaction<{ jobId: number }[]>`
        select cron.schedule(
          ${GITHUB_WORKER_CRON_JOB.name},
          ${GITHUB_WORKER_CRON_JOB.schedule},
          ${cronHttpPostCommand(WORKER_URL_NAME, GITHUB_WORKER_HTTP_TIMEOUT_MS)}
        ) as "jobId"
      `;
      if (
        eventsJob === undefined ||
        headRefsJob === undefined ||
        workerJob === undefined
      ) {
        throw new Error("Supabase did not return every scheduled cron job.");
      }
      return { eventsJob, headRefsJob, workerJob };
    });

    process.stdout.write(
      `Configured Supabase cron jobs ${String(jobs.eventsJob.jobId)}, ${String(jobs.headRefsJob.jobId)}, and ${String(jobs.workerJob.jobId)} for GitHub intake, head refs, and processing.\n`
    );
    return jobs;
  } finally {
    await sql.end({ timeout: 5 });
  }
};

export const shouldConfigureSupabaseCronForProduction = (
  environment: SupabaseCronEnvironment
) => shouldApplyProductionMigrations(environment);

export const configureProductionSupabaseCron = async (
  environment: SupabaseCronEnvironment = env
) => {
  if (!shouldConfigureSupabaseCronForProduction(environment)) {
    process.stdout.write("Skipping production Supabase cron configuration.\n");
    return false;
  }
  await configureSupabaseCron(environment);
  return true;
};

if (import.meta.main) {
  try {
    const arguments_ = process.argv.slice(2);
    if (
      arguments_.length > 1 ||
      (arguments_.length === 1 && arguments_[0] !== "--production-build")
    ) {
      throw new TypeError("The Supabase cron arguments are invalid.");
    }
    await (arguments_[0] === "--production-build"
      ? configureProductionSupabaseCron()
      : configureSupabaseCron());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`Supabase cron configuration failed: ${message}\n`);
    process.exitCode = 1;
  }
}
