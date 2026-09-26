export type ExecutionCompletionTask = {
  status: string;
  repeatIntervalMinutes: number | null;
  nextOccurrenceAt: Date | null;
};

export type ExecutionCompletionDecision =
  | "ready"
  | "ended"
  | "task-missing"
  | "conflict";

export function executionSessionStatusDecision(status: string): ExecutionCompletionDecision {
  return status === "active" ? "ready" : "ended";
}

export function executionTaskCompletionDecision(
  task: ExecutionCompletionTask | undefined,
  expectedNextOccurrenceAt: Date | null | undefined,
  requireOpenTask: boolean,
): ExecutionCompletionDecision {
  if (!task || (requireOpenTask && task.status !== "inbox" && task.status !== "active")) {
    return "task-missing";
  }
  if (
    task.repeatIntervalMinutes !== null
    && (
      !expectedNextOccurrenceAt
      || !task.nextOccurrenceAt
      || task.nextOccurrenceAt.getTime() !== expectedNextOccurrenceAt.getTime()
    )
  ) {
    return "conflict";
  }
  return "ready";
}