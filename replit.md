# Day Tripper

Day Tripper is a private, forgiving day planner that helps people see what matters next, recover when plans change, and optionally notice their own patterns without judgment.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 8080 locally, routed through `/api`)
- `pnpm --filter @workspace/day-tripper run dev` — run the React/Vite web shell (port 25445 locally, served at `/`)
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the component preview server (port 8081 locally, served at `/__mockup`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate Drizzle migration files from the schema
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server configuration: `DATABASE_URL`, `CLERK_SECRET_KEY`, `GEMINI_API_KEY`, and `SESSION_SECRET`
- Required browser build variable: `VITE_CLERK_PUBLISHABLE_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL hosted by Supabase for the live Render deployment; Drizzle ORM owns the schema
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Frontend: React + Vite + Tailwind CSS responsive web shell; PWA installability is not currently implemented.
- Authentication: external Clerk; Supabase is the database provider, not the authentication provider
- AI: direct server-side Gemini configuration using `GEMINI_API_KEY`
- Production hosting: Render runs the production Node service and connects it to Supabase

## Stack reminder

- Local development runs through the Replit-managed pnpm workflows; production runs on Render.
- Replit's local `DATABASE_URL` is for development. Render's `DATABASE_URL` points to the external Supabase PostgreSQL database.
- Clerk owns sign-in and user identity. The API enforces private-record ownership server-side.
- Gemini is called only by the API; the browser never receives `GEMINI_API_KEY`.
- Replit workflows and the Render deployment are separate environments. A schema change must be applied to the database used by the host running the new API before release.

## Where things live

- `artifacts/day-tripper/` — responsive web application shell
- `artifacts/api-server/` — shared Express API, health endpoint, AI configuration status, and safe error responses
- `lib/api-spec/openapi.yaml` — API source of truth
- `lib/db/src/schema/` — Drizzle schema source of truth
- `lib/db/drizzle.config.ts` — migration and schema configuration

## Architecture decisions

- AI configuration is server-only; clients receive safe status metadata, never credentials.
- PostgreSQL with Drizzle supports the implemented product domains, including activities, tasks, execution, retention, activity changes, admin data, and related tables.
- The earlier app-metadata-only database description was historical foundation-stage context; planner persistence is now implemented across the domains above.
- API failures return generic JSON messages to clients while detailed errors stay in structured server logs.

## Product

Timeline planning, AI proposals, replanning, task scheduling, and execution guidance are implemented. Optional reflection and other explicitly deferred future work remain outside the current product scope.

## User preferences

- Build one section at a time and stop for approval after each section.
- AI proposes changes; it must never silently alter a user's schedule.
- Do not use streaks, productivity scores, shame-based notifications, or ideal lifestyle targets.
- Keep `docs/day-tripper-idea-log.md` updated after each approved product decision, implementation milestone, and verification result so progress and unfinished work remain visible.
- Treat `docs/day-tripper-continuation.md` as the canonical handoff for future sessions. Update it after every meaningful decision, implementation chunk, verification result, blocked boundary, or change in the next safe action; do not wait for the user to remind the agent.

## Gotchas

- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Run database schema generation or push after changing `lib/db/src/schema/`.
- Keep `GEMINI_API_KEY` server-side only.
- Do not replace Replit's runtime-managed `DATABASE_URL` with the production Supabase URL.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Read `docs/day-tripper-continuation.md` first when resuming after a context or
  session boundary. It is the canonical implementation handoff.
