import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { activityChangesTable, db, activitiesTable } from "@workspace/db";
import {
  CreateActivityBody,
  CreateActivityResponse,
  DeleteActivityParams,
  ListActivitiesQueryParams,
  ListActivitiesResponse,
  UpdateActivityBody,
  UpdateActivityParams,
  UpdateActivityResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

function durationMinutes(startTime: string, endTime: string | null) {
  if (!endTime) return null;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration > 0 ? duration : null;
}

function currentTimeValue() {
  const now = new Date();
  return `${`${now.getHours()}`.padStart(2, "0")}:${`${now.getMinutes()}`.padStart(2, "0")}`;
}

function toApiActivity(activity: typeof activitiesTable.$inferSelect) {
  return {
    ...activity,
    completedAt: activity.completedAt?.toISOString() ?? null,
    updatedAt: activity.updatedAt.toISOString(),
  };
}

router.get("/activities", async (req, res): Promise<void> => {
  const parsed = ListActivitiesQueryParams.safeParse(req.query);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid activity date");
    res.status(400).json({ error: "A valid calendar date is required." });
    return;
  }

  // The calendar date is intentionally compared as a date-only string. Do
  // not construct a JS Date here: converting a YYYY-MM-DD value through UTC
  // would move the activity across a user's local-midnight boundary.
  const ownerId = res.locals.userId;
  if (!ownerId) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.ownerId, ownerId),
        eq(activitiesTable.scheduledDate, parsed.data.date),
      ),
    )
    .orderBy(asc(activitiesTable.startTime), asc(activitiesTable.id));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListActivitiesResponse.parse(activities.map(toApiActivity)));
});

router.post("/activities", async (req, res): Promise<void> => {
  const parsed = CreateActivityBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid activity input");
    res.status(400).json({ error: "Please check the activity details." });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({
      ownerId: res.locals.userId as string,
      title: parsed.data.title,
      scheduledDate: parsed.data.scheduledDate,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime ?? null,
      category: parsed.data.category ?? null,
      completed: parsed.data.completed ?? false,
      locked: parsed.data.locked ?? false,
      pinned: parsed.data.pinned ?? false,
      note: parsed.data.note ?? null,
    })
    .returning();

  res.status(201).json(CreateActivityResponse.parse(toApiActivity(activity)));
});

