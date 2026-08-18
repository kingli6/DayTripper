---
name: Offline status authority
description: How Day Tripper should decide whether the browser can reach its API.
---

For Day Tripper's offline activity state, a successful authenticated API
response is stronger evidence of reachability than `navigator.onLine`. An HTTP
5xx response also proves that the API was reached, so it must remain a server
error rather than being converted into offline state or a queued write.

**Why:** Preview iframes and embedded browser environments can retain a stale
offline signal even while journal or other API mutations succeed. Treating the
browser signal as the only authority creates a contradictory UI and can block
normal activity requests.

**How to apply:** Keep browser offline/online events for fast local behavior and
genuine offline queuing, but subscribe to API lifecycle successes and recover
the activity connection state from real server contact. Treat missing HTTP
responses as potential connectivity/cold-start failures, while keeping
received 5xx responses as explicit server errors. Do not use this rule to hide
actual failed requests.