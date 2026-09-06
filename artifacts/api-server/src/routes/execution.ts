import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  executionObservationsTable,
  executionStateTable,
} from "@workspace/db";
import {
  CreateExecutionObservationBody,
  CreateExecutionObservationResponse,
  GetExecutionStateResponse,
  ListExecutionObservationsResponse,
  SetExecutionStateBody,
  SetExecutionStateResponse,
  UpdateExecutionObservationBody,
  UpdateExecutionObservationParams,
  UpdateExecutionObservationResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

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

export default router;