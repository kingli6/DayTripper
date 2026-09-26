import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  activitiesTable,
  db,
  executionObservationsTable,
  executionStateTable,
  tasksTable,
} from "@workspace/db";
import {
  ArchiveTaskParams,
  CompleteTaskBody,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  DecideExecutionTaskBody,
  DecideExecutionTaskResponse,
  ListTasksResponse,
  RecommendTasksBody,
  RecommendTasksResponse,
  ScheduleTaskBody,
  ScheduleTaskParams,
  ScheduleTaskResponse,
  TriageTasksBody,
  TriageTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getGeminiConfig, isGeminiConfigured } from "../lib/ai";
import { deriveExecutionPolicy, type ExecutionPolicyStateLevel } from "../lib/executionPolicy";
import {
  createDeterministicExecutionDecision,
  validateExecutionDecision,
  validateExecutionDecisionForTask,
} from "../lib/executionDecision";
import {
  nextOccurrenceAfter,
  INVALID_REPEAT_INTERVAL,
  normalizeRepeatInterval,
  sameRepeatInterval,
} from "../lib/taskRecurrence";
import { completeTaskInTransaction } from "../lib/taskCompletion";

const router: IRouter = Router();
router.use(requireAuth);

type RecommendationInputs = {
  availableMinutes: number;
  currentEnergy: number;
};

