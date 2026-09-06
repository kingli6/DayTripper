# Day Tripper Continuation Checkpoint

Last reviewed: 2026-09-06

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

## Practice availability

**Status:** Implemented and locally verified on 2026-09-06.

**Completed:**

- Added nullable `repeat_interval_days` to existing retention practices and
  exposed `repeatIntervalDays` plus derived `nextAvailableDate` through the
  existing authenticated Practices API.
- Derived the next available calendar date from the latest recorded observation
  rather than creating a duplicate completion system. A null interval keeps a
  practice always available.
- Added the Repeat / availability setting to create/edit, including 1–5 day
  presets and a custom whole-day value. Availability remains guidance only;
  recording a result early is still allowed and recalculates the next date.
- Updated Practices to separate Ready now from Coming up, group upcoming items
  by relative date, and refresh list/detail availability after recording.

**Verified:** API/client codegen, workspace libraries, API/web typechecks, API
and web production builds, safe development-column application, clean workflow
restarts, health check, unauthenticated Practices privacy check, and signed-out
preview rendering.

**Database note:** The generated migration is additive. Drizzle push was not
forced because it detected an unrelated pre-existing `journal_entries` table
drift with two rows that it wanted to delete; only the new availability column
was applied to development.

## Product surface simplification

**Status:** Implemented and locally verified on 2026-09-06.

**Completed:**

- Normalized the primary navigation to Tasks, Today, Practices in that
  order across the existing product surfaces, while keeping `/admin` outside
  normal navigation and adding no Matrix route.
- Removed the retired secondary task repository and its UI, routes, API,
  generated contracts, database schema, and activity association. Existing
  Tasks, Today, Practices, authentication, planning, and AI paths remain.
- Added the append-only schema migration that removes the retired table and
  association from the development database; historical migrations remain
  unchanged.
- Replaced the separate visible Today planning actions with the single
  user-facing “Plan today” action. It still opens the existing day-planning flow
  for an open day and the existing replanning flow when a schedule remains.
- Kept Review changes as a secondary action and kept Add activity available.
- Removed the visible Today distribution summary and the incomplete
  Pin/Pinned activity control without changing the underlying activity model or
  data.

**Verified:** OpenAPI codegen, full workspace typecheck, API and web production
builds, clean API/web workflow restarts, API health 200, development schema
removal, no live source references, `git diff --check`, and signed-out preview
rendering without new application errors.

**Database note:** The normal schema-push prompt also detected unrelated
pre-existing `journal_entries` drift, so it was not forced. The new
append-only removal migration was applied directly after confirming the only
database dependency was the retired activity foreign key.

**Not yet verified:** Authenticated visual checks for the three navigation links,
Plan today routing, Today activities, and secondary status controls because the
available preview session is signed out.

**Do not start:** Any replacement pin/reuse workflow, distribution dashboard,
Matrix route, or unrelated redesign as part of this cleanup.

## Application shell and navigation

**Status:** Implemented and locally verified on 2026-09-06.

**Completed:**

- Added one shared shell navigation component for Tasks, Today, and Practices,
  using the existing `/tasks`, `/today`, and `/retention` routes.
- Replaced the separate Today, Tasks, and Practices desktop/mobile navigation
  implementations with one narrow expandable desktop rail and one mobile header.
- Kept the rail limited to primary navigation; page-specific actions remain in
  their page content.
- Moved the existing account, Operations, and sign-out controls into the
  persistent desktop rail footer and a compact mobile account menu.
- Quieted the normal authenticated server-ready state while preserving visible
  offline, pending, authentication, wake, and server-error states.
- Removed the redundant Today-specific account header and the old decorative
  shell copy without changing feature behavior, routes, APIs, or data models.

**Verified:** Day Tripper typecheck, API build, web production build with the
managed `PORT`/`BASE_PATH` values, clean web workflow restart, `git diff --check`,
no live Board references, and signed-out landing-page preview without new
browser errors after the final restart.

**Not yet verified:** Authenticated visual interaction with the expanded rail,
mobile account menu, account sign-out, and page-to-page active states because the
available preview session is signed out.

**Do not start:** Feature-page redesign, Today planning-dialog changes, Task or
Matrix row redesign, Practices functionality changes, new Settings feature, or
new Plan today task-selection behavior as part of this shell slice.

## Responsive shell audit

