import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { activityChangesTable, db, activitiesTable, journalEntriesTable } from "@workspace/db";
import {
  ApplyReplanningProposalBody,
  ApplyReplanningProposalResponse,
  CreatePlanningProposalBody,
  CreatePlanningProposalResponse,
  CreatePlanningDiscussionReplyBody,
  CreatePlanningDiscussionReplyResponse,
  CreateReplanningProposalBody,
  CreateReplanningProposalResponse,
} from "@workspace/api-zod";
import type {
  ApplyReplanningProposalRequest,
  PlanningDiscussionRequest as ApiPlanningDiscussionRequest,
  PlanningProposal,
  ReplanningProposal,
  ReplanningRequest,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getGeminiConfig, isGeminiConfigured } from "../lib/ai";

const router: IRouter = Router();
const CATEGORY_VALUES = new Set(["work", "recovery", "managing", "social", "fun"]);
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PlanningRequest = {
  intention?: string;
  currentDate: string;
  currentTime: string;
  availableTime: Array<{ startTime: string; endTime: string }>;
  planningStyle?: "lighter" | "balanced" | "fuller" | null;
  fixedCommitments?: string | null;
  includeJournalEntryIds?: number[];
  considerJournalEntryIds?: number[];
  discussionMessages?: Array<{ role: "user" | "assistant"; content: string }>;
};

type PlanningDiscussionRequest = ApiPlanningDiscussionRequest;

type PlanningJournalEntry = {
  id: number;
  recordedDate: string;
  content: string;
  topic: string | null;
  tags: string[];
  recordedAt: Date;
};

type ReplanningActivity = {
  id: number;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  category: string | null;
  completed: boolean;
  locked: boolean;
  note: string | null;
  updatedAt: Date;
};

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(date);
}

function isValidTime(time: string): boolean {
  if (!TIME_PATTERN.test(time)) return false;
  const minutes = minutesFromTime(time);
  return minutes >= 0 && minutes < 24 * 60;
}

function isCategoryValue(value: string | null): boolean {
  return value === null || CATEGORY_VALUES.has(value);
}

function hasValidRange(startTime: string, endTime: string): boolean {
  return isValidTime(startTime) && isValidTime(endTime) && minutesFromTime(endTime) > minutesFromTime(startTime);
}

function hasOverlap(
  first: { startTime: string; endTime: string },
  second: { startTime: string; endTime: string },
): boolean {
  return minutesFromTime(first.startTime) < minutesFromTime(second.endTime)
    && minutesFromTime(second.startTime) < minutesFromTime(first.endTime);
}

function effectiveEndTime(activity: { endTime: string | null }) {
  return activity.endTime ?? "23:59";
}

function hasActivityOverlap(
  first: { startTime: string; endTime: string | null },
  second: { startTime: string; endTime: string | null },
) {
  return hasOverlap(
    { startTime: first.startTime, endTime: effectiveEndTime(first) },
    { startTime: second.startTime, endTime: effectiveEndTime(second) },
  );
}

function validateReplanningRequest(request: ReplanningRequest): string | null {
  if (!isValidDate(request.currentDate) || !isValidTime(request.currentTime)) {
    return "The planning date or current time is invalid.";
  }

  if (request.availableTime.some((window) => !hasValidRange(window.startTime, window.endTime))) {
    return "Available time windows must have valid start and end times.";
  }

  for (let index = 0; index < request.availableTime.length; index += 1) {
    for (let next = index + 1; next < request.availableTime.length; next += 1) {
      if (hasOverlap(request.availableTime[index], request.availableTime[next])) {
        return "Available time windows must not overlap.";
      }
    }
  }

  return null;
}