function toApiTask(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    notes: task.notes ?? null,
    deadline: task.deadline?.toISOString() ?? null,
    repeatIntervalMinutes: task.repeatIntervalMinutes ?? null,
    nextOccurrenceAt: task.nextOccurrenceAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function timeToMinutes(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${`${Math.floor(value / 60)}`.padStart(2, "0")}:${`${value % 60}`.padStart(2, "0")}`;
}

function deadlineDaysAway(deadline: Date | null) {
  if (!deadline) return null;
  return (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

function deadlineScore(deadline: Date | null) {
  const days = deadlineDaysAway(deadline);
  if (days === null) return 0;
  if (days < 0) return 22;
  if (days <= 1) return 18;
  if (days <= 3) return 13;
  if (days <= 7) return 8;
  return 3;
}

function timeFitScore(estimatedMinutes: number, availableMinutes: number) {
  const ratio = estimatedMinutes / Math.max(1, availableMinutes);
  if (ratio <= 1) return 16 - Math.min(4, (1 - ratio) * 4);
  if (ratio <= 1.5) return 5;
  return -12;
}

function recommendationScore(task: typeof tasksTable.$inferSelect, inputs: RecommendationInputs) {
  const priority = task.importance * 4 + task.urgency * 4;
  const energyFit = 12 - Math.abs(task.energyRequired - inputs.currentEnergy) * 3;
  return priority
    + deadlineScore(task.deadline)
    + timeFitScore(task.estimatedMinutes, inputs.availableMinutes)
    + energyFit;
}

function recommendationReason(task: typeof tasksTable.$inferSelect, inputs: RecommendationInputs) {
  const reasons: string[] = [];
  if (task.importance >= 3 && task.urgency >= 3) reasons.push("High priority and urgent");
  else if (task.importance >= 4) reasons.push("It carries important work");
  else if (task.urgency >= 4) reasons.push("It is time-sensitive");

  const days = deadlineDaysAway(task.deadline);
  if (days !== null && days < 0) reasons.push("Its deadline has passed");
  else if (days !== null && days <= 1) reasons.push("Its deadline is close");
  else if (days !== null && days <= 3) reasons.push("Its deadline is within three days");
  else if (days !== null && days <= 7) reasons.push("Its deadline is within a week");

  if (task.estimatedMinutes <= inputs.availableMinutes) {
    reasons.push(`Its ${task.estimatedMinutes}-minute estimate fits your available time`);
  } else {
    reasons.push(`It is the strongest fit despite needing ${task.estimatedMinutes} minutes`);
  }

  if (Math.abs(task.energyRequired - inputs.currentEnergy) <= 1) {
    reasons.push("Its energy need matches your current energy");
  } else if (task.energyRequired < inputs.currentEnergy) {
    reasons.push("Its energy need is manageable right now");
  }

  const selected = reasons.slice(0, 3);
  return `${selected.join(". ")}${selected.length ? "." : "A balanced fit across priority, time, energy, and deadline."}`;
}

function deterministicRecommendations(tasks: Array<typeof tasksTable.$inferSelect>, inputs: RecommendationInputs) {
  return tasks
    .map((task) => ({
      taskId: task.id,
      score: recommendationScore(task, inputs),
      reason: recommendationReason(task, inputs),
    }))
    .sort((first, second) => second.score - first.score || second.taskId - first.taskId)
    .slice(0, 3)
    .map((recommendation, index) => ({
      taskId: recommendation.taskId,
      rank: index + 1,
      reason: recommendation.reason,
    }));
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const content = (candidates[0] as { content?: { parts?: unknown } })?.content;
  if (!content || !Array.isArray(content.parts)) return null;
  const text = content.parts
    .map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
      ? (part as { text: string }).text
      : "")
    .join("")
    .trim();
  return text || null;
}

function parseGeminiJson(text: string): unknown {
  const candidates = [
    text.trim(),
    ...[...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
      .map((match) => match[1].trim())
      .filter(Boolean),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1));
        } catch {
          // Continue to the next candidate and fall back if none are valid.
        }
      }
    }
  }

  throw new SyntaxError("Gemini response did not contain valid JSON");
}

async function geminiRecommendations(
  tasks: Array<typeof tasksTable.$inferSelect>,
  inputs: RecommendationInputs,
  log: { warn: (object: unknown, message: string) => void },
) {
  if (!isGeminiConfigured()) return null;

  const config = getGeminiConfig();
  const prompt = `You recommend the next work item for a person. Return only JSON in this exact shape:
{"recommendations":[{"taskId":123,"rank":1,"reason":"Short human explanation."}]}

Select at most 3 task IDs from the supplied active task list. Do not invent task information or IDs. Do not simply choose the highest-priority task. Consider what is realistically achievable right now: a lower-priority task can be better if it fits available time or energy substantially better. Task-level interest describes how appealing a task may be. Deadlines and urgency matter. The user remains in control; recommend only and do not schedule anything.

Current situation:
${JSON.stringify(inputs, null, 2)}

Active task list:
${JSON.stringify(tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    importance: task.importance,
    urgency: task.urgency,
    deadline: task.deadline?.toISOString() ?? null,
    estimatedMinutes: task.estimatedMinutes,
    energyRequired: task.energyRequired,
    interest: task.interest,
  })), null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          temperature: 0.25,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn({ status: response.status }, "Task recommendation provider request failed");
      return null;
    }

    const text = extractGeminiText(await response.json());
    if (!text) return null;

    const candidate = parseGeminiJson(text);
    const recommendations = candidate && typeof candidate === "object"
      ? (candidate as { recommendations?: unknown }).recommendations
      : undefined;
    const parsed = RecommendTasksResponse.safeParse({
      recommendations,
      source: "gemini",
    });
    if (!parsed.success) {
      log.warn({ errors: parsed.error.flatten() }, "Task recommendation provider returned an invalid shape");
      return null;
    }

    const allowedTaskIds = new Set(tasks.map((task) => task.id));
    const seenTaskIds = new Set<number>();
    const validRecommendations = parsed.data.recommendations
      .filter((recommendation) => allowedTaskIds.has(recommendation.taskId) && !seenTaskIds.has(recommendation.taskId))
      .map((recommendation, index) => {
        seenTaskIds.add(recommendation.taskId);
        return {
          taskId: recommendation.taskId,
          rank: index + 1,
          reason: recommendation.reason,
        };
      });

    if (!validRecommendations.length) {
      log.warn({}, "Task recommendation provider returned no valid task IDs");
      return null;
    }

    return {
      recommendations: validRecommendations,
      source: "gemini" as const,
    };
  } catch (error) {
    log.warn({ err: error }, "Task recommendation provider request failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type TriageSourceItem = {
  id: string;
  text: string;
};

function parseTriageSource(input: string): TriageSourceItem[] | null {
  const items = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (items.length === 0 || items.length > 40 || items.some((text) => text.length > 200)) {
    return null;
  }

  return items.map((text, index) => ({
    id: `item-${index + 1}`,
    text,
  }));
}

async function geminiTriage(
  items: TriageSourceItem[],
  log: { warn: (object: unknown, message: string) => void },
) {
  if (!isGeminiConfigured()) return null;

  const config = getGeminiConfig();
  const prompt = `Classify a user's actionable list into an Eisenhower priority matrix. Return only JSON in this exact shape:
{"items":[{"id":"item-1","text":"Original item text","quadrant":"importantUrgent","reason":"Short explanation."}]}

Rules:
- Return exactly one result for every supplied item ID, with no extra IDs.
- Preserve the supplied item text exactly. Do not rewrite, combine, split, or invent items.
- Use importantUrgent, importantNotUrgent, notImportantUrgent, or notImportantNotUrgent only when the item's importance and urgency are sufficiently clear.
- Put vague thoughts, reflections, background information, non-actionable statements, and genuinely ambiguous items in unsorted.
- Never invent a task from a vague thought.
- Keep each reason short and explain the classification or why the item remains unsorted.

Items:
${JSON.stringify(items, null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn({ status: response.status }, "Task triage provider request failed");
      return null;
    }

    const text = extractGeminiText(await response.json());
    if (!text) return null;

    let candidate: unknown;
    try {
      candidate = parseGeminiJson(text);
    } catch {
      log.warn({}, "Task triage provider returned invalid JSON");
      return null;
    }

    const parsed = TriageTasksResponse.safeParse(candidate);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.flatten() }, "Task triage provider returned an invalid shape");
      return null;
    }

    const sourceById = new Map(items.map((item) => [item.id, item]));
    const returnedIds = new Set<string>();
    for (const item of parsed.data.items) {
      if (!sourceById.has(item.id) || returnedIds.has(item.id)) return null;
      returnedIds.add(item.id);
    }
    if (returnedIds.size !== items.length) return null;

    const result = {
      items: items.map((source) => {
        const classified = parsed.data.items.find((item) => item.id === source.id);
        if (!classified) throw new Error("Task triage response omitted an input item.");
        return {
          id: source.id,
          text: source.text,
          quadrant: classified.quadrant,
          reason: classified.reason,
        };
      }),
    };

    return TriageTasksResponse.parse(result);
  } catch (error) {
    log.warn({ err: error }, "Task triage provider request failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type ExecutionDecisionState = {
  energy: ExecutionPolicyStateLevel;
  stress: ExecutionPolicyStateLevel;
  availableMinutes: number;
};

function energyLevelFromScore(value: number): ExecutionPolicyStateLevel {
  if (value <= 2) return "low";
  if (value >= 4) return "high";
  return "normal";
}

function storedLevel(value: string | null | undefined): ExecutionPolicyStateLevel {
  return value === "low" || value === "high" ? value : "normal";
}

function decisionTask(task: typeof tasksTable.$inferSelect) {
  return {
    id: task.id,
    title: task.title,
    estimatedMinutes: task.estimatedMinutes,
    status: task.status,
    ownerId: task.ownerId,
  };
}

function policyForDecisionTask(
  task: typeof tasksTable.$inferSelect,
  state: ExecutionDecisionState,
  observations: Array<typeof executionObservationsTable.$inferSelect>,
) {
  return deriveExecutionPolicy({
    task: {
      title: task.title,
      importance: task.importance,
      urgency: task.urgency,
      energyRequired: task.energyRequired,
      interest: task.interest,
      estimatedMinutes: task.estimatedMinutes,
      deadline: task.deadline,
    },
    state,
    observations: observations.map((observation) => ({
      dimension: observation.dimension,
      finding: observation.finding,
      stateContext: observation.stateContext as
        | "baseline"
        | "relaxed"
        | "normal"
        | "stressed"
        | "overloaded"
        | null,
      confidence: observation.confidence,
      evidenceCount: observation.evidenceCount,
    })),
  });
}

async function geminiExecutionDecision(
  tasks: Array<typeof tasksTable.$inferSelect>,
  policies: Map<number, ReturnType<typeof deriveExecutionPolicy>>,
  state: ExecutionDecisionState,
  guidance: Array<typeof executionObservationsTable.$inferSelect>,
  log: { warn: (object: unknown, message: string) => void },
) {
  if (!isGeminiConfigured()) return null;

  const config = getGeminiConfig();
  const prompt = `Choose one concrete execution decision. Return only JSON with exactly these keys:
{"taskId":123,"durationMinutes":20,"firstAction":"A concrete first action.","stoppingPoint":"A clear boundary for stopping.","reason":"A short explanation."}

Choose exactly one taskId from the supplied candidate list. Do not invent tasks or IDs. durationMinutes must be a whole number from 1 through the supplied maxDurationMinutes and must not exceed availableMinutes. Keep firstAction, stoppingPoint, and reason concise and concrete. Do not return alternatives, arrays, markdown, or any additional keys.

Current execution state:
${JSON.stringify(state, null, 2)}

Relevant user-controlled guidance:
${JSON.stringify(guidance.slice(0, 12).map((observation) => ({
    finding: observation.finding,
    stateContext: observation.stateContext,
  })), null, 2)}

Candidate tasks:
${JSON.stringify(tasks.map((task) => {
    const policy = policies.get(task.id);
    return {
      taskId: task.id,
      title: task.title,
      importance: task.importance,
      urgency: task.urgency,
      interest: task.interest,
      estimatedMinutes: task.estimatedMinutes,
      deadline: task.deadline?.toISOString() ?? null,
      maxDurationMinutes: policy?.suggestedDurationMinutes ?? 1,
      nextActionStyle: policy?.nextActionStyle ?? "concrete_first_action",
      stoppingPointRequired: policy?.stoppingPointRequired ?? true,
      reduceScope: policy?.reduceScope ?? true,
    };
  }), null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      log.warn({ status: response.status }, "Execution decision provider request failed");
      return null;
    }

    const text = extractGeminiText(await response.json());
    if (!text) return null;

    let candidate: unknown;
    try {
      candidate = parseGeminiJson(text);
    } catch {
      log.warn({}, "Execution decision provider returned invalid JSON");
      return null;
    }

    let decision: ReturnType<typeof validateExecutionDecision>;
    try {
      decision = validateExecutionDecision(candidate);
      const task = tasks.find((item) => item.id === decision.taskId);
      const policy = task ? policies.get(task.id) : undefined;
      if (!task || !policy) throw new TypeError("Execution decision selected an unknown task.");
      return validateExecutionDecisionForTask(
        candidate,
        decisionTask(task),
        policy,
        state.availableMinutes,
      );
    } catch {
      log.warn({}, "Execution decision provider returned an invalid decision");
      return null;
    }
  } catch (error) {
    log.warn({ err: error }, "Execution decision provider request failed");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

router.get("/tasks", async (_req, res): Promise<void> => {
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.ownerId, res.locals.userId as string),
      ne(tasksTable.status, "archived"),
    ))
    .orderBy(asc(tasksTable.status), asc(tasksTable.deadline), desc(tasksTable.updatedAt));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListTasksResponse.parse(tasks.map(toApiTask)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid task input");
    res.status(400).json({ error: "Please check the task details." });
    return;
  }

  const repeatIntervalMinutes = normalizeRepeatInterval(parsed.data.repeatIntervalMinutes);
  if (repeatIntervalMinutes === INVALID_REPEAT_INTERVAL) {
    res.status(400).json({ error: "Please choose a valid repeat interval." });
    return;
  }

  const nextOccurrenceAt = repeatIntervalMinutes ? new Date() : null;
  const [task] = await db.insert(tasksTable).values({
    ownerId: res.locals.userId as string,
    title: parsed.data.title.trim(),
    notes: parsed.data.notes?.trim() || null,
    importance: parsed.data.importance,
    urgency: parsed.data.urgency,
    energyRequired: parsed.data.energyRequired,
    interest: parsed.data.interest,
    estimatedMinutes: parsed.data.estimatedMinutes,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    repeatIntervalMinutes,
    nextOccurrenceAt,
    status: "inbox",
  }).returning();

  res.status(201).json(CreateTaskResponse.parse(toApiTask(task)));
});

