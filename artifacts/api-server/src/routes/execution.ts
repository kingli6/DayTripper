import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  db,
  executionObservationsTable,
  executionSessionsTable,
  executionStateTable,
  tasksTable,
} from "@workspace/db";
import {
  CompleteExecutionSessionParams,
  CompleteExecutionSessionResponse,
  CreateExecutionObservationBody,
  CreateExecutionObservationResponse,
  GetActiveExecutionSessionResponse,
  GetExecutionAnalysisResponse,
  GetExecutionStateResponse,
  ListExecutionObservationsResponse,
  SetExecutionStateBody,
  SetExecutionStateResponse,
  StartExecutionSessionBody,
  StartExecutionSessionResponse,
  StopExecutionSessionParams,
  StopExecutionSessionResponse,
  UpdateExecutionObservationBody,
  UpdateExecutionObservationParams,
  UpdateExecutionObservationResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  canStartExecutionSession,
  endExecutionSessionStatus,
  expectedNextOccurrenceAtForTask,
  validateExecutionSessionStart,
} from "../lib/executionSession";
import { analyzeExecutionHistory } from "../lib/executionAnalysis";
import {
  completeExecutionSessionInTransaction,
} from "../lib/executionCompletion";

const router: IRouter = Router();
router.use(requireAuth);

function ownerIdFromRequest(res: { locals: { userId?: unknown } }): string | null {
  return typeof res.locals.userId === "string" ? res.locals.userId : null;
}

function trimmedRequiredValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serializeObservation(observation: typeof executionObservationsTable.$inferSelect) {
  return {
    id: observation.id,
    dimension: observation.dimension,
    finding: observation.finding,
    stateContext: observation.stateContext,
    confidence: observation.confidence,
    evidenceCount: observation.evidenceCount,
    source: observation.source,
    capabilities: observation.capabilities,
    createdAt: observation.createdAt.toISOString(),
    updatedAt: observation.updatedAt.toISOString(),
  };
}

function serializeState(state: typeof executionStateTable.$inferSelect) {
  return {
    energy: state.energy,
    stress: state.stress,
    availableMinutes: state.availableMinutes,
    capturedAt: state.capturedAt.toISOString(),
  };
}

function serializeSession(session: typeof executionSessionsTable.$inferSelect) {
  return {
    id: session.id,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    plannedMinutes: session.plannedMinutes,
    endedAt: session.endedAt?.toISOString() ?? null,
    expectedNextOccurrenceAt: session.expectedNextOccurrenceAt?.toISOString() ?? null,
    status: session.status,
    firstAction: session.firstAction,
    stoppingPoint: session.stoppingPoint,
  };
}

function validEvidenceCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validAvailableMinutes(value: number | null | undefined): boolean {
  return value === null
    || value === undefined
    || (Number.isInteger(value) && value >= 0 && value <= 1440);
}

router.get("/execution/observations", async (_req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const observations = await db
    .select()
    .from(executionObservationsTable)
    .where(eq(executionObservationsTable.ownerId, ownerId))
    .orderBy(desc(executionObservationsTable.updatedAt), asc(executionObservationsTable.id));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListExecutionObservationsResponse.parse(observations.map(serializeObservation)));
});

router.post("/execution/observations", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = CreateExecutionObservationBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid execution observation input");
    res.status(400).json({ error: "Please check the execution observation." });
    return;
  }

  const dimension = trimmedRequiredValue(parsed.data.dimension);
  const finding = trimmedRequiredValue(parsed.data.finding);
  const source = trimmedRequiredValue(parsed.data.source);
  if (!dimension || !finding || !source) {
    res.status(400).json({ error: "Dimension, finding, and source are required." });
    return;
  }
  if (!validEvidenceCount(parsed.data.evidenceCount)) {
    res.status(400).json({ error: "Evidence count must be a non-negative whole number." });
    return;
  }

  const [observation] = await db
    .insert(executionObservationsTable)
    .values({
      ownerId,
      dimension,
      finding,
      stateContext: parsed.data.stateContext ?? null,
      confidence: parsed.data.confidence,
      evidenceCount: parsed.data.evidenceCount,
      source,
      capabilities: parsed.data.capabilities ?? [],
    })
    .returning();

  res
    .status(201)
    .json(CreateExecutionObservationResponse.parse(serializeObservation(observation)));
});

