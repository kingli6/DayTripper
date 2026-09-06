---
name: OpenAPI same-shape contracts
description: A verification rule for OpenAPI operations that use schemas with identical fields.
---

When introducing a new OpenAPI schema with the same fields as an existing schema, verify the operation-to-schema reference in the generated client after code generation.

**Why:** A context-matching patch can change the neighboring operation’s `$ref` instead of the intended one, while the YAML and TypeScript still compile successfully.

**How to apply:** Check the generated operation signatures for both the existing and new endpoints before treating contract regeneration as complete.