function buildReplanningPrompt(request: ReplanningRequest, activities: ReplanningActivity[]) {
  return `You are Day Tripper's controlled remaining-day planning engine.

Return JSON only. The response must exactly match this shape:
{
  "snapshotActivities": [
    {
      "id": 1,
      "title": "string",
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM|null",
      "category": "work|recovery|managing|social|fun|null",
      "completed": false,
      "locked": false,
      "updatedAt": "ISO timestamp"
    }
  ],
  "changes": [
    {
      "id": "change-1",
      "activityId": 1,
      "action": "keep|move|shorten|remove|add",
      "title": "string",
      "currentDate": "YYYY-MM-DD|null",
      "currentStartTime": "HH:MM|null",
      "currentEndTime": "HH:MM|null",
      "proposedDate": "YYYY-MM-DD",
      "proposedStartTime": "HH:MM|null",
      "proposedEndTime": "HH:MM|null",
      "category": "work|recovery|managing|social|fun|null",
      "note": "string|null",
      "reason": "string"
    }
  ],
  "assumptions": ["string"],
  "conflicts": [
    { "description": "string", "relatedActivityTitles": ["string"] }
  ],
  "openTime": [
    {
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reason": "string"
    }
  ]
}

Rules:
- This is a suggestion only. Never claim to have changed the saved schedule.
- Return every existing activity in snapshotActivities exactly as provided.
- Return one change for every existing activity, including action "keep" when it stays as-is.
- Use activityId for existing activities. Use activityId null only for a new recovery or buffer block with action "add".
- Locked activities and completed activities must always be action "keep" with their exact current times and title.
- Do not rename existing activities. Preserve their title and category unless the action is "add".
- An ongoing activity (endTime null) must stay as-is.
- Use "move" when the same activity has a new time, "shorten" when its duration is reduced, "remove" when it no longer fits, and "keep" when it remains unchanged.
- A move or shorten needs proposedStartTime and proposedEndTime. A remove has both proposed times null. A keep repeats its current times. An add needs proposed times.
- Proposed blocks must stay on ${request.currentDate}, must be valid, and must not overlap each other or any saved activity that is kept.
- Empty time and recovery are valid. Do not fill every available minute.
- Do not invent deadlines, commitments, completed work, medical advice, or judgments.
- Include every array even when empty.

Context:
${JSON.stringify({
  currentDate: request.currentDate,
  currentTime: request.currentTime,
  intention: request.intention?.trim() || null,
  availableTime: request.availableTime,
  fixedCommitments: request.fixedCommitments ?? null,
  planningStyle: request.planningStyle ?? "balanced",
  existingActivities: activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    scheduledDate: activity.scheduledDate,
    startTime: activity.startTime,
    endTime: activity.endTime,
    category: activity.category,
    completed: activity.completed,
    locked: activity.locked,
    updatedAt: activity.updatedAt.toISOString(),
  })),
}, null, 2)}`;
}

function validateReplanningProposal(
  proposal: ReplanningProposal,
  currentDate: string,
  existingActivities: ReplanningActivity[],
): string | null {
  const existingById = new Map(existingActivities.map((activity) => [activity.id, activity]));
  const seenIds = new Set<number>();
  const proposedBlocks: Array<{ startTime: string; endTime: string }> = [];

  for (const snapshot of proposal.snapshotActivities) {
    const current = existingById.get(snapshot.id);
    if (
      !current
      || current.title !== snapshot.title
      || current.scheduledDate !== snapshot.scheduledDate
      || current.startTime !== snapshot.startTime
      || current.endTime !== snapshot.endTime
      || current.completed !== snapshot.completed
      || current.locked !== snapshot.locked
      || current.updatedAt.toISOString() !== snapshot.updatedAt
    ) {
      return "The schedule changed while the proposal was being prepared.";
    }
    seenIds.add(snapshot.id);
  }

  if (seenIds.size !== existingActivities.length) {
    return "The proposal did not include the complete schedule snapshot.";
  }

  for (const change of proposal.changes) {
    if (change.activityId === null) {
      if (change.action !== "add" || !change.proposedStartTime || !change.proposedEndTime) {
        return "The provider returned an invalid new time block.";
      }
    } else {
      const current = existingById.get(change.activityId);
      if (!current || !change.currentDate || change.currentDate !== current.scheduledDate) {
        return "The provider returned an unknown activity change.";
      }
      if (
        change.title !== current.title
        || change.currentStartTime !== current.startTime
        || change.currentEndTime !== current.endTime
      ) {
        return "The provider changed an activity outside the reviewed snapshot.";
      }
      if ((current.locked || current.completed || current.endTime === null) && change.action !== "keep") {
        return "The provider attempted to change a protected activity.";
      }
      if (change.action === "keep" && (
        change.proposedDate !== current.scheduledDate
        || change.proposedStartTime !== current.startTime
        || change.proposedEndTime !== current.endTime
      )) {
        return "The provider returned an invalid keep action.";
      }
      if (change.action !== "remove" && (!change.proposedStartTime || !change.proposedEndTime)) {
        return "The provider returned an incomplete activity change.";
      }
    }

    if (change.proposedDate !== currentDate) {
      return "The provider returned a change for another date.";
    }

    if (change.proposedStartTime && change.proposedEndTime) {
      if (!hasValidRange(change.proposedStartTime, change.proposedEndTime)) {
        return "The provider returned an invalid proposed time.";
      }
      proposedBlocks.push({ startTime: change.proposedStartTime, endTime: change.proposedEndTime });
    }
  }

  for (let index = 0; index < proposedBlocks.length; index += 1) {
    for (let next = index + 1; next < proposedBlocks.length; next += 1) {
      if (hasOverlap(proposedBlocks[index], proposedBlocks[next])) {
        return "The provider returned overlapping proposed changes.";
      }
    }
  }

  return null;
}