**Status:** Implemented and locally verified on 2026-09-06.

**Issues found and fixed:**

- The collapsed desktop rail account popover used a downward position from a
  bottom-anchored trigger, placing its actions below the viewport. It now opens
  upward while keeping its horizontal position inside the rail boundary.
- The mobile account popover had no viewport-height guard. It now stays within
  the available viewport height and scrolls internally if the viewport is too
  short.
- Mobile navigation and account controls were 36–40px targets. They now use
  larger responsive targets, with a narrow-width fallback and compact branding
  so the controls remain usable on very small screens.
- Mobile popover width is capped to the viewport to prevent horizontal overflow.

**Verified:** Typecheck, web production build, clean workflow restart,
`git diff --check`, HMR/browser logs without new application errors, and
signed-out preview rendering at 320×568 and 1440×900.

**Not available in the current preview session:** Direct authenticated
interaction with the desktop account popover, expanded/collapsed rail, active
route states, and mobile account menu. The code paths remain unchanged apart
from the responsive positioning and sizing corrections above.

**Preserved:** Tasks, Today, Practices, Tasks Matrix, planning/replanning,
account functionality, Operations, authentication, APIs, and database behavior.

## Personalized execution system — Step 1

**Status:** Backend foundation implemented and locally verified on 2026-09-06.

**Completed:**

- Added user-owned `execution_observations` records for evidence-based findings,
  including dimension, finding, optional state context, confidence, evidence
  count, source, and timestamps.
- Added one user-owned `execution_state` record for temporary low/normal/high
  energy and stress, optional available minutes, and capture time. Temporary
  state is separate from observations.
- Added authenticated owner-scoped endpoints:
  - `GET/POST /api/execution/observations`
  - `PATCH /api/execution/observations/:observationId`
  - `GET/PUT /api/execution/state`
- Added validation for state contexts, low/normal/high state levels,
  confidence range, required strings, non-negative whole-number evidence counts,
  and non-negative whole-number available minutes up to 1440.
- Added append-only migration `0017_even_colossus` and applied only its two new
  table definitions to development. Historical migrations remain unchanged.
- Regenerated OpenAPI Zod schemas and React client contracts.

**Verified:** Full workspace typecheck, API build, web production build,
OpenAPI codegen, development database table/column inspection, migration
history entry, API health 200, signed-out execution endpoint 401 responses,
workflow restarts, and `git diff --check`. No automated test script is
configured in the workspace.

**Database note:** The development database has an empty historical Drizzle
ledger because it was created by schema push. The normal migration runner would
replay old migrations and fail, so the new migration was applied transactionally
by itself and its hash was recorded. This follows the existing safe migration
boundary; no force push was used.

**Not yet verified:** Authenticated create/update/list persistence and
cross-account isolation through a signed-in browser/API session.

**Do not start:** UI, settings, profile, onboarding, dashboard, personality
surfaces, Tasks/Today/Practices changes, recommendation changes, or Gemini
integration as part of this backend-only step.

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
  active/inbox ordering, completed visibility, and navigation beside Today and
  Practices.

**Verified:** Migration generation, development schema push, full workspace
typecheck, API build, clean API/web workflow restart, health 200, signed-out
task access returning 401, and signed-out landing-page rendering.

**Not yet verified:** Authenticated task create, reload/list persistence, edit,
complete, archive, and cross-account ownership behavior because the available
browser preview session is signed out.

**Do not start:** Projects, dependencies, calendar integrations, AI, reminders,
notifications, or changes to Practices/Retention as part of this slice.

## Tasks matrix and local recommendation slice

**Status:** Implemented and locally verified on 2026-09-05.

**Completed:**

- Added an Eisenhower matrix to the existing Tasks page using active/inbox task
  records only. Importance `>= 3` is Important and urgency `>= 3` is Urgent.
- Added four clickable quadrants. Each compact task card shows title, estimate,
  energy, interest, and deadline when present, and opens the existing editor.
- Added a local “WHAT SHOULD I WORK ON?” panel with available minutes, current
  energy, and current interest inputs. The first version intentionally leaves out
  mental/physical energy inputs to keep the panel quick.
- Added deterministic top-three recommendations with human-readable reasons.
  No Gemini call, new API, database change, or duplicate task model was added.

