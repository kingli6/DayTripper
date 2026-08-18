# Day Tripper Continuation Checkpoint

Last reviewed: 2026-08-19

This is the canonical handoff file for continuing Day Tripper across sessions or
when the available conversation context is nearly exhausted. It is intentionally
shorter than the idea log: it records the current implementation boundary and
the next safe action, not the whole product history.

## How to resume safely

1. Read this file, `replit.md`, and the product contract before changing code.
2. Treat explicit user approvals and the product contract as authoritative for
   scope and product language.
3. Treat the current source tree, generated files, database migrations, and
   verification output as authoritative for what is actually implemented.
4. Treat pasted conversation excerpts and older status paragraphs as historical
   context. Never redo a chunk solely because an older note says it is pending.
5. Before starting a new chunk, verify the checkpoint against the current code.
   If they disagree, update this file first and explain the boundary.
6. Work one bounded chunk at a time. Before context becomes tight, record:
   `status`, `completed`, `not verified`, `next safe action`, and `do not start`.
7. A feature is not complete because files exist. Mark it complete only after
   the relevant typecheck/build, workflow restart, logs, and user-visible flow
   have been verified.

## Handoff maintenance rule

This file is the canonical handoff for future Day Tripper sessions. The agent
must update it after every meaningful product decision, implementation chunk,
verification result, blocked boundary, or change in the next safe action. The
user should be able to point a new session to this file without repeating prior
context. Do not wait for a reminder.

## Current checkpoint

**Active work:** Retention MVP production verification.

**Status:** Source and local runtime verification are complete. The deployed
authenticated retention flow is blocked by an HTTP 500 from Render after the
request reaches the private API; the external Supabase schema and Render logs
are not accessible from this Replit workspace.

**Approved product boundary:**

- Multiple private, user-owned practices.
- One numeric measure selected from a defined set of observable units per
  practice: correct answers, repetitions, minutes, pages, words, or items.
- Higher-is-better values only for the first version.
- Manual observations with optional context.
- Personal high and a new current projection when a higher observation is made.
- A clearly marked estimated retention curve.
- User-controlled Slow → Fast retention speed.
- Persistent storage through the authenticated API and database.
- Use retention language, not loss, failure, missed-progress, streak, or score
  language.

**Explicitly out of scope for this slice:**

- Lower-is-better or neutral measures.
- Automatic calibration or personalization.
- Research-specific physiological models or health conclusions.
- Uncertainty bands, notifications, spaced repetition, AI, or complex analytics.
- Pause/disable controls.
- Streaks, red zones, loss-aversion mechanics, shame, or productivity scoring.

## Verified present in the source tree

- Retention OpenAPI contract and generated client/Zod types.
- Drizzle retention practice and observation schema plus migration.
- Authenticated, owner-scoped retention API routes.
- Retention practices page, practice form, observation flow, and chart.
- Visual distinction between recorded results and estimates.
- Higher-is-better product language in the retention UI.
- Exact API codegen, full workspace typecheck, and API build pass.
- Development database contains both retention tables.
- Fresh API and web workflows start cleanly; health returns 200.
- Signed-out retention access returns 401 without private data.
- Signed-out landing page renders successfully without application errors.
- Live Render health returns 200 and signed-out retention access returns 401.
- HTTP 5xx responses are no longer classified as browser offline state or
  queued offline writes; they remain visible server errors.
- The web workflow restarted cleanly after the client fix; browser preview has
  no new application errors; full workspace typecheck and build pass.

## Not yet verified for this checkpoint

- Authenticated create, edit, delete, and observation flows with real data.
- Chart behavior after a new personal high and after changing retention speed.
- Production Supabase retention tables/columns and deployed authenticated
  retention behavior. The user-reported authenticated create/list requests
  currently return HTTP 500.
- Whether the retention calculation should be extracted from the chart into the
  dedicated model module requested in the approved architecture.

## Next safe action

Inspect the Render service logs and compare the external Supabase schema with
`lib/db/drizzle/0008_optimal_wallop.sql` and `lib/db/src/schema/retention.ts`.
Apply the additive retention schema through the external production database
process if it is missing, without changing the local Replit `DATABASE_URL`,
adding startup migrations, or replacing the external database. Then exercise
one authenticated practice end to end:

1. Verify create, edit, delete, record observation, and refresh persistence.
2. Verify that recorded values and estimated retention are clearly distinct.
3. Verify that a higher observation becomes the new current reference.
4. Verify that Slow → Fast changes the projection without changing recorded
   observations.
5. Record the authenticated result here before starting any new feature work.

## Do not start yet

Do not begin lower-is-better measures, state awareness, reflection, operations
metrics, notifications, automatic calibration, or broader AI expansion until
this MVP has been verified and the next product decision is explicit.