import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { activitiesTable, db, journalEntriesTable } from "@workspace/db";
import {
  CreateJournalEntryBody,
  CreateJournalEntryResponse,
  DeleteJournalEntryParams,
  ListJournalEntriesQueryParams,
  ListJournalEntriesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function serializeJournalEntry(
  entry: typeof journalEntriesTable.$inferSelect,
) {
  return {
    ...entry,
    recordedAt: entry.recordedAt.toISOString(),
  };
}

router.use(requireAuth);

router.get("/journal-entries", async (req, res): Promise<void> => {
  const parsed = ListJournalEntriesQueryParams.safeParse(req.query);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid journal entry date");
    res.status(400).json({ error: "A valid calendar date is required." });
    return;
  }

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.ownerId, res.locals.userId as string),
        eq(journalEntriesTable.recordedDate, parsed.data.date),
      ),
    )
    .orderBy(desc(journalEntriesTable.recordedAt), asc(journalEntriesTable.id));

  res.json(ListJournalEntriesResponse.parse(entries.map(serializeJournalEntry)));
});

router.post("/journal-entries", async (req, res): Promise<void> => {
  const parsed = CreateJournalEntryBody.safeParse(req.body);

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid journal entry input");
    res.status(400).json({ error: "Please add a short journal entry." });
    return;
  }

  if (parsed.data.activityId !== undefined && parsed.data.activityId !== null) {
    const [linkedActivity] = await db
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.id, parsed.data.activityId),
          eq(activitiesTable.ownerId, res.locals.userId as string),
        ),
      )
      .limit(1);

    if (!linkedActivity) {
      res.status(404).json({ error: "The linked activity was not found." });
      return;
    }
  }

  const [entry] = await db
    .insert(journalEntriesTable)
    .values({
      ownerId: res.locals.userId as string,
      recordedDate: parsed.data.recordedDate,
      content: parsed.data.content,
      activityId: parsed.data.activityId ?? null,
      topic: parsed.data.topic ?? null,
      privacy: parsed.data.privacy ?? "private",
    })
    .returning();

  res
    .status(201)
    .json(CreateJournalEntryResponse.parse(serializeJournalEntry(entry)));
});

router.delete("/journal-entries/:id", async (req, res): Promise<void> => {
  const parsed = DeleteJournalEntryParams.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({ error: "A valid journal entry is required." });
    return;
  }

  const [deleted] = await db
    .delete(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.id, parsed.data.id),
        eq(journalEntriesTable.ownerId, res.locals.userId as string),
      ),
    )
    .returning({ id: journalEntriesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Journal entry not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;