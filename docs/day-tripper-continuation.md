# Day Tripper Continuation Checkpoint

Last reviewed: 2026-08-18

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

## Current checkpoint

**Active work:** Retention MVP, previously called the Decay Clock refinement
gate.

**Status:** Implementation is present in the current revision; authenticated
runtime verification is the next boundary.

**Approved product boundary:**

- Multiple private, user-owned practices.
- One numeric measure and custom unit per practice.
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

## Not yet verified for this checkpoint

- Full workspace typecheck and workflow-matched build after the retention
  revision.
- Development database schema availability in the currently running database.
- Authenticated create, edit, delete, and observation flows with real data.
- Chart behavior after a new personal high and after changing retention speed.
- Production Supabase schema and deployed retention behavior.
- Whether the retention calculation should be extracted from the chart into the
  dedicated model module requested in the approved architecture.

## Next safe action

Run the targeted checks and restart the relevant workflows, then exercise one
authenticated practice end to end:

1. Confirm generated types and API/server/frontend typechecks.
2. Confirm the development retention tables are available without replacing
   the runtime-managed local database URL.
3. Verify create, edit, delete, record observation, and refresh persistence.
4. Verify that recorded values and estimated retention are clearly distinct.
5. Verify that a higher observation becomes the new current reference.
6. Verify that Slow → Fast changes the projection without changing recorded
   observations.
7. Record the result here before starting any new feature work.

## Do not start yet

Do not begin lower-is-better measures, state awareness, reflection, operations
metrics, notifications, automatic calibration, or broader AI expansion until
this MVP has been verified and the next product decision is explicit.

## Older handoff reconciliation

The attached continuation excerpt described the end of the contract/database
and route chunks as if the UI work were still pending. The current revision
contains the routes and retention UI, so that excerpt is historical and must
not be used as the next instruction. The next instruction is verification,
not reimplementation.