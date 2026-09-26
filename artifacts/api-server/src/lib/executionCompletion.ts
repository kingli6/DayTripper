import { and, eq } from "drizzle-orm";
import { executionSessionsTable, tasksTable } from "@workspace/db/schema";
import type { db } from "@workspace/db";
import { completeTaskInTransaction } from "./taskCompletion";
import { executionSessionStatusDecision } from "./executionCompletionRules";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CompleteExecutionSessionInTransactionResult =
  | { kind: "missing" }
  | { kind: "ended" }
  | { kind: "task-missing" }
  | { kind: "conflict" }
  | { kind: "completed"; session: typeof executionSessionsTable.$inferSelect };

export async function completeExecutionSessionInTransaction(
  tx: DbTransaction,
  { sessionId, ownerId }: { sessionId: number; ownerId: string },
): Promise<CompleteExecutionSessionInTransactionResult> {
  const [session] = await tx
    .select()
    .from(executionSessionsTable)
    .where(and(
      eq(executionSessionsTable.id, sessionId),
      eq(executionSessionsTable.ownerId, ownerId),
    ))
    .for("update")
    .limit(1);

  if (!session) return { kind: "missing" };
  if (executionSessionStatusDecision(session.status) === "ended") {
    return { kind: "ended" };
  }

  const taskResult = await completeTaskInTransaction(tx, {
    taskId: session.taskId,
    ownerId,
    expectedNextOccurrenceAt: session.expectedNextOccurrenceAt,
    requireOpenTask: true,
  });
  if (taskResult.kind === "missing") return { kind: "task-missing" };
  if (taskResult.kind === "conflict") return { kind: "conflict" };

  const [completedSession] = await tx
    .update(executionSessionsTable)
    .set({ endedAt: new Date(), status: "completed" })
    .where(and(
      eq(executionSessionsTable.id, sessionId),
      eq(executionSessionsTable.ownerId, ownerId),
      eq(executionSessionsTable.status, "active"),
    ))
    .returning();

  if (!completedSession) {
    throw new Error("Execution session completion lost its active claim.");
  }
  return { kind: "completed", session: completedSession };
}