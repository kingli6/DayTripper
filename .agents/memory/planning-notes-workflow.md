---
name: Planning notes workflow
description: Product decisions for turning tagged journal notes into an AI-assisted schedule without silent changes.
---

Treat journal notes and scheduled activities as separate things. A built-in Schedule tag means a note is eligible for future planning, not that it must be scheduled. Urgent and Important should influence attention without silently forcing placement.

**Why:** The user needs to remember open loops without deciding the date immediately, while keeping control over what the AI considers and what ultimately reaches the saved schedule.

**Priority:** This is the highest-priority upcoming feature and should be built before other new planning features.

**How to apply:** Build in this order:
1. Add built-in tags: Schedule, Urgent, Important, and Someday. Allow roughly 12 custom tags and no more than 5 tags per note, with rename/archive rather than destructive deletion.
2. Preserve the source note when an activity is later created, so a scheduled activity can be traced back to its journal context.
3. Add a pre-planning selection stage where the user chooses required inputs. Use Include, Consider, and Leave out for the current session. Send selected notes plus a small relevant shortlist rather than the whole journal.
4. Add a Start planning action that triggers the first AI draft.
5. Add a conversational draft stage with iterative adjustments and explicit Save this plan / Keep editing actions. Existing schedule items remain unchanged until save.

Selected notes must be required inputs to the draft, but not automatically saved activities. If selected items cannot fit, the AI should explain the conflict and ask for a decision rather than silently dropping them.

Keep these concepts distinct: remembered note, suggested item, drafted item, and saved activity. Schedule-tagged notes should not all appear in every planning session; show the user's chosen notes and a bounded, clearly labelled relevant shortlist.

While the current review flow remains, use Add selected suggestions and Add all remaining suggestions as the accurate meanings of its two actions. The eventual conversational flow should retire those two final accept buttons.