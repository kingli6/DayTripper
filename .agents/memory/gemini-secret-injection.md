---
name: Gemini secret injection
description: Environment-specific behavior when the planner reports Gemini as unconfigured despite a stored key.
---

The planner may report Gemini as unconfigured when `GEMINI_API_KEY` exists in the Replit secrets store but is not present in the API workflow process environment. Securely re-confirming the secret and restarting the API workflow restored injection without exposing the key.

**Why:** The API status endpoint and workflow logs showed the process-level configuration state, which differed from the secret-store existence check.

**How to apply:** Check the server's safe AI status endpoint first; if it reports unconfigured while the secret exists, use the secure secret flow and restart the exact managed API workflow. Do not print or request the key in chat, and do not retry managed AI setup if the user declines an upgrade.