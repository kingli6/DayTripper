export const INVALID_REPEAT_INTERVAL = Symbol("invalid repeat interval");

export function normalizeRepeatInterval(value: unknown): number | null | undefined | typeof INVALID_REPEAT_INTERVAL {
  if (value === undefined || value === null) return value;
  if (
    typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= 2_147_483_647
  ) {
    return value;
  }

  return INVALID_REPEAT_INTERVAL;
}

export function sameRepeatInterval(first: number | null | undefined, second: number | null | undefined) {
  return first === second;
}

export function nextOccurrenceAfter(plannedOccurrence: Date, repeatIntervalMinutes: number, now: Date) {
  const nextOccurrence = new Date(plannedOccurrence);

  do {
    nextOccurrence.setUTCMinutes(nextOccurrence.getUTCMinutes() + repeatIntervalMinutes);
  } while (nextOccurrence <= now);

  return nextOccurrence;
}