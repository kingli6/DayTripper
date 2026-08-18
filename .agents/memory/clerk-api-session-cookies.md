---
name: Clerk API session cookies
description: Session-cookie behavior for protected API calls from proxied web artifacts.
---

Protected API calls from the web client must explicitly use `credentials: "include"` rather than relying on the browser default.

**Why:** The app and API can be served through different preview or deployment proxy origins, and relying on the default `same-origin` policy can make an apparently signed-in Clerk client receive HTTP 401 responses.

**How to apply:** Keep the shared API fetch wrapper responsible for including credentials on every request. Verify protected requests after restarting both the web and API workflows; signed-out requests should still return 401.