function validatePlanningRequest(request: PlanningRequest): string | null {
  if (!isValidDate(request.currentDate) || !isValidTime(request.currentTime)) {
    return "The planning date or current time is invalid.";
  }

  const includeIds = request.includeJournalEntryIds ?? [];
  const considerIds = request.considerJournalEntryIds ?? [];
  if (new Set(includeIds).size !== includeIds.length || new Set(considerIds).size !== considerIds.length) {
    return "Choose each journal note only once.";
  }
  if (includeIds.some((id) => considerIds.includes(id))) {
    return "A journal note cannot be both included and considered.";
  }
  if (!request.intention?.trim() && includeIds.length === 0 && considerIds.length === 0) {
    return "Add a short intention or choose at least one journal note to shape the plan.";
  }

  if (request.availableTime.some((window) => !hasValidRange(window.startTime, window.endTime))) {
    return "Available time windows must have valid start and end times.";
  }

  for (let index = 0; index < request.availableTime.length; index += 1) {
    for (let next = index + 1; next < request.availableTime.length; next += 1) {
      if (hasOverlap(request.availableTime[index], request.availableTime[next])) {
        return "Available time windows must not overlap.";
      }
    }
  }

  return null;
}

function validateDiscussionRequest(request: PlanningDiscussionRequest): string | null {
  if (!isValidDate(request.currentDate) || !isValidTime(request.currentTime)) {
    return "The planning date or current time is invalid.";
  }

  if (request.availableTime.some((window) => !hasValidRange(window.startTime, window.endTime))) {
    return "Available time windows must have valid start and end times.";
  }

  for (let index = 0; index < request.availableTime.length; index += 1) {
    for (let next = index + 1; next < request.availableTime.length; next += 1) {
      if (hasOverlap(request.availableTime[index], request.availableTime[next])) {
        return "Available time windows must not overlap.";
      }
    }
  }

  const includeIds = request.includeJournalEntryIds ?? [];
  const considerIds = request.considerJournalEntryIds ?? [];
  if (new Set(includeIds).size !== includeIds.length || new Set(considerIds).size !== considerIds.length) {
    return "Choose each journal note only once.";
  }
  if (includeIds.some((id) => considerIds.includes(id))) {
    return "A journal note cannot be both included and considered.";
  }
  if (!request.intention?.trim() && includeIds.length === 0 && considerIds.length === 0 && request.messages.length === 0) {
    return "Add an intention or choose at least one journal note before starting the conversation.";
  }

  return null;
}

async function loadSelectedJournalNotes(
  ownerId: string,
  includeJournalEntryIds: number[] | undefined,
  considerJournalEntryIds: number[] | undefined,
) {
  const includeIds = includeJournalEntryIds ?? [];
  const considerIds = considerJournalEntryIds ?? [];
  const journalEntryIds = [...new Set([...includeIds, ...considerIds])];
  const journalEntries = journalEntryIds.length
    ? await db
      .select({
        id: journalEntriesTable.id,
        recordedDate: journalEntriesTable.recordedDate,
        content: journalEntriesTable.content,
        topic: journalEntriesTable.topic,
        tags: journalEntriesTable.tags,
        recordedAt: journalEntriesTable.recordedAt,
      })
      .from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.ownerId, ownerId),
        eq(journalEntriesTable.privacy, "planning"),
        inArray(journalEntriesTable.id, journalEntryIds),
      ))
    : [];
  const journalEntriesById = new Map(journalEntries.map((entry) => [entry.id, entry]));

  return {
    missing: journalEntryIds.some((id) => !journalEntriesById.has(id)),
    include: includeIds.map((id) => journalEntriesById.get(id) as PlanningJournalEntry),
    consider: considerIds.map((id) => journalEntriesById.get(id) as PlanningJournalEntry),
  };
}

function buildPlanningDiscussionPrompt(
  request: PlanningDiscussionRequest,
  journalNotes: { include: PlanningJournalEntry[]; consider: PlanningJournalEntry[] },
) {
  return `You are Day Tripper's private planning conversation guide.

Return JSON only in this exact shape:
{
  "message": "string",
  "suggestedNextStep": "reply|proposal"
}

This is a short clarification conversation before a schedule proposal. Do not create a schedule, propose time blocks, claim to have changed anything, or turn journal notes into activities.

Conversation rules:
- Use only the journal notes in the provided include and consider lists. Notes marked leave out are not provided and must not be inferred.
- Included notes are required context; consider notes are optional context.
- Use tags as gentle attention cues, not commands.
- Ask at most one clear, compassionate question when the user's intention or boundaries are unclear.
- If the context is sufficient, briefly reflect what seems important and set suggestedNextStep to "proposal".
- If the user has answered the important question, do not keep the conversation going just to be conversational.
- Keep the response under 100 words, plain text, and non-judgmental.

Context:
${JSON.stringify({
  currentDate: request.currentDate,
  currentTime: request.currentTime,
  availableTime: request.availableTime,
  intention: request.intention ?? null,
  planningStyle: request.planningStyle ?? "balanced",
  fixedCommitments: request.fixedCommitments ?? null,
  journalNotes: {
    include: journalNotes.include.map((entry) => ({
      id: entry.id,
      recordedDate: entry.recordedDate,
      content: entry.content,
      topic: entry.topic,
      tags: entry.tags,
    })),
    consider: journalNotes.consider.map((entry) => ({
      id: entry.id,
      recordedDate: entry.recordedDate,
      content: entry.content,
      topic: entry.topic,
      tags: entry.tags,
    })),
  },
  messages: request.messages,
}, null, 2)}`;
}