**Ranking rule:** Priority contributes importance and urgency, then the score
adds deadline proximity, available-time fit, energy match, and interest match.
Priority remains the largest single influence, while a task with a better
time/energy/interest fit can beat a higher-priority task when the mismatch is
large.

**Verified:** Day Tripper typecheck, production build with the required `PORT`
and `BASE_PATH`, clean web workflow restart, signed-out `/tasks` auth behavior,
and no browser console errors beyond the existing Clerk development-key warning.

**Not yet verified:** Signed-in visual checks for populated quadrants and
recommendation reranking when minutes, energy, and interest change. The
available preview session is signed out.

**Do not start:** Gemini, AI memory, calendar blocks, Activities changes,
projects, dependencies, Google Calendar, notifications, or Practices/Retention
changes.

## Gemini task recommendations

**Status:** Implemented and locally verified on 2026-09-05.

**Completed:**

- Added authenticated `POST /tasks/recommend` using the existing server-only
  Gemini helper and `gemini-3-flash-preview`.
- The route loads only the signed-in user's `inbox` and `active` tasks and sends
  task decision signals plus current minutes and energy. Task-level interest
  remains available to Gemini as a property of each task; the user is no longer
  asked for a current-interest input. It does not send notes or other private
  planning context.
- Gemini is instructed to return at most three supplied task IDs, consider fit
  instead of simply choosing the highest priority, respect deadlines/urgency,
  and never invent task information.
- Server-side response validation filters unknown/duplicate task IDs and
  normalizes returned ranks.
- Gemini failures, timeouts, unavailable configuration, invalid JSON, invalid
  shapes, or no valid IDs fall back to the existing deterministic ranking.
- The Tasks panel now shows a loading state, calls the endpoint, labels
  AI-assisted results quietly, and still uses the local ranking if the request
  itself cannot reach the server.
- `GEMINI_API_KEY` was securely confirmed in the secret store and the API
  workflow restarted; `/api/ai/status` reports `configured: true` without
  exposing the key.

**Verified:** OpenAPI codegen, full workspace typecheck, API typecheck/build,
Day Tripper typecheck/build, `git diff --check`, clean API/web workflow
restarts, signed-out recommendation requests returning 401, and safe Gemini
configuration status.

**Not yet verified:** A signed-in recommendation request reaching Gemini and
the populated AI-assisted results in the browser. The available preview session
is signed out.

**Do not start:** Scheduling, calendar blocks, Activities changes, AI memory,
AI history tables, projects, dependencies, notifications, Google Calendar, or
Practices/Retention changes.

## Task recommendation input and completion safety

**Status:** Implemented and locally verified on 2026-09-05.

**Completed:**

- Removed current interest from the recommendation panel, frontend state,
  request contract, API validation, deterministic ranking inputs, and Gemini
  current-situation prompt.
- Kept the task-level `interest` field in task creation/editing and in the
  task data supplied to Gemini.
- Active-task completion now requires a pointer/touch-friendly three-second
  hold. The progress indicator cancels on release, cancellation, pointer leave,
  or unmount, and normal click does not complete the task.
- Completed-task ticks now restore the task with a normal click by using the
  existing task update route. Restoring sets the task to `active` and clears
  `completedAt`, so it returns to the active list and matrix.

**Verified:** OpenAPI codegen, full workspace typecheck, API and Day Tripper
typechecks, API and web production builds, `git diff --check`, clean API/web
workflow restarts, API health 200, signed-out recommendation and scheduling
requests returning 401, and signed-out preview rendering without new
application errors.

**Not yet verified:** Signed-in pointer/touch interaction for early release,
the full three-second hold, completed-task restore, and persistence after
reload. The available preview session is signed out.

**Do not start:** Practices/Retention, Activities/Today, scheduling,
projects/dependencies, notifications, or AI memory/history changes.

## Removed activity association

**Status:** Complete and verified on 2026-08-24.

**Completed:** The former activity association was retired with the secondary
task repository. Existing activities remain independent records.

**Verified:** The removal migration was generated and the existing activity
paths remain part of the product.

**Do not start:** New activity associations, replacement repositories, or
unrelated planning changes.

## Task → Today scheduling bridge

**Status:** Implemented and locally verified on 2026-09-05.

**Completed:**

- Added `POST /tasks/{id}/schedule` to the existing authenticated Tasks API.
- The route verifies that the task belongs to the signed-in user and is still
  `inbox` or `active` before creating a normal work Activity.
