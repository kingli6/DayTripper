import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, tasksTable } from "@workspace/db";
import {
  ArchiveTaskParams,
  CompleteTaskParams,
  CompleteTaskResponse,
  CreateTaskBody,
  CreateTaskResponse,
  ListTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

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