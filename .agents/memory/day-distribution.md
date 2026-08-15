---
name: Day distribution
description: Product rule for representing activity durations in the neutral day summary.
---

Ongoing activities must not be assigned an invented duration in the day-distribution summary. They remain visible as a separate count until the user records an end time.

**Why:** An ongoing activity has no reliable duration yet, and estimating one would make the neutral mirror imply more certainty than the user's schedule contains.

**How to apply:** Include only positive, valid finite start/end intervals in category totals. Keep ongoing activities separate and explain that open time and uncategorized time remain valid.