function buildPlanningPrompt(request: PlanningRequest, activities: Array<{
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  category: string | null;
  completed: boolean;
  locked: boolean;
  note: string | null;
}>, journalNotes: { include: PlanningJournalEntry[]; consider: PlanningJournalEntry[] }) {
  return `You are Day Tripper's bounded planning engine.

Return JSON only. The response must exactly match the requested proposal shape:
{
  "proposedActivities": [
    {
      "title": "string",
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "category": "work|recovery|managing|social|fun|null",
      "note": "string|null"
    }
  ],
  "buffers": [
    {
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reason": "string"
    }
  ],
  "restPeriods": [
    {
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reason": "string"
    }
  ],
  "assumptions": ["string"],
  "conflicts": [
    {
      "description": "string",
      "relatedActivityTitles": ["string"]
    }
  ],
  "didNotFit": [
    {
      "title": "string",
      "reason": "string"
    }
  ]
}

Planning rules:
- This is a suggestion only. Never claim to have changed the saved schedule.
- Locked activities are protected. Do not move, delete, complete, or rename them.
- Do not invent deadlines, commitments, or completed work.
- Journal notes marked "include" are required context for this version of the plan, but they are not automatically activities. If an included note cannot fit, explain the conflict in didNotFit rather than silently dropping it.
- Journal notes marked "consider" are optional context and may be left out when they do not fit.
- Journal notes marked "leave out" are not provided and must not be inferred.
- Use tags as attention cues, not as commands. Schedule means eligible for planning; Urgent and Important influence attention; Someday should remain optional.
- Empty time is valid. Do not fill every available minute.
- Proposed activities must be fixed-time blocks with valid 24-hour times and must not overlap each other.
- Treat proposed activities, buffers, and rest periods as one shared timeline. No two blocks in any of those arrays may overlap.
- Do not place any proposed block over an existing saved activity. Existing activities remain in place and are not automatically edited.
- Use only the five categories listed above or null.
- Put anything that does not fit in didNotFit instead of forcing it into the schedule.
- Include every array, even when it is empty.
- Use the requested date for every proposed activity, buffer, and rest period.

Context:
${JSON.stringify({
  intention: request.intention,
  currentDate: request.currentDate,
  currentTime: request.currentTime,
  availableTime: request.availableTime,
  planningStyle: request.planningStyle ?? "balanced",
  fixedCommitments: request.fixedCommitments ?? null,
  existingActivities: activities,
  journalNotes: {
    include: journalNotes.include.map((entry) => ({
      id: entry.id,
      recordedDate: entry.recordedDate,
      content: entry.content,
      topic: entry.topic,
      tags: entry.tags,
      recordedAt: entry.recordedAt.toISOString(),
    })),
    consider: journalNotes.consider.map((entry) => ({
      id: entry.id,
      recordedDate: entry.recordedDate,
      content: entry.content,
      topic: entry.topic,
      tags: entry.tags,
      recordedAt: entry.recordedAt.toISOString(),
    })),
  },
  discussionMessages: request.discussionMessages ?? [],
}, null, 2)}`;
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const content = (candidates[0] as { content?: { parts?: unknown } })?.content;
  if (!content || !Array.isArray(content.parts)) return null;
  const text = content.parts
    .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
      ? (part as { text: string }).text
      : ""))
    .join("")
    .trim();
  return text || null;
}

