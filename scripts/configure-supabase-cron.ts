import postgres from "postgres";

const JOB_NAME = "github-sync-every-three-hours";
const JOB_SCHEDULE = "7 */3 * * *";
const WORKER_JOB_NAME = "github-activity-worker-every-five-minutes";
const WORKER_JOB_SCHEDULE = "*/5 * * * *";
const SECRET_DESCRIPTION = "Vercel GitHub sync cron configuration";
const SECRET_NAME = "github_sync_bearer_secret";
const URL_NAME = "github_sync_url";
const WORKER_URL_NAME = "github_worker_url";

const requiredEnvironmentValue = (name: string) => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
};

const unpooledDatabaseUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
const databaseUrl =
  unpooledDatabaseUrl === undefined || unpooledDatabaseUrl.length === 0
    ? requiredEnvironmentValue("DATABASE_URL")
    : unpooledDatabaseUrl;
const cronSecret = requiredEnvironmentValue("CRON_SECRET");
if (cronSecret.length < 32) {
  throw new Error("CRON_SECRET must contain at least 32 characters.");
}

const siteUrl = new URL(requiredEnvironmentValue("SITE_URL"));
if (siteUrl.protocol !== "https:") {
  throw new Error("SITE_URL must use HTTPS so Supabase can reach Vercel.");
}
const syncUrl = new URL("/api/cron/github-sync", siteUrl).toString();
const workerUrl = new URL("/api/cron/github-worker", siteUrl).toString();

const sql = postgres(databaseUrl, {
  connect_timeout: 10,
  idle_timeout: 20,
  max: 1,
  prepare: false,
});

const upsertVaultSecret = async (input: { name: string; value: string }) => {
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

try {
  await sql`create schema if not exists extensions`;
  await sql`create schema if not exists vault`;
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net with schema extensions`;
  await sql`create extension if not exists supabase_vault with schema vault`;

  await upsertVaultSecret({ name: URL_NAME, value: syncUrl });
  await upsertVaultSecret({ name: WORKER_URL_NAME, value: workerUrl });
  await upsertVaultSecret({ name: SECRET_NAME, value: cronSecret });

  await sql`
    select cron.unschedule(jobid)
    from cron.job
    where jobname in (${JOB_NAME}, ${WORKER_JOB_NAME})
  `;

  const command = `
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = '${URL_NAME}'
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
      timeout_milliseconds := 120000
    ) as request_id
  `;
  const [job] = await sql<{ jobId: number }[]>`
    select cron.schedule(
      ${JOB_NAME},
      ${JOB_SCHEDULE},
      ${command}
    ) as "jobId"
  `;
  const workerCommand = `
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = '${WORKER_URL_NAME}'
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
      timeout_milliseconds := 120000
    ) as request_id
  `;
  const [workerJob] = await sql<{ jobId: number }[]>`
    select cron.schedule(
      ${WORKER_JOB_NAME},
      ${WORKER_JOB_SCHEDULE},
      ${workerCommand}
    ) as "jobId"
  `;

  process.stdout.write(
    `Configured Supabase cron jobs ${String(job?.jobId)} and ${String(workerJob?.jobId)} for GitHub intake and processing.\n`
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Supabase cron configuration failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
