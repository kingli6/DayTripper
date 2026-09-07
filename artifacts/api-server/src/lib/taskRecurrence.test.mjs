import test from "node:test";
import assert from "node:assert/strict";
import {
  INVALID_REPEAT_INTERVAL,
  nextOccurrenceAfter,
  normalizeRepeatInterval,
  sameRepeatInterval,
} from "./taskRecurrence.ts";

test("minute recurrence advances from the planned occurrence", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-07T10:00:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, 60, completed).toISOString(),
    "2026-09-07T11:00:00.000Z",
  );
});

test("minute recurrence uses the planned anchor, not completion time", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-07T10:15:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, 360, completed).toISOString(),
    "2026-09-07T15:00:00.000Z",
  );
});

test("missed occurrences are skipped without creating a backlog", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-08T10:00:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, 60, completed).toISOString(),
    "2026-09-08T11:00:00.000Z",
  );
});

test("repeat interval input accepts positive integers and rejects invalid values", () => {
  assert.equal(normalizeRepeatInterval(null), null);
  assert.equal(normalizeRepeatInterval(90), 90);
  assert.equal(normalizeRepeatInterval(1.5), INVALID_REPEAT_INTERVAL);
  assert.equal(normalizeRepeatInterval(0), INVALID_REPEAT_INTERVAL);
  assert.equal(normalizeRepeatInterval(2_147_483_648), INVALID_REPEAT_INTERVAL);
  assert.equal(sameRepeatInterval(90, 90), true);
  assert.equal(sameRepeatInterval(90, 120), false);
});