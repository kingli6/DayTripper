# Durable Working Memory

- [Top priority: planning notes](planning-notes-workflow.md) — build tagged notes, user-selected planning inputs, and conversational approval before other new planning features.
- [Day distribution](day-distribution.md) — ongoing activities stay outside fixed-duration summaries until an end time is recorded.
- [Gemini secret injection](gemini-secret-injection.md) — a stored Gemini secret may require secure re-confirmation and an API workflow restart before the process receives it.
- [OpenAPI timestamp validation](openapi-timestamp-validation.md) — keep generated timestamp fields as strings when the workspace’s Zod generator cannot support date-time helpers.
- [OpenAPI integer validation](openapi-integer-validation.md) — preserve integer semantics in server validation because this workspace’s Zod generator emits unsupported `zod.int()`.
- [Generated versus runtime AI schemas](generated-runtime-ai-schemas.md) — model-only OpenAPI schemas generate TypeScript types but not runtime Zod parsers, so validate provider JSON at the server boundary.
- [Gemini provider quotas](gemini-provider-quotas.md) — a valid first interview turn can be followed by provider HTTP 429; preserve safe retry metadata before diagnosing session state.
- [Private activity caching](private-activity-caching.md) — user-scoped activity responses must bypass HTTP caching and include the active Clerk user in client cache keys.
- [External database deployment](external-database-deployment.md) — keep local Replit DATABASE_URL intact; set the external PostgreSQL URL as DATABASE_URL on the deployment host.
- [Render wake state](render-wake-state.md) — infer cold starts from successful API contact and use explicit wake actions; continuous polling prevents the free tier from sleeping.
- [Clerk API session cookies](clerk-api-session-cookies.md) — shared browser API calls should explicitly include credentials when app and API are proxied through artifact routes.
- [Continuation checkpoints](continuation-checkpoints.md) — resume from a verified canonical handoff, not from stale pasted transcripts or milestone notes.
- [Offline status authority](offline-status-authority.md) — successful API contact should override stale navigator.onLine signals in the activity sync UI.
- [Cross-cutting feature removal](cross-cutting-feature-removal.md) — remove runtime, generated contracts, schema source, and admin paths together; preserve history and append a destructive migration.
- [Drizzle schema drift](drizzle-schema-drift.md) — do not force schema push when legacy journal_entries drift prompts deletion; apply only verified additive changes.
- [Push-created database migrations](push-created-database-migrations.md) — when development schema history is empty, apply a verified new migration without replaying the full journal.
- [OpenAPI same-shape contracts](openapi-same-shape-contracts.md) — after adding a duplicate-shaped schema, verify each operation’s generated input type so refs do not silently swap.
- [Execution session atomicity](execution-session-atomicity.md) — serialize completion on the session row before mutating its task; recurrence CAS alone is not enough for one-off tasks.