router.patch("/execution/observations/:observationId", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = UpdateExecutionObservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid execution observation is required." });
    return;
  }

  const parsed = UpdateExecutionObservationBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid execution observation update");
    res.status(400).json({ error: "Please check the execution observation changes." });
    return;
  }

  const updateValues: Partial<typeof executionObservationsTable.$inferInsert> = {};
  if (parsed.data.dimension !== undefined) {
    const dimension = trimmedRequiredValue(parsed.data.dimension);
    if (!dimension) {
      res.status(400).json({ error: "Dimension is required." });
      return;
    }
    updateValues.dimension = dimension;
  }
  if (parsed.data.finding !== undefined) {
    const finding = trimmedRequiredValue(parsed.data.finding);
    if (!finding) {
      res.status(400).json({ error: "Finding is required." });
      return;
    }
    updateValues.finding = finding;
  }
  if (parsed.data.stateContext !== undefined) {
    updateValues.stateContext = parsed.data.stateContext;
  }
  if (parsed.data.confidence !== undefined) {
    updateValues.confidence = parsed.data.confidence;
  }
  if (parsed.data.evidenceCount !== undefined) {
    if (!validEvidenceCount(parsed.data.evidenceCount)) {
      res.status(400).json({ error: "Evidence count must be a non-negative whole number." });
      return;
    }
    updateValues.evidenceCount = parsed.data.evidenceCount;
  }
  if (parsed.data.source !== undefined) {
    const source = trimmedRequiredValue(parsed.data.source);
    if (!source) {
      res.status(400).json({ error: "Source is required." });
      return;
    }
    updateValues.source = source;
  }
  if (parsed.data.capabilities !== undefined) {
    updateValues.capabilities = parsed.data.capabilities;
  }

  if (Object.keys(updateValues).length === 0) {
    res.status(400).json({ error: "No execution observation changes were provided." });
    return;
  }

  const [observation] = await db
    .update(executionObservationsTable)
    .set(updateValues)
    .where(and(
      eq(executionObservationsTable.id, params.data.observationId),
      eq(executionObservationsTable.ownerId, ownerId),
    ))
    .returning();

  if (!observation) {
    res.status(404).json({ error: "Execution observation not found." });
    return;
  }

  res
    .json(UpdateExecutionObservationResponse.parse(serializeObservation(observation)));
});

router.delete("/execution/observations/:observationId", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = UpdateExecutionObservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid execution observation is required." });
    return;
  }

  const [deleted] = await db
    .delete(executionObservationsTable)
    .where(and(
      eq(executionObservationsTable.id, params.data.observationId),
      eq(executionObservationsTable.ownerId, ownerId),
    ))
    .returning({ id: executionObservationsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Execution observation not found." });
    return;
  }

  res.status(204).send();
});

router.get("/execution/state", async (_req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const [state] = await db
    .select()
    .from(executionStateTable)
    .where(eq(executionStateTable.ownerId, ownerId))
    .limit(1);

  if (!state) {
    res.status(404).json({ error: "Current execution state has not been captured." });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetExecutionStateResponse.parse(serializeState(state)));
});

router.put("/execution/state", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = SetExecutionStateBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid execution state input");
    res.status(400).json({ error: "Please check the current execution state." });
    return;
  }

  const hasProvidedValue = ["energy", "stress", "availableMinutes"]
    .some((key) => Object.prototype.hasOwnProperty.call(req.body, key));
  if (!hasProvidedValue) {
    res.status(400).json({ error: "At least one execution state value is required." });
    return;
  }
  if (!validAvailableMinutes(parsed.data.availableMinutes)) {
    res.status(400).json({ error: "Available minutes must be a non-negative whole number up to 1440." });
    return;
  }

  const [existing] = await db
    .select()
    .from(executionStateTable)
    .where(eq(executionStateTable.ownerId, ownerId))
    .limit(1);

  const values = {
    ownerId,
    energy: Object.prototype.hasOwnProperty.call(req.body, "energy")
      ? parsed.data.energy ?? null
      : existing?.energy ?? null,
    stress: Object.prototype.hasOwnProperty.call(req.body, "stress")
      ? parsed.data.stress ?? null
      : existing?.stress ?? null,
    availableMinutes: Object.prototype.hasOwnProperty.call(req.body, "availableMinutes")
      ? parsed.data.availableMinutes ?? null
      : existing?.availableMinutes ?? null,
    capturedAt: new Date(),
  };

  const [state] = existing
    ? await db
      .update(executionStateTable)
      .set(values)
      .where(eq(executionStateTable.ownerId, ownerId))
      .returning()
    : await db
      .insert(executionStateTable)
      .values(values)
      .returning();

  res.json(SetExecutionStateResponse.parse(serializeState(state)));
});

router.get("/execution/analysis", async (_req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const sessions = await db
    .select({
      id: executionSessionsTable.id,
      taskId: executionSessionsTable.taskId,
      startedAt: executionSessionsTable.startedAt,
      endedAt: executionSessionsTable.endedAt,
      plannedMinutes: executionSessionsTable.plannedMinutes,
      status: executionSessionsTable.status,
      taskEstimatedMinutes: tasksTable.estimatedMinutes,
    })
    .from(executionSessionsTable)
    .leftJoin(tasksTable, and(
      eq(tasksTable.id, executionSessionsTable.taskId),
      eq(tasksTable.ownerId, ownerId),
    ))
    .where(and(
      eq(executionSessionsTable.ownerId, ownerId),
      inArray(executionSessionsTable.status, ["completed", "stopped"]),
    ))
    .orderBy(desc(executionSessionsTable.endedAt));

  const analysis = analyzeExecutionHistory(sessions.map((session) => ({
    session: {
      id: session.id,
      taskId: session.taskId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      plannedMinutes: session.plannedMinutes,
      status: session.status as "completed" | "stopped",
    },
    task: session.taskEstimatedMinutes === null
      ? null
      : { estimatedMinutes: session.taskEstimatedMinutes },
  })));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetExecutionAnalysisResponse.parse(analysis));
});