function parseJsonText(text: string): unknown {
  const candidates = [text.trim()];
  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  candidates.unshift(...fencedBlocks);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Gemini can occasionally add a short explanation before or after JSON.
      // Keep looking for the first complete JSON value, then validate it below.
    }

    const starts = [candidate.indexOf("{"), candidate.indexOf("[")]
      .filter((index) => index >= 0)
      .sort((first, second) => first - second);

    for (const start of starts) {
      const stack: string[] = [];
      let inString = false;
      let escaped = false;

      for (let index = start; index < candidate.length; index += 1) {
        const character = candidate[index];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === "\"") {
            inString = false;
          }
          continue;
        }

        if (character === "\"") {
          inString = true;
          continue;
        }

        if (character === "{" || character === "[") {
          stack.push(character);
          continue;
        }

        if (character === "}" || character === "]") {
          const opening = stack.at(-1);
          const matches = (opening === "{" && character === "}")
            || (opening === "[" && character === "]");

          if (!matches) break;
          stack.pop();

          if (stack.length === 0) {
            try {
              return JSON.parse(candidate.slice(start, index + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
  }

  throw new SyntaxError("Planning provider response did not contain valid JSON");
}

function validateProposalSemantics(
  proposal: PlanningProposal,
  currentDate: string,
  existingActivities: Array<{
    startTime: string;
    endTime: string | null;
  }>,
): string | null {
  const blocks = [
    ...proposal.proposedActivities,
    ...proposal.buffers,
    ...proposal.restPeriods,
  ];

  if (blocks.some((block) => block.scheduledDate !== currentDate || !hasValidRange(block.startTime, block.endTime))) {
    return "The planning provider returned an invalid time block.";
  }

  if (proposal.proposedActivities.some((activity) => (
    activity.category !== null && !CATEGORY_VALUES.has(activity.category)
  ))) {
    return "The planning provider returned an invalid category.";
  }

  for (let index = 0; index < blocks.length; index += 1) {
    for (let next = index + 1; next < blocks.length; next += 1) {
      if (hasOverlap(blocks[index], blocks[next])) {
        return "The planning provider returned overlapping time blocks.";
      }
    }
  }

  const fixedExistingActivities = existingActivities.filter(
    (activity): activity is { startTime: string; endTime: string } => Boolean(activity.endTime),
  );

  if (blocks.some((block) => fixedExistingActivities.some((activity) => hasOverlap(block, activity)))) {
    return "The planning provider returned a block that overlaps a saved activity.";
  }

  return null;
}

router.use(requireAuth);

router.post("/planning/discussion", async (req, res): Promise<void> => {
  const parsed = CreatePlanningDiscussionReplyBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid planning discussion request");
    res.status(400).json({ error: "Please check the conversation details." });
    return;
  }

  const request = parsed.data as PlanningDiscussionRequest;
  const requestError = validateDiscussionRequest(request);
  if (requestError) {
    res.status(400).json({ error: requestError });
    return;
  }

  const selectedNotes = await loadSelectedJournalNotes(
    res.locals.userId as string,
    request.includeJournalEntryIds,
    request.considerJournalEntryIds,
  );

  if (selectedNotes.missing) {
    res.status(400).json({ error: "One of the selected journal notes is no longer available for planning." });
    return;
  }

  if (!isGeminiConfigured()) {
    req.log.warn("Planning discussion requested while Gemini is not configured");
    res.status(503).json({ error: "The planning conversation is not available right now." });
    return;
  }

  const config = getGeminiConfig();
  let correction: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = buildPlanningDiscussionPrompt(request, selectedNotes)
      + (correction
        ? `\n\nCorrection required: the previous response was rejected because ${correction}. Return only the requested JSON shape.`
        : "");

    try {
      const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 1200,
            temperature: 0.35,
          },
        }),
      });

      if (!response.ok) {
        req.log.error({ status: response.status }, "Planning discussion provider request failed");
        res.status(503).json({ error: "The planning conversation is not available right now." });
        return;
      }

      const payload: unknown = await response.json();
      const text = extractGeminiText(payload);
      if (!text) {
        correction = "the provider returned no conversation text";
        continue;
      }

      let candidate: unknown;
      try {
        candidate = parseJsonText(text);
      } catch {
        correction = "the provider response was not valid JSON";
        continue;
      }

      const reply = CreatePlanningDiscussionReplyResponse.safeParse(candidate);
      if (!reply.success) {
        correction = "the response did not match the required shape";
        continue;
      }

      res.json(reply.data);
      return;
    } catch (error) {
      req.log.error({ err: error }, "Planning discussion request failed");
      res.status(503).json({ error: "The planning conversation is not available right now." });
      return;
    }
  }

  req.log.warn({ correction }, "Planning discussion provider returned an invalid response");
  res.status(502).json({ error: "The planning conversation returned an invalid response." });
});

