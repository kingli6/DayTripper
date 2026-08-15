import { asc, and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, activityChangesTable } from "@workspace/db";
import {
  AddActivityChangeNoteBody,
  AddActivityChangeNoteResponse,
  ListActivityChangesQueryParams,
  ListActivityChangesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

function responseChange(change: typeof activityChangesTable.$inferSelect) {
  return {
    ...change,
    changedAt: change.changedAt.toISOString(),
  };
}

router.get("/activity-changes", async (req, res): Promise<void> => {
  const parsed = ListActivityChangesQueryParams.safeParse(req.query);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid change history date");
    res.status(400).json({ error: "A valid calendar date is required." });
    return;
  }

  const changes = await db
    .select()
    .from(activityChangesTable)
    .where(
      and(
        eq(activityChangesTable.ownerId, res.locals.userId as string),
        eq(activityChangesTable.scheduledDate, parsed.data.date),
      ),
    )
    .orderBy(asc(activityChangesTable.changedAt), asc(activityChangesTable.id));

  res.json(ListActivityChangesResponse.parse(changes.map(responseChange)));
});

router.post("/activity-changes", async (req, res): Promise<void> => {
  const parsed = AddActivityChangeNoteBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid change review note");
    res.status(400).json({ error: "Please add a short note before saving." });
    return;
  }

  const [change] = await db
    .insert(activityChangesTable)
    .values({
      ownerId: res.locals.userId as string,
      activityId: null,
      scheduledDate: parsed.data.scheduledDate,
      activityTitle: null,
      changeType: "review_note",
      previousTitle: null,
      nextTitle: null,
      previousStartTime: null,
      nextStartTime: null,
      previousEndTime: null,
      nextEndTime: null,
      note: parsed.data.note.trim(),
      source: "manual",
    })
    .returning();

  res.status(201).json(AddActivityChangeNoteResponse.parse(responseChange(change)));
});

export default router;