router.post("/tasks/recommend", async (req, res): Promise<void> => {
  const parsed = RecommendTasksBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid task recommendation input");
    res.status(400).json({ error: "Please check the recommendation inputs." });
    return;
  }

  if (!Number.isInteger(parsed.data.availableMinutes)
    || !Number.isInteger(parsed.data.currentEnergy)) {
    res.status(400).json({ error: "Recommendation inputs must be whole numbers." });
    return;
  }

  const inputs: RecommendationInputs = parsed.data;
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.ownerId, res.locals.userId as string),
      inArray(tasksTable.status, ["inbox", "active"]),
    ))
    .orderBy(asc(tasksTable.deadline), desc(tasksTable.updatedAt));

  const fallback = {
    recommendations: deterministicRecommendations(tasks, inputs),
    source: "deterministic" as const,
  };

  if (!tasks.length) {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(RecommendTasksResponse.parse(fallback));
    return;
  }

  const aiResult = await geminiRecommendations(tasks, inputs, req.log);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(RecommendTasksResponse.parse(aiResult ?? fallback));
});

router.post("/tasks/triage", async (req, res): Promise<void> => {
  const parsed = TriageTasksBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid task triage input");
    res.status(400).json({ error: "Please provide one actionable item per line, with no more than 40 items." });
    return;
  }

  const items = parseTriageSource(parsed.data.input);
  if (!items) {
    res.status(400).json({ error: "Please provide one actionable item per line, with no more than 40 items of 200 characters each." });
    return;
  }

  if (!isGeminiConfigured()) {
    req.log.warn({}, "Task triage requested while Gemini is not configured");
    res.status(503).json({ error: "Sorting is temporarily unavailable. Try again later." });
    return;
  }

  const result = await geminiTriage(items, req.log);
  if (!result) {
    res.status(502).json({ error: "The list could not be sorted safely. Try again." });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.json(result);
});

