---
name: Drizzle schema drift
description: Existing development database drift involving the legacy journal_entries table and destructive Drizzle push prompts.
---

The development database still contains a legacy `journal_entries` table with
rows even though the current schema/migration history no longer includes it.
Drizzle push detects that mismatch and may prompt to delete the table and its
data alongside an unrelated additive schema change.

**Why:** Forcing the push would make an unrelated data deletion part of a
feature migration and cannot be safely undone.

**How to apply:** Inspect generated SQL before pushing. Never use the force
option for this drift. Apply only the verified additive change needed by the
feature, and leave the legacy-table cleanup for an explicit, separately
approved migration.