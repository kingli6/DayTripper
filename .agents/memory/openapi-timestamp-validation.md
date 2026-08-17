---
name: OpenAPI timestamp validation
description: Compatibility constraint for generated API schemas around timestamp strings
---

When an API timestamp only needs to cross the boundary as an ISO-like string, do not add an OpenAPI `date-time` format unless the generated validator stack supports it. In this workspace, the generated Zod validator uses a version without `z.iso.datetime`, so the format causes the shared library typecheck to fail.

**Why:** The OpenAPI generator and installed Zod runtime are on different feature levels; the failure appears only after code generation and blocks every dependent package.

**How to apply:** Represent timestamp responses as `type: string` at the OpenAPI boundary and keep actual timestamp persistence/serialization in the server and database layers.