# Site setup

The site runs without secrets. Configure optional services using the
[GitHub activity](github-commits.md), [token log](codex-stats.md), and
[analytics](analytics.md) guides. Supported variables are in
[.env.example](../.env.example); put local values in `.env.local` and deployment
values in Vercel environment settings.

## Deployment

For database-backed deployments, set `DATABASE_URL` for runtime queries and
`DATABASE_URL_UNPOOLED` to a direct or session-pooler connection for migrations
and cron setup. Each installation needs its own database; choose a Vercel region
near it in [vercel.json](../vercel.json).

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
