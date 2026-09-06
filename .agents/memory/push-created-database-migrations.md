---
name: Push-created database migrations
description: How to handle append-only migrations when the development database was created by schema push rather than recorded migration history
---

When a development database has the expected schema but an empty migration history, the migration runner cannot replay the full historical journal safely. Generate the new append-only migration, verify its dependency scope, and apply only that new migration SQL transactionally; do not force a schema push when unrelated drift would delete data.

**Why:** Schema-push-created development databases can contain tables and data without matching migration records, while a full migrate attempts to recreate already-existing objects. Force-pushing can also bundle unrelated destructive drift into an otherwise focused change.

**How to apply:** Confirm the current database dependencies first, keep historical migration files unchanged, validate the new migration's operation order, and apply only the verified new migration against the matching development database.