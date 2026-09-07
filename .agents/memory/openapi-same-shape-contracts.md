---
name: OpenAPI same-shape contracts
description: A verification rule for OpenAPI operations that use schemas with identical fields.
---

When introducing or extending an OpenAPI schema with the same fields as an existing schema, make edits scoped to the schema header and verify both the intended and neighboring generated operation shapes after code generation.

**Why:** A context-matching patch can change a neighboring operation’s required fields instead of the intended one, while the YAML and TypeScript still compile successfully.

**How to apply:** Check generated response schemas and operation signatures for both the existing and neighboring endpoints before treating contract regeneration as complete; then inspect any server path that returns the shared shape directly from the database.