router.post("/planning/replan-proposals", async (req, res): Promise<void> => {
  const parsed = CreateReplanningProposalBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid re-planning request");
    res.status(400).json({ error: "Please check the re-planning details." });
    return;
  }

  const request = parsed.data as ReplanningRequest;
  const requestError = validateReplanningRequest(request);
  if (requestError) {
    res.status(400).json({ error: requestError });
    return;
  }

  const activities = await db
    .select({
      id: activitiesTable.id,
      title: activitiesTable.title,
      scheduledDate: activitiesTable.scheduledDate,
      startTime: activitiesTable.startTime,
      endTime: activitiesTable.endTime,
      category: activitiesTable.category,
      completed: activitiesTable.completed,
      locked: activitiesTable.locked,
      note: activitiesTable.note,
      updatedAt: activitiesTable.updatedAt,
    })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.ownerId, res.locals.userId as string),
      eq(activitiesTable.scheduledDate, request.currentDate),
    ))
    .orderBy(asc(activitiesTable.startTime), asc(activitiesTable.id));

  if (!isGeminiConfigured()) {
    req.log.warn("Re-planning requested while Gemini is not configured");
    res.status(503).json({ error: "Planning is not available right now." });
    return;
  }

  try {
    const config = getGeminiConfig();
    let correction: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = buildReplanningPrompt(request, activities)
        + (correction
          ? `\n\nCorrection required: the previous draft was rejected because ${correction} Return a complete proposal with every existing activity in the snapshot and changes arrays. Return JSON only.`
          : "");
      const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        req.log.error({ status: response.status }, "Re-planning provider request failed");
        res.status(503).json({ error: "Planning is not available right now." });
        return;
      }

      const payload: unknown = await response.json();
      const text = extractGeminiText(payload);
      if (!text) {
        correction = "the provider returned no proposal text";
        if (attempt === 0) continue;
        req.log.warn("Re-planning provider returned no text");
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      let candidate: unknown;
      try {
        candidate = parseJsonText(text);
      } catch {
        correction = "the provider response was not valid JSON";
        if (attempt === 0) continue;
        req.log.warn("Re-planning provider returned malformed JSON");
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      const proposal = CreateReplanningProposalResponse.safeParse(candidate);
      if (!proposal.success) {
        correction = "the proposal did not match the required shape";
        if (attempt === 0) continue;
        req.log.warn({ errors: proposal.error.flatten() }, "Re-planning provider returned an invalid proposal");
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      const semanticError = validateReplanningProposal(proposal.data, request.currentDate, activities);
      if (semanticError) {
        correction = semanticError;
        if (attempt === 0) continue;
        req.log.warn({ reason: semanticError }, "Re-planning provider returned an unsafe proposal");
        res.status(502).json({
          error: "The planner could not make a safe remaining-day proposal after trying twice. Your schedule was not changed; try again.",
        });
        return;
      }

      res.json(proposal.data);
      return;
    }
  } catch (error) {
    req.log.error({ err: error }, "Re-planning provider integration failed");
    res.status(503).json({ error: "Planning is not available right now." });
  }
});

