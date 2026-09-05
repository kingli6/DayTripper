import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { activitiesTable, db, tasksTable } from "@workspace/db";
import {
  ArchiveTaskParams,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  ListTasksResponse,
  RecommendTasksBody,
  RecommendTasksResponse,
  ScheduleTaskBody,
  ScheduleTaskParams,
  ScheduleTaskResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getGeminiConfig, isGeminiConfigured } from "../lib/ai";

const router: IRouter = Router();
router.use(requireAuth);

type RecommendationInputs = {
  availableMinutes: number;
  currentEnergy: number;
  currentInterest: number;
};

function toApiTask(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    notes: task.notes ?? null,
    deadline: task.deadline?.toISOString() ?? null,
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
  const interestFit = 10 - Math.abs(task.interest - inputs.currentInterest) * 2;
  return priority
    + deadlineScore(task.deadline)
    + timeFitScore(task.estimatedMinutes, inputs.availableMinutes)
    + energyFit
    + interestFit;
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

  if (Math.abs(task.interest - inputs.currentInterest) <= 1) {
    reasons.push("Its interest level matches your motivation");
  }

  const selected = reasons.slice(0, 3);
  return `${selected.join(". ")}${selected.length ? "." : "A balanced fit across priority, time, energy, and interest."}`;
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

Select at most 3 task IDs from the supplied active task list. Do not invent task information or IDs. Do not simply choose the highest-priority task. Consider what is realistically achievable right now: a lower-priority task can be better if it fits available time, energy, or interest substantially better. Deadlines and urgency matter. The user remains in control; recommend only and do not schedule anything.

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
    || !Number.isInteger(parsed.data.currentEnergy)
    || !Number.isInteger(parsed.data.currentInterest)) {
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

  const { deadline, ...data } = parsed.data;
  const [task] = await db
    .update(tasksTable)
    .set({
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
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

  const [task] = await db
    .update(tasksTable)
    .set({ status: "completed", completedAt: new Date() })
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

  res.json(CompleteTaskResponse.parse(toApiTask(task)));
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