router.post("/tasks/decision", async (req, res): Promise<void> => {
  const parsed = DecideExecutionTaskBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid execution decision input");
    res.status(400).json({ error: "Please check the execution decision inputs." });
    return;
  }

  if (!Number.isInteger(parsed.data.availableMinutes)
    || !Number.isInteger(parsed.data.currentEnergy)) {
    res.status(400).json({ error: "Execution decision inputs must be whole numbers." });
    return;
  }

  const ownerId = res.locals.userId as string;
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.ownerId, ownerId),
      inArray(tasksTable.status, ["inbox", "active"]),
    ))
    .orderBy(asc(tasksTable.deadline), desc(tasksTable.updatedAt));

  if (!tasks.length) {
    res.status(404).json({ error: "No active or inbox task is available for a decision." });
    return;
  }

  const [storedState] = await db
    .select()
    .from(executionStateTable)
    .where(eq(executionStateTable.ownerId, ownerId));
  const state: ExecutionDecisionState = {
    energy: storedState?.energy
      ? storedLevel(storedState.energy)
      : energyLevelFromScore(parsed.data.currentEnergy),
    stress: storedLevel(storedState?.stress),
    availableMinutes: parsed.data.availableMinutes,
  };

  const guidanceRows = await db
    .select()
    .from(executionObservationsTable)
    .where(eq(executionObservationsTable.ownerId, ownerId))
    .orderBy(desc(executionObservationsTable.updatedAt));
  const relevantGuidance = guidanceRows.filter((observation) =>
    observation.capabilities.length === 0
    || observation.capabilities.includes("task_recommendation"),
  );

  const policies = new Map(
    tasks.map((task) => [task.id, policyForDecisionTask(task, state, relevantGuidance)]),
  );
  const ranked = deterministicRecommendations(tasks, {
    availableMinutes: parsed.data.availableMinutes,
    currentEnergy: parsed.data.currentEnergy,
  });
  const selected = ranked[0] ? tasks.find((task) => task.id === ranked[0].taskId) : undefined;
  const selectedPolicy = selected ? policies.get(selected.id) : undefined;

  if (!selected || !selectedPolicy) {
    res.status(404).json({ error: "No valid task decision is available." });
    return;
  }

  const fallback = createDeterministicExecutionDecision(
    decisionTask(selected),
    selectedPolicy,
    ranked[0].reason,
  );
  const aiDecision = await geminiExecutionDecision(
    tasks,
    policies,
    state,
    relevantGuidance,
    req.log,
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(DecideExecutionTaskResponse.parse(aiDecision ?? fallback));
});

