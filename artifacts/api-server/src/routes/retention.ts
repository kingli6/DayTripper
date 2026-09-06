import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  retentionObservationsTable,
  retentionPracticesTable,
} from "@workspace/db";
import {
  CreateRetentionObservationBody,
  CreateRetentionObservationParams,
  CreateRetentionObservationResponse,
  CreateRetentionPracticeBody,
  CreateRetentionPracticeResponse,
  DeleteRetentionPracticeParams,
  GetRetentionPracticeParams,
  GetRetentionPracticeResponse,
  ListRetentionObservationsParams,
  ListRetentionObservationsResponse,
  ListRetentionPracticesResponse,
  UpdateRetentionPracticeBody,
  UpdateRetentionPracticeParams,
  UpdateRetentionPracticeResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

const halfLifeDaysBySpeed = {
  slow: 42,
  moderate: 24,
  fast: 12,
} as const;

function ownerIdFromRequest(res: { locals: { userId?: unknown } }): string | null {
  return typeof res.locals.userId === "string" ? res.locals.userId : null;
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function nextAvailableDate(
  lastCompletedDate: string | null,
  repeatIntervalDays: number | null,
): string | null {
  if (!lastCompletedDate || repeatIntervalDays === null) return null;
  return addCalendarDays(lastCompletedDate, repeatIntervalDays);
}

function serializePractice(
  practice: typeof retentionPracticesTable.$inferSelect,
  lastCompletedDate: string | null = null,
) {
  return {
    id: practice.id,
    name: practice.name,
    unit: practice.unit,
    direction: "higher" as const,
    retentionSpeed: practice.retentionSpeed as "slow" | "moderate" | "fast",
    repeatIntervalDays: practice.repeatIntervalDays,
    nextAvailableDate: nextAvailableDate(lastCompletedDate, practice.repeatIntervalDays),
    createdAt: toIsoTimestamp(practice.createdAt),
    updatedAt: toIsoTimestamp(practice.updatedAt),
  };
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeObservation(
  observation: typeof retentionObservationsTable.$inferSelect,
) {
  return {
    ...observation,
    curveHalfLifeDays: observation.curveHalfLifeDays,
    createdAt: toIsoTimestamp(observation.createdAt),
  };
}

async function findOwnedPractice(practiceId: number, ownerId: string) {
  const [practice] = await db
    .select()
    .from(retentionPracticesTable)
    .where(
      and(
        eq(retentionPracticesTable.id, practiceId),
        eq(retentionPracticesTable.ownerId, ownerId),
      ),
    )
    .limit(1);

  return practice;
}

async function findLatestObservationDate(practiceId: number): Promise<string | null> {
  const [observation] = await db
    .select({ recordedDate: retentionObservationsTable.recordedDate })
    .from(retentionObservationsTable)
    .where(eq(retentionObservationsTable.practiceId, practiceId))
    .orderBy(
      desc(retentionObservationsTable.recordedDate),
      desc(retentionObservationsTable.createdAt),
      desc(retentionObservationsTable.id),
    )
    .limit(1);

  return observation?.recordedDate ?? null;
}

function trimmedRequiredValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

router.get("/retention/practices", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const practices = await db
    .select()
    .from(retentionPracticesTable)
    .where(eq(retentionPracticesTable.ownerId, ownerId))
    .orderBy(desc(retentionPracticesTable.updatedAt), asc(retentionPracticesTable.id));

  const latestDates = new Map<number, string>();
  if (practices.length > 0) {
    const observations = await db
      .select({
        practiceId: retentionObservationsTable.practiceId,
        recordedDate: retentionObservationsTable.recordedDate,
      })
      .from(retentionObservationsTable)
      .where(inArray(retentionObservationsTable.practiceId, practices.map((practice) => practice.id)))
      .orderBy(
        desc(retentionObservationsTable.recordedDate),
        desc(retentionObservationsTable.createdAt),
        desc(retentionObservationsTable.id),
      );

    for (const observation of observations) {
      if (!latestDates.has(observation.practiceId)) {
        latestDates.set(observation.practiceId, observation.recordedDate);
      }
    }
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    ListRetentionPracticesResponse.parse(
      practices.map((practice) => serializePractice(practice, latestDates.get(practice.id) ?? null)),
    ),
  );
});

router.post("/retention/practices", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = CreateRetentionPracticeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid retention practice input");
    res.status(400).json({ error: "Please check the practice details." });
    return;
  }

  const name = trimmedRequiredValue(parsed.data.name);
  const unit = trimmedRequiredValue(parsed.data.unit);
  if (!name || !unit) {
    res.status(400).json({ error: "Practice name and unit are required." });
    return;
  }
  if (
    parsed.data.repeatIntervalDays !== undefined
    && parsed.data.repeatIntervalDays !== null
    && (!Number.isInteger(parsed.data.repeatIntervalDays) || parsed.data.repeatIntervalDays < 1)
  ) {
    res.status(400).json({ error: "Repeat availability must be a whole number of days." });
    return;
  }

  const [practice] = await db
    .insert(retentionPracticesTable)
    .values({
      ownerId,
      name,
      unit,
      direction: "higher",
      retentionSpeed: parsed.data.retentionSpeed ?? "moderate",
      repeatIntervalDays: parsed.data.repeatIntervalDays ?? null,
    })
    .returning();

  res
    .status(201)
    .json(CreateRetentionPracticeResponse.parse(serializePractice(practice)));
});