router.post("/planning/replan-proposals/apply", async (req, res): Promise<void> => {
  const parsed = ApplyReplanningProposalBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid applied re-planning proposal");
    res.status(400).json({ error: "Please check the changes you selected." });
    return;
  }

  const request = parsed.data as ApplyReplanningProposalRequest;
  if (!isValidDate(request.currentDate)) {
    res.status(400).json({ error: "A valid planning date is required." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const currentActivities = await tx
        .select()
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.ownerId, res.locals.userId as string),
          eq(activitiesTable.scheduledDate, request.currentDate),
        ))
        .orderBy(asc(activitiesTable.startTime), asc(activitiesTable.id));

      const currentById = new Map(currentActivities.map((activity) => [activity.id, activity]));
      const snapshotById = new Map(request.snapshot.map((activity) => [activity.id, activity]));
      const currentIds = [...currentById.keys()].sort((a, b) => a - b);
      const snapshotIds = [...snapshotById.keys()].sort((a, b) => a - b);

      if (
        currentIds.length !== snapshotIds.length
        || currentIds.some((id, index) => id !== snapshotIds[index])
        || currentActivities.some((activity) => activity.updatedAt.toISOString() !== snapshotById.get(activity.id)?.updatedAt)
      ) {
        const staleError = new Error("The schedule changed since this proposal was created.");
        staleError.name = "STALE_REPLANNING_SNAPSHOT";
        throw staleError;
      }

      const changesByActivityId = new Map<number, (typeof request.changes)[number]>();
      const additions = request.changes.filter((change) => change.activityId === null);

      for (const change of request.changes) {
        if (change.action === "keep") continue;

        if (change.activityId === null) {
          if (change.action !== "add" || !change.proposedStartTime || !change.proposedEndTime) {
            const invalidError = new Error("A new suggestion needs a valid time range.");
            invalidError.name = "INVALID_REPLANNING_CHANGE";
            throw invalidError;
          }
          if (!isCategoryValue(change.category) || !hasValidRange(change.proposedStartTime, change.proposedEndTime)) {
            const invalidError = new Error("A new suggestion contains invalid details.");
            invalidError.name = "INVALID_REPLANNING_CHANGE";
            throw invalidError;
          }
          continue;
        }

        if (changesByActivityId.has(change.activityId)) {
          const invalidError = new Error("An activity was selected more than once.");
          invalidError.name = "INVALID_REPLANNING_CHANGE";
          throw invalidError;
        }
        const current = currentById.get(change.activityId);
        if (!current) {
          const missingError = new Error("One of the selected activities no longer exists.");
          missingError.name = "MISSING_REPLANNING_ACTIVITY";
          throw missingError;
        }
        if (current.locked || current.completed || !current.endTime) {
          const invalidError = new Error("Locked, completed, and ongoing activities must stay unchanged.");
          invalidError.name = "INVALID_REPLANNING_CHANGE";
          throw invalidError;
        }
        if (change.action === "remove") {
          changesByActivityId.set(change.activityId, change);
          continue;
        }
        if (
          (change.action !== "move" && change.action !== "shorten")
          || !change.proposedStartTime
          || !change.proposedEndTime
          || !hasValidRange(change.proposedStartTime, change.proposedEndTime)
          || !isCategoryValue(change.category)
        ) {
          const invalidError = new Error("An activity change contains an invalid time range.");
          invalidError.name = "INVALID_REPLANNING_CHANGE";
          throw invalidError;
        }
        changesByActivityId.set(change.activityId, change);
      }

      const finalBlocks: Array<{ startTime: string; endTime: string | null; title: string; changed: boolean }> = currentActivities
        .filter((activity) => !changesByActivityId.get(activity.id) || changesByActivityId.get(activity.id)?.action !== "remove")
        .map((activity) => {
          const change = changesByActivityId.get(activity.id);
          return {
            startTime: change?.proposedStartTime ?? activity.startTime,
            endTime: change?.proposedEndTime ?? activity.endTime,
            title: activity.title,
            changed: Boolean(change),
          };
        });

      for (const addition of additions) {
        finalBlocks.push({
          startTime: addition.proposedStartTime as string,
          endTime: addition.proposedEndTime,
          title: addition.title,
          changed: true,
        });
      }

      for (let index = 0; index < finalBlocks.length; index += 1) {
        for (let next = index + 1; next < finalBlocks.length; next += 1) {
          if (
            (finalBlocks[index].changed || finalBlocks[next].changed)
            && hasActivityOverlap(finalBlocks[index], finalBlocks[next])
          ) {
            const conflictError = new Error("The selected changes would overlap another activity.");
            conflictError.name = "CONFLICTING_REPLANNING_CHANGE";
            throw conflictError;
          }
        }
      }

      const updatedActivities: typeof currentActivities = [];
      const addedActivities: typeof currentActivities = [];
      const removedActivityIds: number[] = [];

      for (const change of changesByActivityId.values()) {
        const current = currentById.get(change.activityId as number);
        if (!current) continue;

        if (change.action === "remove") {
          const [deleted] = await tx
            .delete(activitiesTable)
            .where(and(eq(activitiesTable.id, current.id), eq(activitiesTable.ownerId, res.locals.userId as string)))
            .returning({ id: activitiesTable.id });
          if (deleted) {
            removedActivityIds.push(deleted.id);
            await tx.insert(activityChangesTable).values({
              ownerId: res.locals.userId as string,
              activityId: current.id,
              scheduledDate: current.scheduledDate,
              activityTitle: current.title,
              changeType: "removed",
              previousTitle: current.title,
              nextTitle: null,
              previousStartTime: current.startTime,
              nextStartTime: null,
              previousEndTime: current.endTime,
              nextEndTime: null,
              note: change.note ?? null,
              source: "ai_approved",
            });
          }
          continue;
        }

        const [updated] = await tx
          .update(activitiesTable)
          .set({
            scheduledDate: change.proposedDate,
            startTime: change.proposedStartTime as string,
            endTime: change.proposedEndTime as string,
          })
          .where(and(eq(activitiesTable.id, current.id), eq(activitiesTable.ownerId, res.locals.userId as string)))
          .returning();

        if (!updated) continue;
        updatedActivities.push(updated);
        await tx.insert(activityChangesTable).values({
          ownerId: res.locals.userId as string,
          activityId: updated.id,
          scheduledDate: updated.scheduledDate,
          activityTitle: updated.title,
          changeType: change.action === "shorten" ? "shortened" : "moved",
          previousTitle: current.title,
          nextTitle: updated.title,
          previousStartTime: current.startTime,
          nextStartTime: updated.startTime,
          previousEndTime: current.endTime,
          nextEndTime: updated.endTime,
          note: change.note ?? null,
          source: "ai_approved",
        });
      }

      for (const change of additions) {
        const [added] = await tx
          .insert(activitiesTable)
          .values({
            ownerId: res.locals.userId as string,
            title: change.title,
            scheduledDate: change.proposedDate,
            startTime: change.proposedStartTime as string,
            endTime: change.proposedEndTime,
            category: change.category,
            completed: false,
            locked: false,
            pinned: false,
            note: change.note,
          })
          .returning();
        if (added) addedActivities.push(added);
      }

      return { updatedActivities, addedActivities, removedActivityIds };
    });

    res.json(ApplyReplanningProposalResponse.parse(result));
  } catch (error) {
    if (error instanceof Error && error.name === "STALE_REPLANNING_SNAPSHOT") {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "MISSING_REPLANNING_ACTIVITY") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (
      error instanceof Error
      && ["INVALID_REPLANNING_CHANGE", "CONFLICTING_REPLANNING_CHANGE"].includes(error.name)
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Applying re-planning proposal failed");
    res.status(500).json({ error: "The approved changes could not be saved." });
  }
});

