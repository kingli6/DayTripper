---
name: Cross-cutting feature removal
description: Durable checklist for removing a feature that spans UI, API contracts, generated code, persistence, and admin tooling.
---

When retiring a cross-cutting product feature, remove its live UI, navigation, API routes, OpenAPI definitions, generated clients, schema exports, admin metrics/reset logic, and current documentation together. Preserve historical migrations and snapshots, then add one new append-only migration for the destructive database change.

**Why:** Generated contracts and historical migration files are intentionally separate from the live source surface; deleting history breaks migration continuity, while leaving generated or admin references creates stale runtime paths.

**How to apply:** Audit consumers first, make the source-of-truth changes, regenerate contracts/migrations, search the live tree, typecheck/build, restart workflows, and smoke-test both a preserved endpoint and the retired route.