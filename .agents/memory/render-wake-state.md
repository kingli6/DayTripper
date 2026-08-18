---
name: Render wake state
description: How Day Tripper communicates a sleeping or cold-starting API without keeping the free-tier service awake.
---

Treat a sleeping server as a client-visible lifecycle state, not as a generic network error. A successful API response means the service is ready; a long idle window or a likely cold-start failure means it may be resting; an explicit health request is the only wake action.

**Why:** A continuous health poll would keep a Render free-tier service awake and defeat the behavior the UI is meant to explain. The server also cannot report that it is asleep while it is unreachable.

**How to apply:** Track successful API contact in the shared client, avoid background polling, show a user-triggered wake control, and keep any failed/queued action available for an explicit “Wake & continue” retry.