router.get("/execution/sessions/active", async (_req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const [session] = await db
    .select()
    .from(executionSessionsTable)
    .where(and(
      eq(executionSessionsTable.ownerId, ownerId),
      eq(executionSessionsTable.status, "active"),
    ))
    .orderBy(desc(executionSessionsTable.startedAt))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "No active execution session." });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetActiveExecutionSessionResponse.parse(serializeSession(session)));
});

router.post("/execution/sessions", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = StartExecutionSessionBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid execution session input");
    res.status(400).json({ error: "Please check the execution session details." });
    return;
  }

  let sessionInput: ReturnType<typeof validateExecutionSessionStart>;
  try {
    sessionInput = validateExecutionSessionStart(parsed.data);
  } catch {
    res.status(400).json({ error: "A valid duration, first action, and stopping point are required." });
    return;
  }

  const [task] = await db
    .select({
      id: tasksTable.id,
      ownerId: tasksTable.ownerId,
      status: tasksTable.status,
      repeatIntervalMinutes: tasksTable.repeatIntervalMinutes,
      nextOccurrenceAt: tasksTable.nextOccurrenceAt,
    })
    .from(tasksTable)
    .where(and(
      eq(tasksTable.id, sessionInput.taskId),
      eq(tasksTable.ownerId, ownerId),
      inArray(tasksTable.status, ["inbox", "active"]),
    ))
    .limit(1);

  const [existing] = await db
    .select({ id: executionSessionsTable.id })
    .from(executionSessionsTable)
    .where(and(
      eq(executionSessionsTable.ownerId, ownerId),
      eq(executionSessionsTable.status, "active"),
    ))
    .limit(1);

  if (!canStartExecutionSession(
    ownerId,
    task,
    Boolean(existing),
  )) {
    if (!task) {
      res.status(404).json({ error: "The task is no longer available for execution." });
      return;
    }
    res.status(409).json({ error: "An execution session is already active." });
    return;
  }

  let session: typeof executionSessionsTable.$inferSelect;
  try {
    [session] = await db
      .insert(executionSessionsTable)
      .values({
        ownerId,
        taskId: sessionInput.taskId,
        plannedMinutes: sessionInput.plannedMinutes,
        expectedNextOccurrenceAt: expectedNextOccurrenceAtForTask(task),
        firstAction: sessionInput.firstAction,
        stoppingPoint: sessionInput.stoppingPoint,
        status: "active",
      })
      .returning();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "An execution session is already active." });
      return;
    }
    throw error;
  }

  res.status(201).json(StartExecutionSessionResponse.parse(serializeSession(session)));
});

async function endExecutionSession(
  sessionId: number,
  ownerId: string,
  status: "completed" | "stopped",
  res: Response,
  log: { warn: (value: unknown, message: string) => void },
): Promise<void> {
  const [session] = await db
    .select()
    .from(executionSessionsTable)
    .where(and(
      eq(executionSessionsTable.id, sessionId),
      eq(executionSessionsTable.ownerId, ownerId),
    ))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "Execution session not found." });
    return;
  }
  try {
    endExecutionSessionStatus(session.status as "active" | "completed" | "stopped", status);
  } catch {
    res.status(400).json({ error: "This execution session has already ended." });
    return;
  }

  const [ended] = await db
    .update(executionSessionsTable)
    .set({ endedAt: new Date(), status })
    .where(and(
      eq(executionSessionsTable.id, sessionId),
      eq(executionSessionsTable.ownerId, ownerId),
      eq(executionSessionsTable.status, "active"),
    ))
    .returning();

  if (!ended) {
    log.warn({ sessionId }, "Execution session ended concurrently");
    res.status(400).json({ error: "This execution session has already ended." });
    return;
  }

  const response = status === "completed"
    ? CompleteExecutionSessionResponse.parse(serializeSession(ended))
    : StopExecutionSessionResponse.parse(serializeSession(ended));
  res.json(response);
}

router.post("/execution/sessions/:sessionId/complete", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = CompleteExecutionSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid execution session is required." });
    return;
  }
  const result = await db.transaction((tx) => completeExecutionSessionInTransaction(tx, {
    sessionId: params.data.sessionId,
    ownerId,
  }));

  if (result.kind === "missing") {
    res.status(404).json({ error: "Execution session not found." });
    return;
  }
  if (result.kind === "ended") {
    res.status(400).json({ error: "This execution session has already ended." });
    return;
  }
  if (result.kind === "task-missing") {
    res.status(409).json({ error: "The task is no longer available for execution." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "This recurring task occurrence has already advanced. Refresh the task and try again." });
    return;
  }

  res.json(CompleteExecutionSessionResponse.parse(serializeSession(result.session)));
});

router.post("/execution/sessions/:sessionId/stop", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = StopExecutionSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid execution session is required." });
    return;
  }
  await endExecutionSession(params.data.sessionId, ownerId, "stopped", res, req.log);
});

export default router;