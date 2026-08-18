# Durable Working Memory

- [Day distribution](day-distribution.md) — ongoing activities stay outside fixed-duration summaries until an end time is recorded.
- [Gemini secret injection](gemini-secret-injection.md) — a stored Gemini secret may require secure re-confirmation and an API workflow restart before the process receives it.
- [OpenAPI timestamp validation](openapi-timestamp-validation.md) — keep generated timestamp fields as strings when the workspace’s Zod generator cannot support date-time helpers.
- [Private activity caching](private-activity-caching.md) — user-scoped activity responses must bypass HTTP caching and include the active Clerk user in client cache keys.
- [External database deployment](external-database-deployment.md) — keep local Replit DATABASE_URL intact; set the external PostgreSQL URL as DATABASE_URL on the deployment host.
- [Render wake state](render-wake-state.md) — infer cold starts from successful API contact and use explicit wake actions; continuous polling prevents the free tier from sleeping.
- [Planning notes workflow](planning-notes-workflow.md) — build planning notes, user-selected inputs, then conversational draft approval before saving a schedule.