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

**Active work:** No feature is currently in progress. The latest completed
working area was the main Journal view and its authenticated API contract.

**Status:** The local source, generated API clients, development database, and
external Supabase schema are aligned for the current Drizzle model. Schedule
creation and acceptance are working. The main Journal now requests the full
user-owned journal rather than only the selected day, and newly created notes
are placed into the visible client cache before the normal refetch. Browser-push
alarms have not been started because the required product behavior was not
selected.

**Where the work is located:**

- Main Journal UI: `artifacts/day-tripper/src/components/journal-panel.tsx`
- Journal API: `artifacts/api-server/src/routes/journalEntries.ts`
- Journal contract: `lib/api-spec/openapi.yaml`
- Generated clients: `lib/api-client-react/src/generated/` and
  `lib/api-zod/src/generated/`
- Database schema and migrations: `lib/db/src/schema/` and
  `lib/db/drizzle/`
- Schedule planning and acceptance: `artifacts/day-tripper/src/App.tsx` and
  `artifacts/api-server/src/routes/planning.ts`

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
- Activity sync no longer re-enters its queue automatically when a server error
  changes the sync status.
- The server wake indicator now listens only to health-check responses, so a
  feature/database error cannot make the global day-space status flicker.
- The development database contains the retention tables and the activity
  reminder columns from migration `0008_optimal_wallop`.

## Not yet verified for this checkpoint

- Authenticated create, edit, delete, and observation flows with real data.
- Chart behavior after a new personal high and after changing retention speed.
- An authenticated production end-to-end Journal create/list flow through the
  Render deployment. The local endpoint contract, Supabase schema, and client
  refresh path are aligned, but this still needs a user-authenticated live
  confirmation after the latest release.
- Browser-push alarm behavior and delivery infrastructure.

## Next safe action

When a new feature is given, first write its bounded scope and working area
here, then inspect the current source before editing. For each implementation
chunk:

1. Record the exact area being worked on and the intended outcome.
2. After the chunk, record what is complete and what is not verified.
3. Run the relevant typecheck/build, restart affected workflows, inspect fresh
   logs, and verify the user-visible flow.
4. Update this checkpoint before context becomes tight, including the next safe
   action and anything explicitly not to start.
5. If context runs out, the next session should resume from this file and verify
   its claims against the current source rather than replaying an old transcript.

For the current Journal repair, the next safe product check is one authenticated
live create and reload through Render. Do not begin alarm delivery until the
user explicitly chooses between browser push while the tab is closed and
in-app-only reminders.

## Do not start yet

Do not begin browser-push alarms, notification delivery, automatic calibration,
or broader AI expansion until the product behavior and release boundary are
explicit. Do not treat database reminder columns as an implemented alarm
feature.