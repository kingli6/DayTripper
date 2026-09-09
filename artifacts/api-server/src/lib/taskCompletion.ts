import { and, eq, inArray, ne } from "drizzle-orm";
import { tasksTable } from "@workspace/db/schema";
import type { db } from "@workspace/db";
import { nextOccurrenceAfter } from "./taskRecurrence";
import { executionTaskCompletionDecision } from "./executionCompletionRules";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CompleteTaskInTransactionResult =
  | { kind: "missing" }
  | { kind: "conflict" }
  | { kind: "completed"; task: typeof tasksTable.$inferSelect }
  | { kind: "advanced"; task: typeof tasksTable.$inferSelect };

export async function completeTaskInTransaction(
  tx: DbTransaction,
  {
    taskId,
    ownerId,
    expectedNextOccurrenceAt,
    requireOpenTask = false,
  }: {
    taskId: number;
    ownerId: string;
    expectedNextOccurrenceAt?: Date | null;
    requireOpenTask?: boolean;
  },
): Promise<CompleteTaskInTransactionResult> {
  const taskStatusCondition = requireOpenTask
    ? inArray(tasksTable.status, ["inbox", "active"])
    : ne(tasksTable.status, "archived");
  const [currentTask] = await tx
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.id, taskId),
      eq(tasksTable.ownerId, ownerId),
      taskStatusCondition,
    ))
    .limit(1);

  const decision = executionTaskCompletionDecision(
    currentTask,
    expectedNextOccurrenceAt,
    requireOpenTask,
  );
  if (decision === "task-missing") return { kind: "missing" };
  if (decision === "conflict") return { kind: "conflict" };

  if (currentTask.repeatIntervalMinutes !== null) {
    const currentOccurrenceAt = currentTask.nextOccurrenceAt;
    const expectedOccurrenceAt = expectedNextOccurrenceAt;
    if (
      !currentOccurrenceAt
      || !expectedOccurrenceAt
      || currentOccurrenceAt.getTime() !== expectedOccurrenceAt.getTime()
    ) {
      return { kind: "conflict" };
    }
    const nextOccurrenceAt = nextOccurrenceAfter(
      currentOccurrenceAt,
      currentTask.repeatIntervalMinutes,
      new Date(),
    );
    const [advancedTask] = await tx
      .update(tasksTable)
      .set({ nextOccurrenceAt })
      .where(and(
        eq(tasksTable.id, taskId),
        eq(tasksTable.ownerId, ownerId),
        taskStatusCondition,
        eq(tasksTable.nextOccurrenceAt, expectedOccurrenceAt),
      ))
      .returning();

    return advancedTask
      ? { kind: "advanced", task: advancedTask }
      : { kind: "conflict" };
  }

  const [completedTask] = await tx
    .update(tasksTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(
      eq(tasksTable.id, taskId),
      eq(tasksTable.ownerId, ownerId),
      taskStatusCondition,
    ))
    .returning();

  return completedTask
    ? { kind: "completed", task: completedTask }
    : { kind: "missing" };
}