router.get("/retention/practices/:practiceId", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = GetRetentionPracticeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid practice is required." });
    return;
  }

  const practice = await findOwnedPractice(params.data.practiceId, ownerId);
  if (!practice) {
    res.status(404).json({ error: "Retention practice not found." });
    return;
  }

  const lastCompletedDate = await findLatestObservationDate(practice.id);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetRetentionPracticeResponse.parse(serializePractice(practice, lastCompletedDate)));
});

router.patch("/retention/practices/:practiceId", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = UpdateRetentionPracticeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid practice is required." });
    return;
  }

  const parsed = UpdateRetentionPracticeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid retention practice update");
    res.status(400).json({ error: "Please check the practice changes." });
    return;
  }

  const updateValues: Partial<typeof retentionPracticesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) {
    const name = trimmedRequiredValue(parsed.data.name);
    if (!name) {
      res.status(400).json({ error: "Practice name is required." });
      return;
    }
    updateValues.name = name;
  }
  if (parsed.data.unit !== undefined) {
    const unit = trimmedRequiredValue(parsed.data.unit);
    if (!unit) {
      res.status(400).json({ error: "Practice unit is required." });
      return;
    }
    updateValues.unit = unit;
  }
  if (parsed.data.retentionSpeed !== undefined) {
    updateValues.retentionSpeed = parsed.data.retentionSpeed;
  }
  if (parsed.data.repeatIntervalDays !== undefined) {
    if (
      parsed.data.repeatIntervalDays !== null
      && (!Number.isInteger(parsed.data.repeatIntervalDays) || parsed.data.repeatIntervalDays < 1)
    ) {
      res.status(400).json({ error: "Repeat availability must be a whole number of days." });
      return;
    }
    updateValues.repeatIntervalDays = parsed.data.repeatIntervalDays;
  }

  if (Object.keys(updateValues).length === 0) {
    res.status(400).json({ error: "No practice changes were provided." });
    return;
  }

  const [practice] = await db
    .update(retentionPracticesTable)
    .set(updateValues)
    .where(
      and(
        eq(retentionPracticesTable.id, params.data.practiceId),
        eq(retentionPracticesTable.ownerId, ownerId),
      ),
    )
    .returning();

  if (!practice) {
    res.status(404).json({ error: "Retention practice not found." });
    return;
  }

  const lastCompletedDate = await findLatestObservationDate(practice.id);
  res.json(UpdateRetentionPracticeResponse.parse(serializePractice(practice, lastCompletedDate)));
});