router.post("/planning/proposals", async (req, res): Promise<void> => {
  const parsed = CreatePlanningProposalBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid planning request");
    res.status(400).json({ error: "Please check the planning details." });
    return;
  }

  const request = parsed.data as PlanningRequest;
  const requestError = validatePlanningRequest(request);
  if (requestError) {
    res.status(400).json({ error: requestError });
    return;
  }

  if (!isGeminiConfigured()) {
    req.log.warn("Planning requested while Gemini is not configured");
    res.status(503).json({ error: "Planning is not available right now." });
    return;
  }

  const activities = await db
    .select({
      title: activitiesTable.title,
      scheduledDate: activitiesTable.scheduledDate,
      startTime: activitiesTable.startTime,
      endTime: activitiesTable.endTime,
      category: activitiesTable.category,
      completed: activitiesTable.completed,
      locked: activitiesTable.locked,
      note: activitiesTable.note,
    })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.ownerId, res.locals.userId as string),
      eq(activitiesTable.scheduledDate, request.currentDate),
    ))
    .orderBy(asc(activitiesTable.startTime), asc(activitiesTable.title));

  const promptActivities = activities.map((activity) => ({
    ...activity,
    note: null,
  }));

  const includeJournalEntryIds = request.includeJournalEntryIds ?? [];
  const considerJournalEntryIds = request.considerJournalEntryIds ?? [];
  const journalEntryIds = [...new Set([...includeJournalEntryIds, ...considerJournalEntryIds])];
  const journalEntries = journalEntryIds.length
    ? await db
      .select({
        id: journalEntriesTable.id,
        recordedDate: journalEntriesTable.recordedDate,
        content: journalEntriesTable.content,
        topic: journalEntriesTable.topic,
        tags: journalEntriesTable.tags,
        recordedAt: journalEntriesTable.recordedAt,
      })
      .from(journalEntriesTable)
      .where(and(
        eq(journalEntriesTable.ownerId, res.locals.userId as string),
        eq(journalEntriesTable.privacy, "planning"),
        inArray(journalEntriesTable.id, journalEntryIds),
      ))
    : [];
  const journalEntriesById = new Map(journalEntries.map((entry) => [entry.id, entry]));

  if (journalEntryIds.some((id) => !journalEntriesById.has(id))) {
    res.status(400).json({ error: "One of the selected journal notes is no longer available for planning." });
    return;
  }

  const journalNotes = {
    include: includeJournalEntryIds.map((id) => journalEntriesById.get(id) as PlanningJournalEntry),
    consider: considerJournalEntryIds.map((id) => journalEntriesById.get(id) as PlanningJournalEntry),
  };

  try {
    const config = getGeminiConfig();
    let correction: string | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = buildPlanningPrompt(request, promptActivities, journalNotes)
        + (correction
          ? `\n\nCorrection required: the previous draft was rejected because ${correction} Return a new complete proposal. Treat every proposed activity, buffer, and rest period as one shared non-overlapping timeline, and return JSON only.`
          : "");
      const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        req.log.error({ status: response.status }, "Planning provider request failed");
        res.status(503).json({ error: "Planning is not available right now." });
        return;
      }

      const payload: unknown = await response.json();
      const text = extractGeminiText(payload);
      if (!text) {
        correction = "the provider returned no proposal text";
        if (attempt === 0) continue;
        req.log.warn("Planning provider returned no text");
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      let candidate: unknown;
      try {
        candidate = parseJsonText(text);
      } catch {
        correction = "the provider response was not valid JSON";
        if (attempt === 0) continue;
        req.log.warn(
          {
            textLength: text.length,
            wrappedInCodeFence: /^```/i.test(text),
          },
          "Planning provider returned malformed JSON",
        );
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      const proposal = CreatePlanningProposalResponse.safeParse(candidate);
      if (!proposal.success) {
        correction = "the proposal did not match the required shape";
        if (attempt === 0) continue;
        req.log.warn({ errors: proposal.error.flatten() }, "Planning provider returned an invalid proposal");
        res.status(502).json({ error: "The planning service returned an invalid proposal." });
        return;
      }

      const semanticError = validateProposalSemantics(
        proposal.data,
        request.currentDate,
        activities,
      );
      if (semanticError) {
        correction = semanticError;
        if (attempt === 0) continue;
        req.log.warn({ reason: semanticError }, "Planning provider returned an unsafe proposal");
        res.status(502).json({
          error: "The planner could not make a conflict-free proposal after trying twice. Your schedule was not changed; try again with the same request.",
        });
        return;
      }

      res.json(proposal.data);
      return;
    }
  } catch (error) {
    req.log.error({ err: error }, "Planning provider integration failed");
    res.status(503).json({ error: "Planning is not available right now." });
  }
});

export default router;