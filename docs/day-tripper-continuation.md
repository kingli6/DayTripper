# Day Tripper Continuation Checkpoint

Last reviewed: 2026-08-24

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

## Tasks MVP foundation

**Status:** Implemented and locally verified on 2026-09-05.

**Completed:**

- Added the first-class, Clerk-owned `tasks` table with Eisenhower signals,
  energy/interest fields, estimate, deadline, lifecycle status, and timestamps.
- Added migration `0013_yielding_karen_page` and applied it to the development
  database without changing Practices/Retention tables or routes.
- Added authenticated list/create/update/complete/archive task endpoints and
  generated OpenAPI Zod/client types.
- Added a focused Tasks page at `/tasks` with quick add, edit, complete, archive,
  active/inbox ordering, completed visibility, and navigation beside Board and
  Practices.

**Verified:** Migration generation, development schema push, full workspace
typecheck, API build, clean API/web workflow restart, health 200, signed-out
task access returning 401, and signed-out landing-page rendering.

**Not yet verified:** Authenticated task create, reload/list persistence, edit,
complete, archive, and cross-account ownership behavior because the available
browser preview session is signed out.

**Do not start:** Projects, dependencies, calendar integrations, AI, reminders,
notifications, or changes to Practices/Retention as part of this slice.

## Nullable Activity → Board association foundation

**Status:** Complete and verified on 2026-08-24.

**Completed:**

- `activities.boardCardId` is nullable in the Drizzle schema and exported through
  the existing database schema barrel.
- Migration `0012_dry_solo` adds the nullable integer column and the foreign key to
  `board_cards.id` with `ON DELETE SET NULL`; the development database has the
  column and constraint applied.
- OpenAPI, generated Zod schemas, and generated React client schemas expose the
  optional nullable `boardCardId` on Activity, ActivityInput, and ActivityUpdate.
- Authenticated Activity create and update validate that a supplied Board card is
  owned by the current user before saving it. Activity titles remain independent
  values.

**Verified:** Migration generation, development schema push, direct database
inspection of nullability and the `SET NULL` rule, full workspace typecheck, API
build, and clean API/web workflow restarts.

**Not verified:** Authenticated create/update requests and cross-account behavior
through a real Clerk browser session, because the available preview session is
signed out.

**Do not start:** Scheduling, Board occurrence UI, drag-and-drop, AI planning,
replanning, Journal integration, reality timestamps, energy tracking, analytics,
or offline Board support.

## Manual Board-card scheduling

**Status:** Implemented and locally verified on 2026-08-24.

**Completed:**

- Active Board cards have a simple Schedule action.
- The scheduling form accepts a date, start time, and either a duration or end
  time; an existing estimated duration is used as the default.
- Each confirmation creates a new normal Activity with the Board card's title,
  category, and `boardCardId`. The Board card is not archived or otherwise
  changed, so it can create multiple independent occurrences.
- The selected Activity day is invalidated after creation so the existing Today
  view can show the occurrence when that date is selected.

**Verified:** Full workspace typecheck, API build, workflow-equivalent web
production build, clean web workflow restart, and signed-out browser preview
without application errors.

**Not verified:** Authenticated scheduling requests, duplicate occurrence rows,
cross-account ownership rejection, completion behavior, and Today refresh with
real private data because the available browser session is signed out.

**Do not start:** Drag-and-drop, AI or automatic scheduling, recurring
scheduling, planning/replanning changes, actual-time or Reality tracking, energy
or delay tracking, Journal/Retention changes, analytics, insights, or offline
Board support.

## Current checkpoint

**Active work:** Persistent Board foundation.

**Status:** The Board card database table, Drizzle migrations, generated contract
outputs, and authenticated owner-scoped CRUD API are implemented. Board cards
use `archivedAt` as their only lifecycle mechanism; there is no card completion
state. The development database contains the corrected table. The existing Board
screen remains compatible with the agreed five categories and sends the API's
default priority.

The Board UI usability slice is also complete: active cards are shown in five
category columns with title, priority, optional estimated duration, and optional
deadline at a glance. Notes remain available through edit. Create, edit, archive,
and move-up/move-down ordering continue to use the existing API.

**Verified:** API and web typechecks, API build, migration generation including
the status-column removal, development schema push, clean API/web workflow
restarts, clean startup logs, and signed-out Board access returning 401 without
private data. The workflow-matched web production build and signed-out browser
preview also pass; authenticated card interactions remain unverified because the
available browser session is signed out.

**Not yet verified:** Authenticated Board create/list/update/archive flows and
cross-account isolation with real Clerk sessions. The attached task's stop
condition is otherwise reached; do not add Board UI behavior, scheduling,
drag-and-drop, AI, or related integrations in this slice.

**Active work:** Retention-curve implementation follow-up and the minute-practice
stopwatch verification are complete locally. The latest completed working area
was the timestamp-based stopwatch recording path.

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
- The minute-practice stopwatch uses timestamp-derived elapsed time, rounds
  recorded minutes to one decimal place, preserves a captured duration across
  API failure for retry, rejects durations that would round to zero, and
  prevents duplicate submission claims. Focused stopwatch tests, full
  workspace typecheck, production web build, workflow restart, and signed-out
  browser preview pass. No API, schema, migration, retention calculation,
  half-life, or chart changes were introduced.
- The retention follow-up fixed a strict TypeScript inference error in the
  chart's effective-anchor collection; OpenAPI codegen, full workspace
  typecheck, API build, API/web workflow restart, and signed-out preview pass.
- Activity sync no longer re-enters its queue automatically when a server error
  changes the sync status.
- The server wake indicator now listens only to health-check responses, so a
  feature/database error cannot make the global day-space status flicker.
- The development database contains the retention tables and the activity
  reminder columns from migration `0008_optimal_wallop`.

## Not yet verified for this checkpoint

- Authenticated create, edit, delete, and observation flows with real data.
- Chart behavior after a new personal high and after changing retention speed.
- Backdated personal-high behavior, historical snapshot immutability, and
  chart segmentation after backdated observations.
- An authenticated production end-to-end Journal create/list flow through the
  Render deployment. The local endpoint contract, Supabase schema, and client
  refresh path are aligned, but this still needs a user-authenticated live
  confirmation after the latest release.
- Browser-push alarm behavior and delivery infrastructure.
- Authenticated stopwatch interaction through the private retention page remains
  unverified because the available browser preview is signed out. The source
  path and focused behavior tests are verified locally.

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

For the retention MVP, the next safe product check is authenticated local
runtime verification of first observation, higher/lower/equal observations,
minute stopwatch start/done/retry behavior, speed changes, backdated highs,
snapshot immutability, and chart segmentation.
The signed-out preview cannot exercise those private flows. After that, the
next release boundary is one authenticated live create and reload through
Render. Do not begin alarm delivery until the user explicitly chooses between
browser push while the tab is closed and in-app-only reminders.

## Do not start yet

Do not begin browser-push alarms, notification delivery, automatic calibration,
or broader AI expansion until the product behavior and release boundary are
explicit. Do not treat database reminder columns as an implemented alarm
feature.