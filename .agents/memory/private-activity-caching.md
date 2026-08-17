---
name: Private activity caching
description: Keep authenticated, user-scoped activity responses out of browser HTTP caching.
---

Authenticated activity lists must not rely on browser or intermediary HTTP caching; React Query is the freshness layer and cache keys must include the active Clerk user.

**Why:** A conditional request can return `304 Not Modified`; treating that response as JSON data yields `null`, which makes a valid activity list render as empty. Shared date-only cache keys can also reuse one Clerk session's private data after an account switch.

**How to apply:** Use `cache: "no-store"` for the shared API fetcher, send `private, no-store` on user-scoped list endpoints, and include the active Clerk user ID in client query keys without sending it as an ownership parameter.