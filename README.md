# f0rr0.dev

Sid Jain's portfolio, writing archive, and rolling work timeline. The site is a
Next.js application designed for Vercel. Its timeline is assembled from GitHub
activity by a deliberately narrow Eve agent and stored in Neon Postgres through
Drizzle.

## Local development

Use Node 24 and Bun:

```sh
bun install --frozen-lockfile
bun run dev
```

The website works without secrets. In that mode it uses public GitHub data and a
validated editorial fallback. See [the timeline guide](docs/timeline-agent.md)
for the database, ingestion, agent, and deployment setup.

## Validation

```sh
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build
bun run build:agent
```

Database migrations are explicit and are never run during install or build:

```sh
bun run db:migrate
```
