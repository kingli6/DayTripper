---
name: Generated versus runtime AI schemas
description: How to keep provider-generated JSON validation strict when a schema is only used internally by an AI prompt.
---

An OpenAPI schema that is not referenced by an endpoint response or request may produce client TypeScript types without a runtime Zod parser in the generated server package. AI/provider payloads still need strict runtime validation at the server boundary, so define a local strict validator or make the schema part of an actual contract path.

**Why:** The execution interview’s provider response is an internal model payload, not an HTTP response. Assuming codegen would emit a runtime validator caused a compile-time failure and would have left the provider boundary unchecked.

**How to apply:** Keep the internal schema in OpenAPI for shared documentation/types, but pair it with a server-side strict validator that rejects unknown keys, bounds strings/numbers, and constrains enums before any database writes.