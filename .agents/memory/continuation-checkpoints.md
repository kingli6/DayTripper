---
name: Continuation checkpoints
description: The project uses a canonical handoff file to resume safely across context boundaries.
---

Use `docs/day-tripper-continuation.md` as the first resume document after a
session or context boundary. It separates approved product scope from verified
implementation state and explicitly lists the next safe action.

**Why:** Pasted transcripts and milestone notes can lag behind the current
source tree. Replaying an older chunk can duplicate work or move the product
back across an already-approved boundary.

**How to apply:** Verify the checkpoint against the current source and runtime
before editing. Update the checkpoint before context becomes tight, and never
mark a feature complete solely because its files exist.