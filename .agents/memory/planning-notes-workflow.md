---
name: Planning notes workflow
description: Product decisions for turning tagged journal notes into an AI-assisted schedule without silent changes.
---

Treat journal notes and scheduled activities as separate things. A built-in Schedule tag means a note is eligible for future planning, not that it must be scheduled. Urgent and Important should influence attention without silently forcing placement.

**Why:** The user needs to remember open loops without deciding the date immediately, while keeping control over what the AI considers and what ultimately reaches the saved schedule.

**How to apply:** Build in this order:
1. Add built-in and bounded custom note tags, preserving the source note when an activity is later created.
2. Add a pre-planning selection stage where the user chooses required inputs; send selected notes plus a small relevant shortlist rather than the whole journal.
3. Add a conversational draft stage with a Start planning action, iterative adjustments, and explicit Save this plan / Keep editing actions. Existing schedule items remain unchanged until save.

Selected notes must be required inputs to the draft, but not automatically saved activities. If selected items cannot fit, the AI should explain the conflict and ask for a decision rather than silently dropping them.

While the current review flow remains, use Add selected suggestions and Add all remaining suggestions as the accurate meanings of its two actions. The eventual conversational flow should retire those two final accept buttons.