router.patch("/activities/:id", async (req, res): Promise<void> => {
  const params = UpdateActivityParams.safeParse(req.params);

  if (!params.success) {
    res.status(400).json({ error: "A valid activity is required." });
    return;
  }

  const parsed = UpdateActivityBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid activity update");
    res.status(400).json({ error: "Please check the activity changes." });
    return;
  }

  const expectedUpdatedAt = parsed.data.expectedUpdatedAt;
  const expectedUpdatedAtDate = expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined;
  if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAtDate?.getTime())) {
    res.status(400).json({ error: "A valid activity version is required." });
    return;
  }

  const updateValues = {
    ...(parsed.data.title !== undefined && { title: parsed.data.title }),
    ...(parsed.data.scheduledDate !== undefined && {
      scheduledDate: parsed.data.scheduledDate,
    }),
    ...(parsed.data.startTime !== undefined && {
      startTime: parsed.data.startTime,
    }),
    ...(parsed.data.endTime !== undefined && { endTime: parsed.data.endTime }),
    ...(parsed.data.category !== undefined && { category: parsed.data.category }),
    ...(parsed.data.completed !== undefined && {
      completed: parsed.data.completed,
    }),
    ...(parsed.data.locked !== undefined && { locked: parsed.data.locked }),
    ...(parsed.data.pinned !== undefined && { pinned: parsed.data.pinned }),
    ...(parsed.data.note !== undefined && { note: parsed.data.note }),
  };

  if (Object.keys(updateValues).length === 0) {
    res.status(400).json({ error: "No activity changes were provided." });
    return;
  }

  const activity = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.id, params.data.id),
          eq(activitiesTable.ownerId, res.locals.userId as string),
        ),
      )
      .limit(1);

    if (!before) return { kind: "missing" as const };
    if (
      expectedUpdatedAtDate &&
      before.updatedAt.getTime() !== expectedUpdatedAtDate.getTime()
    ) {
      return { kind: "conflict" as const };
    }

    const completionChanged = parsed.data.completed !== undefined
      && parsed.data.completed !== before.completed;
    const [updated] = await tx
      .update(activitiesTable)
      .set({
        ...updateValues,
        ...(completionChanged
          ? { completedAt: parsed.data.completed ? new Date() : null }
          : {}),
      })
      .where(
        and(
          eq(activitiesTable.id, params.data.id),
          eq(activitiesTable.ownerId, res.locals.userId as string),
        ),
      )
      .returning();

    if (!updated) return { kind: "missing" as const };

    const changes: Array<typeof activityChangesTable.$inferInsert> = [];
    const effectiveDate = updated.scheduledDate;
    const common = {
      ownerId: res.locals.userId as string,
      activityId: updated.id,
      scheduledDate: effectiveDate,
      activityTitle: updated.title,
      previousTitle: before.title,
      nextTitle: updated.title,
      previousStartTime: before.startTime,
      nextStartTime: updated.startTime,
      previousEndTime: before.endTime,
      nextEndTime: updated.endTime,
      note: null,
      source: "manual" as const,
    };

    if (
      before.scheduledDate !== updated.scheduledDate ||
      before.startTime !== updated.startTime
    ) {
      changes.push({ ...common, changeType: "moved" });
    }

    const beforeDuration = durationMinutes(before.startTime, before.endTime);
    const updatedDuration = durationMinutes(updated.startTime, updated.endTime);
    if (
      beforeDuration !== null &&
      updatedDuration !== null &&
      updatedDuration > beforeDuration
    ) {
      changes.push({ ...common, changeType: "extended" });
    } else if (
      beforeDuration !== null &&
      updatedDuration !== null &&
      updatedDuration < beforeDuration
    ) {
      changes.push({ ...common, changeType: "shortened" });
    }

    if (before.title !== updated.title) {
      changes.push({ ...common, changeType: "renamed" });
    }

    if (
      !before.completed &&
      updated.completed &&
      before.endTime &&
      currentTimeValue() > before.endTime
    ) {
      changes.push({ ...common, changeType: "completed_later" });
    }

    if (changes.length > 0) {
      await tx.insert(activityChangesTable).values(changes);
    }

    return { kind: "updated" as const, activity: updated };
  });

  if (activity.kind === "missing") {
    res.status(404).json({ error: "Activity not found." });
    return;
  }
  if (activity.kind === "conflict") {
    res.status(409).json({ error: "This activity changed elsewhere. Reload it before saving." });
    return;
  }

  res.json(UpdateActivityResponse.parse(toApiActivity(activity.activity)));
});

router.delete("/activities/:id", async (req, res): Promise<void> => {
  const params = DeleteActivityParams.safeParse(req.params);

  if (!params.success) {
    res.status(400).json({ error: "A valid activity is required." });
    return;
  }

  const expectedUpdatedAt = req.header("If-Unmodified-Since");
  const expectedUpdatedAtDate = expectedUpdatedAt
    ? new Date(expectedUpdatedAt)
    : undefined;
  if (expectedUpdatedAt && Number.isNaN(expectedUpdatedAtDate?.getTime())) {
    res.status(400).json({ error: "A valid activity version is required." });
    return;
  }

  const activity = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.id, params.data.id),
          eq(activitiesTable.ownerId, res.locals.userId as string),
        ),
      )
      .limit(1);

    if (!before) return { kind: "missing" as const };
    if (
      expectedUpdatedAtDate &&
      before.updatedAt.getTime() !== expectedUpdatedAtDate.getTime()
    ) {
      return { kind: "conflict" as const };
    }

    const [deleted] = await tx
      .delete(activitiesTable)
      .where(
        and(
          eq(activitiesTable.id, params.data.id),
          eq(activitiesTable.ownerId, res.locals.userId as string),
        ),
      )
      .returning({ id: activitiesTable.id });

    if (!deleted) return { kind: "missing" as const };

    await tx.insert(activityChangesTable).values({
      ownerId: res.locals.userId as string,
      activityId: before.id,
      scheduledDate: before.scheduledDate,
      activityTitle: before.title,
      changeType: "removed",
      previousTitle: before.title,
      nextTitle: null,
      previousStartTime: before.startTime,
      nextStartTime: null,
      previousEndTime: before.endTime,
      nextEndTime: null,
      note: null,
      source: "manual",
    });

    return { kind: "deleted" as const, activity: deleted };
  });

  if (activity.kind === "missing") {
    res.status(404).json({ error: "Activity not found." });
    return;
  }
  if (activity.kind === "conflict") {
    res.status(409).json({ error: "This activity changed elsewhere. Reload it before removing." });
    return;
  }

  res.sendStatus(204);
});

export default router;