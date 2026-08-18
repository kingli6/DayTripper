# Durable Working Memory

- [Top priority: planning notes](planning-notes-workflow.md) — build tagged notes, user-selected planning inputs, and conversational approval before other new planning features.
- [Day distribution](day-distribution.md) — ongoing activities stay outside fixed-duration summaries until an end time is recorded.
- [Gemini secret injection](gemini-secret-injection.md) — a stored Gemini secret may require secure re-confirmation and an API workflow restart before the process receives it.
- [OpenAPI timestamp validation](openapi-timestamp-validation.md) — keep generated timestamp fields as strings when the workspace’s Zod generator cannot support date-time helpers.
- [Private activity caching](private-activity-caching.md) — user-scoped activity responses must bypass HTTP caching and include the active Clerk user in client cache keys.
- [External database deployment](external-database-deployment.md) — keep local Replit DATABASE_URL intact; set the external PostgreSQL URL as DATABASE_URL on the deployment host.
- [Render wake state](render-wake-state.md) — infer cold starts from successful API contact and use explicit wake actions; continuous polling prevents the free tier from sleeping.
- [Clerk API session cookies](clerk-api-session-cookies.md) — shared browser API calls should explicitly include credentials when app and API are proxied through artifact routes.
- [Continuation checkpoints](continuation-checkpoints.md) — resume from a verified canonical handoff, not from stale pasted transcripts or milestone notes.
- [Offline status authority](offline-status-authority.md) — successful API contact should override stale navigator.onLine signals in the activity sync UI.