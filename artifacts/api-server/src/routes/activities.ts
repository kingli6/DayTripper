import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, activitiesTable } from "@workspace/db";
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

router.get("/activities", async (req, res): Promise<void> => {
  const parsed = ListActivitiesQueryParams.safeParse(req.query);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid activity date");
    res.status(400).json({ error: "A valid calendar date is required." });
    return;
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.ownerId, res.locals.userId as string),
        eq(activitiesTable.scheduledDate, parsed.data.date),
      ),
    )
    .orderBy(asc(activitiesTable.startTime), asc(activitiesTable.id));

  res.json(ListActivitiesResponse.parse(activities));
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
      note: parsed.data.note ?? null,
    })
    .returning();

  res.status(201).json(CreateActivityResponse.parse(activity));
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
    ...(parsed.data.note !== undefined && { note: parsed.data.note }),
  };

  if (Object.keys(updateValues).length === 0) {
    res.status(400).json({ error: "No activity changes were provided." });
    return;
  }

  const [activity] = await db
    .update(activitiesTable)
    .set(updateValues)
    .where(
      and(
        eq(activitiesTable.id, params.data.id),
        eq(activitiesTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning();

  if (!activity) {
    res.status(404).json({ error: "Activity not found." });
    return;
  }

  res.json(UpdateActivityResponse.parse(activity));
});

router.delete("/activities/:id", async (req, res): Promise<void> => {
  const params = DeleteActivityParams.safeParse(req.params);

  if (!params.success) {
    res.status(400).json({ error: "A valid activity is required." });
    return;
  }

  const [activity] = await db
    .delete(activitiesTable)
    .where(
      and(
        eq(activitiesTable.id, params.data.id),
        eq(activitiesTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: activitiesTable.id });

  if (!activity) {
    res.status(404).json({ error: "Activity not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;