import type { TaskRecurrence } from "@workspace/db";

export const INVALID_RECURRENCE = Symbol("invalid recurrence");

export function normalizeRecurrence(value: unknown): TaskRecurrence | null | undefined | typeof INVALID_RECURRENCE {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object") return INVALID_RECURRENCE;

  const candidate = value as { type?: unknown; intervalDays?: unknown };
  if (candidate.type === "daily") return { type: "daily" };
  if (
    candidate.type === "interval"
    && typeof candidate.intervalDays === "number"
    && Number.isInteger(candidate.intervalDays)
    && candidate.intervalDays >= 1
  ) {
    return { type: "interval", intervalDays: candidate.intervalDays };
  }

  return INVALID_RECURRENCE;
}

export function sameRecurrence(first: TaskRecurrence | null | undefined, second: TaskRecurrence | null | undefined) {
  if (!first || !second) return first === second;
  if (first.type !== second.type) return false;
  if (first.type === "daily") return true;
  return second.type === "interval" && first.intervalDays === second.intervalDays;
}

export function nextOccurrenceAfter(plannedOccurrence: Date, recurrence: TaskRecurrence, now: Date) {
  const nextOccurrence = new Date(plannedOccurrence);
  const intervalDays = recurrence.type === "daily" ? 1 : recurrence.intervalDays;

  do {
    nextOccurrence.setUTCDate(nextOccurrence.getUTCDate() + intervalDays);
  } while (nextOccurrence <= now);

  return nextOccurrence;
}