- The created Activity uses the task title, selected local date, start time, and
  duration-derived end time. The task itself is not completed, archived, or
  otherwise changed.
- Recommendation cards now offer “Work on this”, with a dialog for start time
  and duration defaulted from the task estimate.
- Successful scheduling invalidates the selected Today activity list and
  navigates to Today. Invalid inputs remain in the dialog with a visible error.
- OpenAPI, generated React client hooks, and generated Zod validators are
  aligned with the new endpoint.

**Verified:** OpenAPI codegen, full workspace typecheck, API typecheck, Day
Tripper typecheck, API production build, workflow-matched web production build,
`git diff --check`, clean API/web workflow restarts, health 200, signed-out
schedule/recommendation requests returning 401, and signed-out preview
rendering without new application errors.

**Not yet verified:** Authenticated scheduling with a real private task,
cross-account ownership rejection, activity persistence after reload, and the
Today screen showing the newly created occurrence. The available preview
session is signed out.

**Do not start:** Task-to-calendar integrations, automatic scheduling,
notifications, task/activity association columns, changes to Gemini
recommendation behavior, or Practices/Retention changes.

**Active work:** Retention-curve implementation follow-up and the minute-practice
stopwatch verification are complete locally. The latest completed working area
was the timestamp-based stopwatch recording path.

**Status:** The former Journal feature has been removed from the product. The
Today surface no longer exposes note creation or privacy controls, planning and
Gemini no longer receive note content, and the generated API surface no longer
contains Journal contracts. Historical migrations remain intact, with migration
`0014_pretty_hercules` dropping the retired `journal_entries` table.

The remaining planning flow continues to use the user's explicit intention,
available time, style, fixed commitments, saved activities, and conversation
messages. Task recommendations remain a separate task-only Gemini path.

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

## Personalized execution system — Step 3

**Status:** Complete for the internal deterministic execution-policy slice.

**Completed:**

- Added a reusable server-side `deriveExecutionPolicy` module that accepts
  task characteristics, current energy/stress/capacity, and stored
  observations.
- Added runtime validation for both policy input and output. The returned
  strategy, action style, duration, stopping-point flag, scope flag, and
  explanation are bounded and strictly checked.
- Implemented deterministic rules for high-stress ambiguity, low energy,
  limited time, high importance plus urgency, open-ended tasks, relaxed
  capacity, and sufficiently supported repeated postponement evidence.
- Kept state-dependent behavior separate and gradual: strong evidence can
  influence policy, while one weak observation cannot override deterministic
  state rules.
- Added nine focused unit tests using Node's built-in test runner. Tests do not
  use Gemini, the database, or the network.
- Kept the policy engine internal. No UI, route, OpenAPI contract, task
  recommender, Today flow, Practices flow, scheduling, or Gemini path changed.

**Verification:** Focused policy tests pass 9/9, full workspace typecheck,
API build, web production build with workflow variables, API workflow restart,
health 200, signed-out execution endpoint 401 protection, and `git diff
--check`.

**Example:** For the same 60-minute “Work on project” task with 60 minutes
available, high stress produces `bounded_focus`, a 15-minute
`concrete_first_action`, an explicit stopping point, and reduced scope.
High energy plus low stress produces `deep_work`, a 45-minute
`self_directed_progress` session, no required stopping point, and no scope
reduction.

## Personalized execution system — Step 4

**Status:** Complete for the user-controlled guidance foundation.

- Preserved user-owned execution observations, execution state, and the
  deterministic execution-policy module.
- Added optional capability scopes to observations. An empty scope is general
  guidance; selected scopes attach it to task recommendations, the task matrix,
  planning today, or re-planning.
- Added authenticated delete support alongside the existing list/create/update
  observation API, with generated OpenAPI Zod and React contracts.
- Replaced the former Today entry point with a compact Today-side guidance panel
  and editor supporting list, add, edit, remove, general guidance, and
  capability-specific guidance.
- Removed the retired route, UI, generated contracts, schema export,
  test, and current documentation. Historical migrations remain unchanged,
  with one append-only migration for removing the retired table and adding guidance
  column.

**Deliberately not included:** AI calls, recommendation changes, automatic
schedule edits, autonomous agents, or a large profile/settings area.