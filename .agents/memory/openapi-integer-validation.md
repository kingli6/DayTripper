---
name: OpenAPI integer validation
description: Compatibility rule for integer request and response fields in the workspace OpenAPI/Zod generation pipeline.
---

The workspace's current OpenAPI-to-Zod generator can emit `zod.int()`, but the installed Zod version does not provide that top-level helper. Represent new integer fields as bounded `number` values in OpenAPI and enforce `Number.isInteger` in the server route when whole numbers are required.

**Why:** Regenerating clients with OpenAPI `type: integer` caused the generated library build to fail before the feature could typecheck.

**How to apply:** Keep the generated contract compatible with the workspace's existing Zod version, then add explicit integer checks at the request boundary and normalize server-owned integer response fields.