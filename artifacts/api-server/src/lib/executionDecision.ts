import type { ExecutionPolicyResult } from "./executionPolicy";

export type ExecutionDecisionTask = {
  id: number;
  title: string;
  estimatedMinutes: number;
  status: string;
  ownerId: string;
};

export type ExecutionDecision = {
  taskId: number;
  durationMinutes: number;
  firstAction: string;
  stoppingPoint: string;
  reason: string;
};

const DECISION_KEYS = [
  "taskId",
  "durationMinutes",
  "firstAction",
  "stoppingPoint",
  "reason",
] as const;

const MAX_TEXT_LENGTH = 500;

function boundedText(value: string): string {
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`Execution decision ${field} must be a non-empty string under ${MAX_TEXT_LENGTH} characters.`);
  }
  return value.trim();
}

export function isEligibleExecutionDecisionTask(
  task: ExecutionDecisionTask,
  ownerId: string,
): boolean {
  return task.ownerId === ownerId && (task.status === "inbox" || task.status === "active");
}

export function validateExecutionDecision(value: unknown): ExecutionDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Execution decision must be one object.");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [...DECISION_KEYS].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError("Execution decision contains an unsupported structure.");
  }

  if (
    typeof record.taskId !== "number"
    || !Number.isInteger(record.taskId)
    || record.taskId < 1
  ) {
    throw new TypeError("Execution decision taskId must be a positive integer.");
  }
  if (
    typeof record.durationMinutes !== "number"
    || !Number.isInteger(record.durationMinutes)
    || record.durationMinutes < 1
    || record.durationMinutes > 1440
  ) {
    throw new TypeError("Execution decision durationMinutes must be a whole number from 1 to 1440.");
  }

  return {
    taskId: record.taskId,
    durationMinutes: record.durationMinutes,
    firstAction: requiredText(record.firstAction, "firstAction"),
    stoppingPoint: requiredText(record.stoppingPoint, "stoppingPoint"),
    reason: requiredText(record.reason, "reason"),
  };
}

export function validateExecutionDecisionForTask(
  value: unknown,
  task: ExecutionDecisionTask,
  policy: ExecutionPolicyResult,
  availableMinutes: number,
): ExecutionDecision {
  const decision = validateExecutionDecision(value);
  if (decision.taskId !== task.id) {
    throw new TypeError("Execution decision selected an unknown task.");
  }
  if (!isEligibleExecutionDecisionTask(task, task.ownerId)) {
    throw new TypeError("Execution decision selected an inactive task.");
  }
  if (
    decision.durationMinutes > availableMinutes
    || decision.durationMinutes > task.estimatedMinutes
    || decision.durationMinutes > policy.suggestedDurationMinutes
  ) {
    throw new TypeError("Execution decision duration exceeds the available policy boundary.");
  }
  if (policy.stoppingPointRequired && decision.stoppingPoint.trim().length === 0) {
    throw new TypeError("Execution decision requires a stopping point.");
  }

  return decision;
}

export function createDeterministicExecutionDecision(
  task: ExecutionDecisionTask,
  policy: ExecutionPolicyResult,
  rankingReason: string,
): ExecutionDecision {
  const durationMinutes = Math.max(
    1,
    Math.min(task.estimatedMinutes, policy.suggestedDurationMinutes),
  );
  const firstAction = policy.nextActionStyle === "self_directed_progress"
    ? `Continue with the next visible step of “${task.title}”.`
    : `Write down the smallest concrete next step for “${task.title}”, then begin it.`;
  const stoppingPoint = policy.stoppingPointRequired
    ? `Stop after ${durationMinutes} minutes or when that first step reaches a clear boundary.`
    : `Stop after the ${durationMinutes}-minute session and decide whether to continue.`;

  return validateExecutionDecision({
    taskId: task.id,
    durationMinutes,
    firstAction,
    stoppingPoint,
    reason: boundedText(`${policy.reason} ${rankingReason}`),
  });
}