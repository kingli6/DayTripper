---
name: Execution session atomicity
description: Completion must serialize on the session before mutating its task.
---

Lock the active execution-session row inside the completion transaction before
applying the task mutation; recurring compare-and-swap protects occurrence
advancement, but the session lock also prevents concurrent one-off completion
requests from both updating the task.

**Why:** A task status update alone cannot stop two concurrent Complete requests
from both changing a non-recurring task before one session update loses the race.

**How to apply:** Keep session ownership/status validation, task mutation, and
session terminal update in one transaction, and preserve the occurrence anchor
as server-side session data.