import test from "node:test";
import assert from "node:assert/strict";
import {
  INVALID_RECURRENCE,
  nextOccurrenceAfter,
  normalizeRecurrence,
  sameRecurrence,
} from "./taskRecurrence.ts";

test("daily recurrence advances from the planned occurrence", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-08T10:00:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, { type: "daily" }, completed).toISOString(),
    "2026-09-09T09:00:00.000Z",
  );
});

test("every-four-days recurrence uses the planned anchor, not completion time", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-08T10:00:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, { type: "interval", intervalDays: 4 }, completed).toISOString(),
    "2026-09-11T09:00:00.000Z",
  );
});

test("missed occurrences are skipped without creating a backlog", () => {
  const planned = new Date("2026-09-07T09:00:00.000Z");
  const completed = new Date("2026-09-20T10:00:00.000Z");

  assert.equal(
    nextOccurrenceAfter(planned, { type: "interval", intervalDays: 4 }, completed).toISOString(),
    "2026-09-23T09:00:00.000Z",
  );
});

test("recurrence input accepts the MVP rules and rejects invalid intervals", () => {
  assert.deepEqual(normalizeRecurrence(null), null);
  assert.deepEqual(normalizeRecurrence({ type: "daily" }), { type: "daily" });
  assert.deepEqual(normalizeRecurrence({ type: "interval", intervalDays: 4 }), { type: "interval", intervalDays: 4 });
  assert.equal(normalizeRecurrence({ type: "interval", intervalDays: 1.5 }), INVALID_RECURRENCE);
  assert.equal(normalizeRecurrence({ type: "weekly" }), INVALID_RECURRENCE);
  assert.equal(sameRecurrence({ type: "interval", intervalDays: 4 }, { type: "interval", intervalDays: 4 }), true);
  assert.equal(sameRecurrence({ type: "interval", intervalDays: 4 }, { type: "interval", intervalDays: 5 }), false);
});