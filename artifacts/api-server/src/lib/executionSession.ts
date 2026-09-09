export type ExecutionSessionStatus = "active" | "completed" | "stopped";

export type ExecutionSessionStartInput = {
  taskId: number;
  plannedMinutes: number;
  firstAction: string;
  stoppingPoint: string;
};

export type ExecutionSessionStartResult = {
  taskId: number;
  plannedMinutes: number;
  firstAction: string;
  stoppingPoint: string;
};

export function expectedNextOccurrenceAtForTask(task: {
  repeatIntervalMinutes: number | null;
  nextOccurrenceAt: Date | null;
}): Date | null {
  return task.repeatIntervalMinutes === null ? null : task.nextOccurrenceAt;
}

export function validateExecutionSessionStart(input: ExecutionSessionStartInput): ExecutionSessionStartResult {
  if (!Number.isInteger(input.taskId) || input.taskId < 1) {
    throw new TypeError("Task id must be a positive whole number.");
  }
  if (!Number.isInteger(input.plannedMinutes) || input.plannedMinutes < 1 || input.plannedMinutes > 1440) {
    throw new TypeError("Planned minutes must be a whole number between 1 and 1440.");
  }

  const firstAction = input.firstAction.trim();
  const stoppingPoint = input.stoppingPoint.trim();
  if (!firstAction || !stoppingPoint) {
    throw new TypeError("First action and stopping point are required.");
  }

  return {
    taskId: input.taskId,
    plannedMinutes: input.plannedMinutes,
    firstAction,
    stoppingPoint,
  };
}

export function canStartExecutionSession(
  ownerId: string,
  task: { ownerId: string; status: string } | undefined,
  hasActiveSession: boolean,
): boolean {
  return Boolean(
    task
      && task.ownerId === ownerId
      && (task.status === "inbox" || task.status === "active")
      && !hasActiveSession,
  );
}

export function endExecutionSessionStatus(
  currentStatus: ExecutionSessionStatus,
  nextStatus: "completed" | "stopped",
): ExecutionSessionStatus {
  if (currentStatus !== "active") {
    throw new TypeError("Only an active execution session can be ended.");
  }
  return nextStatus;
}

export function remainingExecutionSessionSeconds(
  startedAt: Date | string | number,
  plannedMinutes: number,
  now = Date.now(),
): number {
  const endAt = new Date(startedAt).getTime() + plannedMinutes * 60_000;
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}