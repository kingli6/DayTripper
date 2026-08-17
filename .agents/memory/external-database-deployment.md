---
name: External database deployment
description: How this workspace separates local Replit database access from an external PostgreSQL database used by a hosted deployment.
---

The app should keep using Replit's runtime-managed `DATABASE_URL` during local development. For a separate host such as Render, provide that host's `DATABASE_URL` with the external PostgreSQL connection string; do not overwrite the local runtime-managed variable or put the URI in shell history.

**Why:** Replit reserves `DATABASE_URL` locally for its managed database, while the deployment host needs the same conventional variable name to start the existing Drizzle/Express app without a code rewrite.

**How to apply:** Use the hosting provider's encrypted environment-variable settings for the external URI. If testing Supabase from Replit is necessary, use a separate temporary secret and an explicit opt-in rather than making the running preview prefer it accidentally.