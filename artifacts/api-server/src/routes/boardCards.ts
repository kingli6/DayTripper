import { and, asc, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { boardCardsTable, db } from "@workspace/db";
import {
  ArchiveBoardCardParams,
  CreateBoardCardBody,
  CreateBoardCardResponse,
  ListBoardCardsResponse,
  UpdateBoardCardBody,
  UpdateBoardCardParams,
  UpdateBoardCardResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

function toApiCard(card: typeof boardCardsTable.$inferSelect) {
  return {
    ...card,
    deadline: card.deadline?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    archivedAt: card.archivedAt?.toISOString() ?? null,
  };
}

router.get("/board-cards", async (_req, res): Promise<void> => {
  const cards = await db
    .select()
    .from(boardCardsTable)
    .where(and(eq(boardCardsTable.ownerId, res.locals.userId as string), isNull(boardCardsTable.archivedAt)))
    .orderBy(asc(boardCardsTable.category), asc(boardCardsTable.position), asc(boardCardsTable.id));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListBoardCardsResponse.parse(cards.map(toApiCard)));
});

router.post("/board-cards", async (req, res): Promise<void> => {
  const parsed = CreateBoardCardBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid Board card input");
    res.status(400).json({ error: "Please check the Board card details." });
    return;
  }

  const [card] = await db.insert(boardCardsTable).values({
    ownerId: res.locals.userId as string,
    title: parsed.data.title.trim(),
    category: parsed.data.category,
    note: parsed.data.note ?? null,
    priority: parsed.data.priority ?? 3,
    estimatedDurationMinutes: parsed.data.estimatedDurationMinutes ?? null,
    deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
    position: parsed.data.position ?? 0,
  }).returning();

  res.status(201).json(CreateBoardCardResponse.parse(toApiCard(card)));
});

router.patch("/board-cards/:id", async (req, res): Promise<void> => {
  const params = UpdateBoardCardParams.safeParse(req.params);
  const parsed = UpdateBoardCardBody.safeParse(req.body);
  if (!params.success) {
    req.log.warn({ errors: params.error.flatten() }, "Invalid Board card update");
    res.status(400).json({ error: "Please check the Board card changes." });
    return;
  }
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.flatten() }, "Invalid Board card update");
    res.status(400).json({ error: "Please check the Board card changes." });
    return;
  }

  const expected = parsed.data.expectedUpdatedAt ? new Date(parsed.data.expectedUpdatedAt) : undefined;
  if (expected && Number.isNaN(expected.getTime())) {
    res.status(400).json({ error: "A valid Board card version is required." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(boardCardsTable).where(and(
      eq(boardCardsTable.id, params.data.id),
      eq(boardCardsTable.ownerId, res.locals.userId as string),
      isNull(boardCardsTable.archivedAt),
    )).limit(1);
    if (!before) return { kind: "missing" as const };
    if (expected && before.updatedAt.getTime() !== expected.getTime()) return { kind: "conflict" as const };

    const { expectedUpdatedAt: _expectedUpdatedAt, deadline, ...data } = parsed.data;
    const [updated] = await tx.update(boardCardsTable).set({
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
    }).where(and(eq(boardCardsTable.id, params.data.id), eq(boardCardsTable.ownerId, res.locals.userId as string))).returning();
    return updated ? { kind: "updated" as const, card: updated } : { kind: "missing" as const };
  });

  if (result.kind === "missing") {
    res.status(404).json({ error: "Board card not found." });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "This Board card changed elsewhere. Reload it before saving." });
    return;
  }
  res.json(UpdateBoardCardResponse.parse(toApiCard(result.card)));
});

router.delete("/board-cards/:id", async (req, res): Promise<void> => {
  const parsed = ArchiveBoardCardParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid Board card is required." });
    return;
  }

  const [archived] = await db.update(boardCardsTable).set({ archivedAt: new Date() }).where(and(
    eq(boardCardsTable.id, parsed.data.id),
    eq(boardCardsTable.ownerId, res.locals.userId as string),
    isNull(boardCardsTable.archivedAt),
  )).returning({ id: boardCardsTable.id });
  if (!archived) {
    res.status(404).json({ error: "Board card not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;