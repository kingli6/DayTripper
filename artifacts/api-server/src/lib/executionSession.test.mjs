import test from "node:test";
import assert from "node:assert/strict";
import {
  canStartExecutionSession,
  endExecutionSessionStatus,
  expectedNextOccurrenceAtForTask,
  remainingExecutionSessionSeconds,
  validateExecutionSessionStart,
} from "./executionSession.ts";

test("valid execution session input is trimmed and preserved", () => {
  assert.deepEqual(
    validateExecutionSessionStart({
      taskId: 12,
      plannedMinutes: 20,
      firstAction: "  Test appointment creation. ",
      stoppingPoint: " Confirm whether it works. ",
    }),
    {
      taskId: 12,
      plannedMinutes: 20,
      firstAction: "Test appointment creation.",
      stoppingPoint: "Confirm whether it works.",
    },
  );
});

test("execution sessions anchor recurring tasks but not one-off tasks", () => {
  const occurrence = new Date("2026-09-09T10:00:00.000Z");
  assert.equal(
    expectedNextOccurrenceAtForTask({ repeatIntervalMinutes: null, nextOccurrenceAt: null }),
    null,
  );
  assert.equal(
    expectedNextOccurrenceAtForTask({ repeatIntervalMinutes: 60, nextOccurrenceAt: occurrence }),
    occurrence,
  );
});

test("invalid or zero-length session input is rejected", () => {
  assert.throws(() => validateExecutionSessionStart({
    taskId: 12,
    plannedMinutes: 0,
    firstAction: "Start",
    stoppingPoint: "Stop",
  }));
  assert.throws(() => validateExecutionSessionStart({
    taskId: 12,
    plannedMinutes: 20,
    firstAction: " ",
    stoppingPoint: "Stop",
  }));
});

test("only an owned inbox or active task can start, and one active session blocks duplicates", () => {
  assert.equal(canStartExecutionSession("user-1", { ownerId: "user-1", status: "inbox" }, false), true);
  assert.equal(canStartExecutionSession("user-1", { ownerId: "user-2", status: "active" }, false), false);
  assert.equal(canStartExecutionSession("user-1", { ownerId: "user-1", status: "completed" }, false), false);
  assert.equal(canStartExecutionSession("user-1", { ownerId: "user-1", status: "active" }, true), false);
  assert.equal(canStartExecutionSession("user-1", undefined, false), false);
});

test("active sessions can be completed or stopped, but terminal sessions cannot end again", () => {
  assert.equal(endExecutionSessionStatus("active", "completed"), "completed");
  assert.equal(endExecutionSessionStatus("active", "stopped"), "stopped");
  assert.throws(() => endExecutionSessionStatus("completed", "stopped"));
  assert.throws(() => endExecutionSessionStatus("stopped", "completed"));
});

test("remaining time is derived from persisted startedAt and reaches zero without auto-completing", () => {
  const startedAt = "2026-09-06T12:00:00.000Z";
  assert.equal(remainingExecutionSessionSeconds(startedAt, 20, Date.parse("2026-09-06T12:05:00.000Z")), 900);
  assert.equal(remainingExecutionSessionSeconds(startedAt, 20, Date.parse("2026-09-06T12:20:01.000Z")), 0);
});