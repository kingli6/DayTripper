# Durable Working Memory

- [Day distribution](day-distribution.md) — ongoing activities stay outside fixed-duration summaries until an end time is recorded.
- [Gemini secret injection](gemini-secret-injection.md) — a stored Gemini secret may require secure re-confirmation and an API workflow restart before the process receives it.
- [OpenAPI timestamp validation](openapi-timestamp-validation.md) — keep generated timestamp fields as strings when the workspace’s Zod generator cannot support date-time helpers.
- [Private activity caching](private-activity-caching.md) — user-scoped activity responses must bypass HTTP caching and include the active Clerk user in client cache keys.