# Site setup

The site runs without secrets. Configure optional services using the
[GitHub activity](github-commits.md), [token log](codex-stats.md), and
[analytics](analytics.md) guides. Supported variables are in
[.env.example](../.env.example); put local values in `.env.local` and deployment
values in Vercel environment settings.

## Deployment

For database-backed deployments, copy two URLs from Supabase's **Connect** panel:

- `DATABASE_URL`: transaction pooler, port `6543`, for runtime queries.
- `DATABASE_URL_UNPOOLED`: direct connection, port `5432`, for migrations, cron
  setup, and account registration. Use the session pooler on `5432` when the
  build host cannot reach the direct endpoint over IPv6.

Both must point to the same database. Copy the complete URLs; direct and pooled
connections use different usernames and hosts. Preserve the SSL parameters from
your configured connection. Admin scripts require `DATABASE_URL_UNPOOLED` and
never fall back to the runtime URL or rewrite ports. Local PostgreSQL URLs work
for development and tests. Each installation needs its own database; choose a
Vercel region near it in [vercel.json](../vercel.json).

The app uses Drizzle's node-postgres adapter with one shared connection per
process, a five-second idle timeout, and Vercel's `attachDatabasePool` lifecycle
integration. Queries are queued by the driver; no Postgres.js pipelining or
session-pooler workaround is needed. The remaining Postgres.js admin scripts
use only the explicit direct/session URL and close their clients in `finally`.

The migration runner uses Drizzle's official migrator and journal. Its advisory
lock and migrations share one dedicated connection; concurrent deployments wait
up to 60 seconds for locks. Closing that connection releases the migration lock
on success or failure. Local `db:migrate` uses the same runner.

An `EMAXCONNSESSION` error means the session pool is full. Check that runtime
traffic really uses `6543`; `max: 1` limits each app process, not the deployment.
Earlier versions rewrote runtime URLs to `5432`. After deploying the fix, old
instances may still hold sessions until they retire. A direct migration URL
bypasses that session pool when the build host can reach it.

References: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Postgres.js pipelining limitations](https://supabase.com/docs/guides/database/postgres-js),
and [Vercel pool lifecycle](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool).

Set Vercel's **Build Command** to:

```sh
bun scripts/migrate-production-database.ts && bun run build && bun scripts/configure-supabase-cron.ts --production-build
```

This runs migrations before the build and configures cron after a successful
build. The operational scripts only run on Vercel production deployments.
For local administration, use `bun run db:migrate` and `bun run supabase:cron`.

Enable **Automatically expose System Environment Variables** in Vercel.
`VERCEL_PROJECT_PRODUCTION_URL` supplies the canonical domain.

## Customization

- [Resume content](resume-customization.md): identity, career, and generated PDF.
- [Home content](../src/content/home.ts): introduction and featured work.
- [Site preferences](../src/content/site.ts): GitHub authors, language, and timezone.

For remote development, SSH port forwarding lets you use localhost without
adding personal hostnames to Next.js configuration.

`.worktreeinclude` copies `.env.local` into local worktrees. Keep only development
credentials there; store production credentials in Vercel.

## Reuse

A code license and reuse policy for personal writing and images have not been
chosen. Preserve upstream license notices for vendored fonts and assets.
