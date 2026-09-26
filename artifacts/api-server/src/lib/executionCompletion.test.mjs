import test from "node:test";
import assert from "node:assert/strict";
import {
  executionSessionStatusDecision,
  executionTaskCompletionDecision,
} from "./executionCompletionRules.ts";

const occurrence = new Date("2026-09-09T10:00:00.000Z");
const oneOffTask = {
  status: "active",
  repeatIntervalMinutes: null,
  nextOccurrenceAt: null,
};
const recurringTask = {
  status: "active",
  repeatIntervalMinutes: 60,
  nextOccurrenceAt: occurrence,
};

test("active one-off tasks are eligible for atomic completion", () => {
  assert.equal(executionTaskCompletionDecision(oneOffTask, null, true), "ready");
});

test("recurring tasks are eligible only for their anchored occurrence", () => {
  assert.equal(executionTaskCompletionDecision(recurringTask, occurrence, true), "ready");
  assert.equal(
    executionTaskCompletionDecision(recurringTask, new Date("2026-09-09T09:00:00.000Z"), true),
    "conflict",
  );
});

test("terminal sessions and non-completable tasks are rejected before mutation", () => {
  assert.equal(executionSessionStatusDecision("stopped"), "ended");
  assert.equal(executionSessionStatusDecision("completed"), "ended");
  assert.equal(
    executionTaskCompletionDecision({ ...oneOffTask, status: "completed" }, null, true),
    "task-missing",
  );
});