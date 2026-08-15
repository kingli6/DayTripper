# Day Tripper Product Contract

## Product purpose

Day Tripper is a private, forgiving day planner for people whose days do not
always follow the original plan. It helps a person keep the next meaningful
thing close, leave valid empty time, recover when plans change, and optionally
notice patterns in their own recorded experience without judgment.

The product is not a productivity scoreboard, an ideal-day generator, or an
automated assistant that changes a person's schedule without permission.

## Core daily user loop

1. Open a private view of the current day.
2. See what matters next, what is current, what has passed, and where open time
   remains.
3. Add, edit, complete, undo, move, or remove activities manually.
4. Keep manual changes authoritative and saved immediately.
5. If the day changes shape, optionally ask to review the changes or re-plan
   the remaining day.
6. Review any AI suggestion separately from confirmed activities.
7. Accept only the proposal items the user chooses.
8. Optionally record a reflection or activity review; missing reflection is
   neutral.

## AI approval rules

- AI creates proposals, never silent schedule changes.
- AI must not create, move, rename, complete, or delete saved activities
  without explicit user approval.
- Locked activities must remain protected.
- Empty time is valid and must not be filled automatically.
- AI output must be validated on the server before display.
- Only accepted proposal items become normal saved activities with
  server-owned IDs and timestamps.
- Rejected or unaccepted proposal items must not become confirmed activities.
- AI planning requires an internet connection and must fail clearly when it is
  unavailable.
- AI credentials remain server-side and are never sent to browser or mobile
  clients.
- Personal notes and historical context are used for AI only when the user
  explicitly allows them.
- AI must not invent deadlines, commitments, or completed work.

## Manual edit behavior

- Manual edits save immediately through the server.
- Manual edits remain authoritative.
- Manual edits never require AI approval.
- Manual edits do not automatically trigger an AI re-plan.
- An activity may be ongoing when it has no end time.
- An activity does not become completed merely because its end time has passed.
- Users are never required to plan every hour.
- Schedule editing must remain separate from optional reflection.

## Review changes and controlled re-planning

“Review changes” is an explicit, optional user action. It may show what moved,
extended, shortened, was renamed, removed, replaced, or completed later than
planned, along with optional user notes and the time of change.

When the user asks to re-plan the remaining day, the proposal must consider
current time, completed activities, remaining activities, locked activities,
manual changes, user notes allowed for planning, empty time, buffers,
recovery, and activities that no longer fit.

The user must be able to continue with the current schedule, reject the
proposal, edit it, accept selected changes, or accept the complete proposal.
The app must clearly show what stays, moves, shortens, is removed, remains
optional, or depends on an assumption.

## Activity categories

Each activity may have one optional primary category:

- Work
- Recovery
- Managing
- Social
- Fun

Categories are descriptive, not targets. Uncategorized activities remain
valid. Any day-distribution view must be a neutral mirror of recorded
activities, use text or icons in addition to color, and avoid good/bad or
healthy/unhealthy interpretations.

## Lock and pin meanings

- **Lock:** protects an activity on today's schedule. AI proposals and
  controlled re-planning must not move, delete, complete, or otherwise change
  a locked activity without explicit user action.
- **Pin:** saves an activity as a reusable template. A pin does not
  automatically add the activity to a day and does not lock its scheduled
  occurrence.

These meanings must remain distinct in data, API behavior, and UI copy.

## Reflection rules

Reflection is optional and separate from schedule editing. It may include:

- Effort: Very easy, Easy, Moderate, Demanding, or Very demanding.
- Energy impact: Restorative, Neutral, or Draining.
- Optional daily notes such as what worked, what did not work, what was
  unexpectedly difficult, what to change next time, or what was disappointing
  or encouraging.

The app must not ask for reflection after every activity by default. Missing
reflection is neutral. Reflection must not create streaks, productivity
scores, ideal targets, diagnosis, or judgment.

## Privacy rules

- Every private record belongs to the authenticated user on the server.
- The browser must never be the source of truth for an owner ID.
- Unauthenticated requests to private data return an appropriate unauthenticated
  response and do not reveal private records.
- The server/database is the permanent source of truth.
- AI credentials are server-only.
- Personal notes are not sent to AI unless the user explicitly opts in.
- Do not add third-party analytics without a clear privacy reason and consent
  plan.
- The product must not use streaks, productivity scores, shame-based
  notifications, ideal lifestyle targets, or judgmental status labels.
- Users should eventually be able to exclude reflections and personal notes
  from future AI planning.

## Offline rules

The timeline may eventually support limited current-day offline resilience.
When offline, the user may view the recently loaded current day, make basic
activity changes, complete activities, and add notes. The UI must show whether
changes are synced, saving, offline, waiting to sync, or failed to sync.

Offline behavior must never silently discard edits, store credentials in
browser storage, or pretend that AI planning works offline. The server remains
the permanent source of truth. Complex multi-device conflict resolution and
offline AI generation are deferred.

## Explicitly deferred features

The following are not part of the current private activity boundary:

- AI planning proposals and AI Studio
- Proposal review and partial acceptance
- Review changes and controlled re-planning
- Change history
- Optional activity reflection
- Neutral pattern summaries
- Offline sync resilience
- Drag-and-drop scheduling
- Habit formation systems
- Mood tracking
- Personal value scoring
- Automated coaching
- Productivity scores, streaks, or ideal-day targets
- Third-party analytics
- Android packaging
- iOS and separate native desktop applications

## Disallowed product language and patterns

Do not use or imply:

- “Optimized schedule”
- “Perfect day”
- “Failed plan”
- “Productivity score”
- “Good day” or “bad day”
- Automatic balancing
- Silent AI changes
- Automatic completion because time passed
- Required reflection
- Health or diagnostic conclusions
- Shame-based notifications
- Emoji as the primary meaning of an important control

Prefer language such as:

- Suggested plan
- One workable version
- Possible way to shape the day
- Re-plan the rest of the day
- Resolve schedule conflicts
- Open time
- Held lightly