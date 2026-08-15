# Day Tripper

Day Tripper is a private, forgiving day planner that helps people see what matters next, recover when plans change, and optionally notice their own patterns without judgment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/day-tripper run dev` — run the responsive web shell
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate Drizzle migration files from the schema
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server-managed env: `DATABASE_URL` — Postgres connection string
- Required server-only secret: `GEMINI_API_KEY` — Gemini access; never sent to clients
- Required server-only secret: `SESSION_SECRET` — session signing material

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind CSS, served as a PWA-ready web shell
- AI: direct server-side Gemini configuration using `GEMINI_API_KEY`

## Where things live

- `artifacts/day-tripper/` — responsive web application shell
- `artifacts/api-server/` — shared Express API, health endpoint, AI configuration status, and safe error responses
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/db/src/schema/` — Drizzle schema source of truth
- `lib/db/drizzle.config.ts` — migration and schema configuration

## Architecture decisions

- AI configuration is server-only; clients receive safe status metadata, never credentials.
- The initial database table is app metadata only; user-facing planner persistence is intentionally deferred.
- API failures return generic JSON messages to clients while detailed errors stay in structured server logs.

## Product

The first section establishes the Day Tripper shell and the service foundation. Timeline planning, AI proposals, and optional reflection are intentionally deferred to later sections.

## User preferences

- Build one section at a time and stop for approval after each section.
- AI proposes changes; it must never silently alter a user's schedule.
- Do not use streaks, productivity scores, shame-based notifications, or ideal lifestyle targets.

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Run database schema generation or push after changing `lib/db/src/schema/`.
- Keep `GEMINI_API_KEY` server-side only.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