router.delete("/retention/practices/:practiceId", async (req, res): Promise<void> => {
  const ownerId = ownerIdFromRequest(res);
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const params = DeleteRetentionPracticeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid practice is required." });
    return;
  }

  const [deleted] = await db
    .delete(retentionPracticesTable)
    .where(
      and(
        eq(retentionPracticesTable.id, params.data.practiceId),
        eq(retentionPracticesTable.ownerId, ownerId),
      ),
    )
    .returning({ id: retentionPracticesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Retention practice not found." });
    return;
  }

  res.sendStatus(204);
});

router.get(
  "/retention/practices/:practiceId/observations",
  async (req, res): Promise<void> => {
    const ownerId = ownerIdFromRequest(res);
    if (!ownerId) {
      res.status(401).json({ error: "Authentication is required." });
      return;
    }

    const params = ListRetentionObservationsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "A valid practice is required." });
      return;
    }

    const practice = await findOwnedPractice(params.data.practiceId, ownerId);
    if (!practice) {
      res.status(404).json({ error: "Retention practice not found." });
      return;
    }

    const observations = await db
      .select()
      .from(retentionObservationsTable)
      .where(eq(retentionObservationsTable.practiceId, practice.id))
      .orderBy(
        asc(retentionObservationsTable.recordedDate),
        asc(retentionObservationsTable.createdAt),
        asc(retentionObservationsTable.id),
      );

    res.setHeader("Cache-Control", "private, no-store");
    res.json(ListRetentionObservationsResponse.parse(observations.map(serializeObservation)));
  },
);

router.post(
  "/retention/practices/:practiceId/observations",
  async (req, res): Promise<void> => {
    const ownerId = ownerIdFromRequest(res);
    if (!ownerId) {
      res.status(401).json({ error: "Authentication is required." });
      return;
    }

    const params = CreateRetentionObservationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "A valid practice is required." });
      return;
    }

    const parsed = CreateRetentionObservationBody.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.flatten() }, "Invalid retention observation input");
      res.status(400).json({ error: "Please check the recorded result." });
      return;
    }

    const practice = await findOwnedPractice(params.data.practiceId, ownerId);
    if (!practice) {
      res.status(404).json({ error: "Retention practice not found." });
      return;
    }

    const observation = await db.transaction(async (tx) => {
      const priorObservations = await tx
        .select({
          recordedDate: retentionObservationsTable.recordedDate,
          value: retentionObservationsTable.value,
        })
        .from(retentionObservationsTable)
        .where(
          and(
            eq(retentionObservationsTable.practiceId, practice.id),
            lte(retentionObservationsTable.recordedDate, parsed.data.recordedDate),
          ),
        )
        .orderBy(
          asc(retentionObservationsTable.recordedDate),
          asc(retentionObservationsTable.createdAt),
          asc(retentionObservationsTable.id),
        );

      const previousHigh = priorObservations.reduce<number | null>(
        (highest, prior) => (highest === null ? prior.value : Math.max(highest, prior.value)),
        null,
      );
      const isNewPersonalHigh =
        previousHigh === null || parsed.data.value > previousHigh;
      const curveHalfLifeDays = isNewPersonalHigh
        ? halfLifeDaysBySpeed[practice.retentionSpeed as keyof typeof halfLifeDaysBySpeed]
        : null;

      const [created] = await tx
        .insert(retentionObservationsTable)
        .values({
          practiceId: practice.id,
          recordedDate: parsed.data.recordedDate,
          value: parsed.data.value,
          context: parsed.data.context ?? null,
          curveHalfLifeDays,
        })
        .returning();

      return created;
    });

    res
      .status(201)
      .json(CreateRetentionObservationResponse.parse(serializeObservation(observation)));
  },
);

export default router;