router.post("/tasks/:id/schedule", async (req, res): Promise<void> => {
  const params = ScheduleTaskParams.safeParse(req.params);
  const parsed = ScheduleTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Please choose a valid start time and duration." });
    return;
  }

  if (!Number.isInteger(parsed.data.durationMinutes)) {
    res.status(400).json({ error: "Duration must be a whole number of minutes." });
    return;
  }

  const startMinutes = timeToMinutes(parsed.data.startTime);
  if (startMinutes === null || startMinutes + parsed.data.durationMinutes >= 24 * 60) {
    res.status(400).json({ error: "The work session must fit within the selected day." });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.id, params.data.id),
      eq(tasksTable.ownerId, res.locals.userId as string),
      inArray(tasksTable.status, ["inbox", "active"]),
    ))
    .limit(1);

  if (!task) {
    res.status(404).json({ error: "Active task not found." });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({
      ownerId: res.locals.userId as string,
      title: task.title,
      scheduledDate: parsed.data.scheduledDate,
      startTime: parsed.data.startTime,
      endTime: minutesToTime(startMinutes + parsed.data.durationMinutes),
      category: "work",
      completed: false,
      locked: false,
      pinned: false,
      note: null,
    })
    .returning();

  res.status(201).json(ScheduleTaskResponse.parse({
    ...activity,
    updatedAt: activity.updatedAt.toISOString(),
  }));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    req.log.warn({
      params: params.success ? undefined : params.error.flatten(),
      body: parsed.success ? undefined : parsed.error.flatten(),
    }, "Invalid task update");
    res.status(400).json({ error: "Please check the task changes." });
    return;
  }

  const repeatIntervalMinutes = normalizeRepeatInterval(parsed.data.repeatIntervalMinutes);
  if (repeatIntervalMinutes === INVALID_REPEAT_INTERVAL) {
    res.status(400).json({ error: "Please choose a valid repeat interval." });
    return;
  }

  const { deadline, repeatIntervalMinutes: _repeatIntervalMinutes, status, ...data } = parsed.data;
  const [existingTask] = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.id, params.data.id),
      eq(tasksTable.ownerId, res.locals.userId as string),
      ne(tasksTable.status, "archived"),
    ))
    .limit(1);

  if (!existingTask) {
    res.status(404).json({ error: "Task not found." });
    return;
  }

  const repeatIntervalChanged = repeatIntervalMinutes !== undefined
    && !sameRepeatInterval(existingTask.repeatIntervalMinutes, repeatIntervalMinutes);
  const [task] = await db
    .update(tasksTable)
    .set({
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
      ...(repeatIntervalMinutes !== undefined
        ? {
            repeatIntervalMinutes,
            ...(repeatIntervalChanged
              ? { nextOccurrenceAt: repeatIntervalMinutes ? new Date() : null }
              : {}),
          }
        : {}),
      ...(status !== undefined ? { status, completedAt: null } : {}),
    })
    .where(and(
      eq(tasksTable.id, params.data.id),
      eq(tasksTable.ownerId, res.locals.userId as string),
      ne(tasksTable.status, "archived"),
    ))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found." });
    return;
  }

  res.json(UpdateTaskResponse.parse(toApiTask(task)));
});

