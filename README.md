# f0rr0.dev

Sid Jain's portfolio, writing archive, and GitHub commit timeline. The
site is a Next.js application designed for Vercel.

## Local development

Use Node 24 and Bun:

```sh
bun install --frozen-lockfile
bun run dev
```

The website works without secrets; the persisted commit feed stays empty until
Postgres is configured. See [the commit sync guide](docs/github-commits.md) for
database, Supabase Cron, account polling, and webhook setup.
The separate [Codex stats guide](docs/codex-stats.md) covers its encrypted
account snapshots and scheduled runner.

## Validation

```sh
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build
```

Vercel production builds apply pending migrations before building the site,
using the database connection already synchronized by Supabase. Preview and
local builds skip migrations. Apply them manually in other environments with:

```sh
bun run db:migrate
```
