---
name: Gemini provider quotas
description: Safe diagnosis and retry handling for Gemini-backed multi-turn flows
---

For short multi-turn Gemini features, a successful first request does not prove
later requests are failing in application state. The provider can return HTTP
429 `RESOURCE_EXHAUSTED` with a retry delay even when the prompt history,
session record, and response logic are valid.

**Why:** A neutral reproduction of the adaptive interview produced valid JSON
on the first turn and then hit Gemini quota on the next immediate request.
Without provider status and retry metadata, that failure looks like a broken
conversation transition.

**How to apply:** On provider rejection, log only status, provider code/status,
retry delay, question/session identifiers, and bounded response-shape metadata.
Do not log prompts, answers, or raw provider payloads. Preserve retry timing in
the response when the client can safely try again.