# Day Tripper Build Status

Last reviewed: 2026-08-17

## Current milestone

**Prompt 16 — Offline safety safeguards in progress**

This milestone applies the uploaded edge-case review to the offline current-day
flow. Scope: preserve queued changes across session expiry, use a real service
reachability check before reconnect sync, reject stale multi-device updates
instead of silently overwriting them, and make logout/account switching
privacy-safe without silently discarding pending edits.

Prompt 15 is complete: the current day can be reopened from a user-scoped local
snapshot after a connection loss, basic activity changes can be held in a local
queue, and queued changes sync again when the connection returns. AI planning,
journal actions, and uncached dates remain connection-dependent.

The Prompt 1 documentation milestone and the core Activity contract milestone
are complete. Prompt 7 is complete: the existing responsive activity surface
supports safe editing and destructive-action recovery. Prompt 8 is complete:
activities use the five contract categories and the day view includes a neutral
duration mirror. Prompt 9 is complete: the server exposes a bounded, validated
planning proposal endpoint that never mutates saved activities. Prompt 10 is
complete: authenticated users can describe a day, add planning context, and
request a proposal without changing the saved timeline. Prompt 11 is complete:
users can review detailed suggested activities, edit or remove individual items,
reject or revise the proposal, and explicitly accept selected or remaining items
into the saved timeline.
Prompt 12 is complete: manual activity edits remain authoritative, schedule
changes are recorded privately with server timestamps, and users can open an
optional change review with an explanation note without triggering AI.
Prompt 13 is complete: users can ask for a remaining-day proposal, review
human-readable keep/move/shorten/remove/add changes, edit or remove individual
suggestions, and explicitly apply selected or all approved changes. The server
protects locked and completed activities, rejects stale schedule snapshots, and
records approved changes without silently rewriting the timeline.

The reviewed future-development comments are organized in
`docs/day-tripper-idea-log.md`. The source comments remain available at
`attached_assets/Pasted-My-comment-I-want-you-to-add-the-features-we-are-intend_1786958731273.txt`.
Features marked “Refinement required before building” must be clarified before
implementation.

Prompt 14 is complete: the private timestamped journal stream is available with
explicit planning permission.

## Existing completed areas

### Foundation

- React and TypeScript web shell
- Express API server
- Managed artifact workflows
- Root and API artifact routing
- Relative frontend-to-backend API communication
- PostgreSQL database connection and migration setup
- Health endpoint
- Privacy-safe API error responses
- Structured server logging
- Development and production commands
- Server-side Gemini configuration status without exposing credentials

### Private activity boundary

- Clerk-managed sign-in and sign-up routes
- Sign-out through Clerk
- Public signed-out landing page
- Authenticated application boundary
- Frontend authentication loading state
- Server-side authenticated user identity extraction
- `401` response for unauthenticated activity requests
- Required owner identifier on activity records
- Server-derived ownership on create
- Owner filtering on list
- Owner checks on update and delete
- Browser activity inputs do not include owner IDs
- Query cache is cleared when the authenticated user changes

### Activity persistence and timeline

- Activity list by date
- Activity creation
- Activity editing
- Explicit completion and undo
- Safe deletion confirmation
- Current date and previous/next date navigation
- Current-time indicator
- Current, upcoming, completed, passed, and ongoing activity presentation
- Valid empty-time presentation
- Loading, empty, and error states
- Responsive activity editor
- Category display and editing
- Optional activity notes
- Persisted lock status
- Persisted pin status
- Lock and pin controls in the existing activity editor
- Lock and pin labels on timeline activities
- Responsive activity detail surface on mobile and desktop
- Contract categories: Work, Recovery, Managing, Social, and Fun
- Optional category selection with an Uncategorized state
- Neutral “How today is distributed” duration summary
- Text labels and color cues for distribution rows
- Ongoing activities kept separate from fixed-duration totals
- Authenticated planning proposal endpoint
- Server-loaded existing and locked activities in planning context
- Optional historical context only when explicitly enabled
- Server-side AI proposal shape and time-block validation
- AI failures and malformed proposals return safe generic errors
- Planning proposals never write to the activities table
- Authenticated AI Studio entry points on desktop and mobile
- Natural-language day intention input
- Current-time and available-time context
- Lighter, balanced, and fuller planning styles
- Optional fixed commitments and explicitly approved historical context
- Clear proposal-only and internet-connection messaging
- Loading, error, retry, and empty-proposal states
- Detailed proposal review with editable suggested activities
- Proposal item selection, removal, restoration, and rejection
- Explicit partial or complete proposal acceptance
- Server-persisted accepted proposal activities with refreshed timeline
- Private schedule change history for manual moves, duration changes, renames,
  removals, and late completion
- Optional “Review changes” surface with an explanation note
- Completion and ongoing-status controls in the activity detail surface
- Controlled remaining-day re-planning with explicit approval
- Human-readable keep, move, shorten, remove, and add proposal changes
- Stale proposal detection before applying approved changes
- Unsaved-change confirmation on close
- Focus management, keyboard escape handling, visible focus states, touch-sized controls, and reduced-motion handling
- Delete confirmation with a short undo recovery action
- Private timestamped journal stream
- Optional activity and topic context on journal entries
- Private or explicitly planning-available journal privacy choice
- Journal filters, copy action, delete confirmation, and safe loading/error states
- User-scoped current-day offline snapshot
- Offline create, edit, completion, note, delete, and undo queue
- Reconnect sync with visible saving, waiting, offline, syncing, and error states
- Clear connection-dependent boundaries for AI planning, journal actions, and uncached dates

## Missing or incomplete areas

- Product contract and build-status documentation was missing until this
  milestone.
- Pinned activities are marked for future reuse, but a reusable-template
  selection flow is intentionally deferred.
- The activity editor is a modal rather than the planned responsive detail
  drawer/sheet experience.
- Full unsaved-change handling, focus management, reduced-motion handling,
  and destructive-action undo need a dedicated quality pass.
- Optional reflection does not exist.
- Neutral pattern summaries do not exist.
- Optional state awareness does not exist.
- PWA installability and Android preparation have not been completed.

## Known blockers and decisions

- The current Clerk setup is Replit-managed and available; no external account
  authorization is currently blocking the authentication boundary.
- Development database ownership migration is present and the current
  development activity table is empty.
- Existing activities are private to the authenticated owner; no migration
  rule exists to assign ownership to legacy rows from another identity.
- Further AI expansion and controlled re-planning must remain deferred until
  each future milestone is intentionally scoped and reviewed.
- The product must continue to preserve manual edits and must not silently
  alter schedules.

## Next milestones

1. Build optional reflection; state awareness is intentionally deferred.
2. Build neutral pattern summaries.
3. Add simple drag-to-move scheduling with preview, conflict highlighting, and
   undo.
4. Build infrastructure safeguards, quality review, and Android/PWA preparation
   in that order.

No next milestone should be started automatically.