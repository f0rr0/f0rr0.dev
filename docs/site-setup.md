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

## Configuration cleanup

`GH_TOKEN` is no longer an application setting; move its value to `GITHUB_TOKEN`
if you used it for public repository or embed access. The GitHub CLI can still
use its own `GH_TOKEN`. `GITHUB_TOKENS` remains the account-to-token JSON map;
it is separate from the optional single public-read token.

`NEXT_PUBLIC_PORT` is removed. Start a custom local port with
`PORT=4200 bun run dev`; browsers use their current origin. Next.js does not read
`PORT` from `.env` files ([Next.js CLI documentation](https://nextjs.org/docs/app/api-reference/cli/next)). Leave `NODE_ENV` and Vercel's system variables to their
platforms instead of copying blank overrides into `.env.local`.

The runtime and operational database URLs remain separate because migrations
need a direct or session-pooler connection. Cron authentication, webhook
verification, and activity cursor signing also retain independent secrets.
The public and server Vercel variables serve different execution environments.
GitHub Actions' `ACTIVITY_*` secrets map to the application's environment names.

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
