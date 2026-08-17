import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, activitiesTable } from "@workspace/db";
import {
  CreatePlanningProposalBody,
  CreatePlanningProposalResponse,
} from "@workspace/api-zod";
import type { PlanningProposal } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getGeminiConfig, isGeminiConfigured } from "../lib/ai";

const router: IRouter = Router();
const CATEGORY_VALUES = new Set(["work", "recovery", "managing", "social", "fun"]);
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PlanningRequest = {
  intention: string;
  currentDate: string;
  currentTime: string;
  availableTime: Array<{ startTime: string; endTime: string }>;
  planningStyle?: "lighter" | "balanced" | "fuller" | null;
  fixedCommitments?: string | null;
  useHistoricalContext?: boolean;
  historicalContext?: string | null;
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

function validatePlanningRequest(request: PlanningRequest): string | null {
  if (!isValidDate(request.currentDate) || !isValidTime(request.currentTime)) {
    return "The planning date or current time is invalid.";
  }

  if (request.useHistoricalContext && !request.historicalContext?.trim()) {
    return "Historical context must be provided when it is enabled.";
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

function buildPlanningPrompt(request: PlanningRequest, activities: Array<{
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  category: string | null;
  completed: boolean;
  locked: boolean;
  note: string | null;
}>) {
  const approvedHistoricalContext = request.useHistoricalContext
    ? request.historicalContext ?? null
    : null;

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
- Empty time is valid. Do not fill every available minute.
- Proposed activities must be fixed-time blocks with valid 24-hour times and must not overlap each other.
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
  approvedHistoricalContext,
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

  return null;
}

router.use(requireAuth);

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
    note: request.useHistoricalContext ? activity.note : null,
  }));

  try {
    const config = getGeminiConfig();
    const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPlanningPrompt(request, promptActivities) }] }],
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
      req.log.warn("Planning provider returned no text");
      res.status(502).json({ error: "The planning service returned an invalid proposal." });
      return;
    }

    let candidate: unknown;
    try {
      candidate = parseJsonText(text);
    } catch {
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
      req.log.warn({ errors: proposal.error.flatten() }, "Planning provider returned an invalid proposal");
      res.status(502).json({ error: "The planning service returned an invalid proposal." });
      return;
    }

    const semanticError = validateProposalSemantics(proposal.data, request.currentDate);
    if (semanticError) {
      req.log.warn({ reason: semanticError }, "Planning provider returned an unsafe proposal");
      res.status(502).json({ error: "The planning service returned an invalid proposal." });
      return;
    }

    res.json(proposal.data);
  } catch (error) {
    req.log.error({ err: error }, "Planning provider integration failed");
    res.status(503).json({ error: "Planning is not available right now." });
  }
});

export default router;