router.post("/tasks/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid task is required." });
    return;
  }

  const parsed = CompleteTaskBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Please refresh the task before completing it." });
    return;
  }

  const expectedNextOccurrenceAt = parsed.data.expectedNextOccurrenceAt
    ? new Date(parsed.data.expectedNextOccurrenceAt)
    : undefined;
  if (expectedNextOccurrenceAt && Number.isNaN(expectedNextOccurrenceAt.getTime())) {
    res.status(400).json({ error: "Please refresh the task before completing it." });
    return;
  }

  const result = await db.transaction((tx) => completeTaskInTransaction(tx, {
    taskId: params.data.id,
    ownerId: res.locals.userId as string,
    expectedNextOccurrenceAt,
  }));

  if (result.kind === "missing") {
    res.status(404).json({ error: "Task not found." });
    return;
  }

  if (result.kind === "conflict") {
    res.status(409).json({ error: "This recurring task occurrence has already advanced. Refresh the task and try again." });
    return;
  }

  res.json(CompleteTaskResponse.parse(toApiTask(result.task)));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = ArchiveTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid task is required." });
    return;
  }

  const [task] = await db
    .update(tasksTable)
    .set({ status: "archived" })
    .where(and(
      eq(tasksTable.id, params.data.id),
      eq(tasksTable.ownerId, res.locals.userId as string),
      ne(tasksTable.status, "archived"),
    ))
    .returning({ id: tasksTable.id });

  if (!task) {
    res.status(404).json({ error: "Task not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;