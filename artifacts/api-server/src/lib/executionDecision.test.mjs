import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeterministicExecutionDecision,
  isEligibleExecutionDecisionTask,
  validateExecutionDecision,
  validateExecutionDecisionForTask,
} from "./executionDecision.ts";

const task = (overrides = {}) => ({
  id: 7,
  title: "Write the project update",
  estimatedMinutes: 60,
  status: "active",
  ownerId: "user-1",
  ...overrides,
});

const policy = (overrides = {}) => ({
  strategy: "bounded_focus",
  suggestedDurationMinutes: 20,
  nextActionStyle: "concrete_first_action",
  stoppingPointRequired: true,
  reduceScope: true,
  reason: "A bounded start makes progress easier.",
  ...overrides,
});

test("only owned inbox and active tasks are eligible", () => {
  assert.equal(isEligibleExecutionDecisionTask(task(), "user-1"), true);
  assert.equal(isEligibleExecutionDecisionTask(task({ status: "completed" }), "user-1"), false);
  assert.equal(isEligibleExecutionDecisionTask(task({ ownerId: "another-user" }), "user-1"), false);
});

test("one decision must be an exact object, not an array or extra structure", () => {
  assert.throws(
    () => validateExecutionDecision([{
      taskId: 7,
      durationMinutes: 20,
      firstAction: "Start",
      stoppingPoint: "Stop",
      reason: "Reason",
    }]),
    /one object/,
  );
  assert.throws(
    () => validateExecutionDecision({
      taskId: 7,
      durationMinutes: 20,
      firstAction: "Start",
      stoppingPoint: "Stop",
      reason: "Reason",
      alternatives: [],
    }),
    /unsupported structure/,
  );
});

test("a provider decision cannot exceed available time, estimate, or policy duration", () => {
  assert.throws(
    () => validateExecutionDecisionForTask({
      taskId: 7,
      durationMinutes: 21,
      firstAction: "Start",
      stoppingPoint: "Stop at the boundary",
      reason: "Reason",
    }, task(), policy(), 30),
    /policy boundary/,
  );
  assert.throws(
    () => validateExecutionDecisionForTask({
      taskId: 7,
      durationMinutes: 20,
      firstAction: "Start",
      stoppingPoint: "Stop at the boundary",
      reason: "Reason",
    }, task({ estimatedMinutes: 10 }), policy(), 30),
    /policy boundary/,
  );
});

test("deterministic fallback always supplies a bounded duration and stopping point", () => {
  const decision = createDeterministicExecutionDecision(
    task({ estimatedMinutes: 10 }),
    policy({ suggestedDurationMinutes: 20 }),
    "It is important and timely.",
  );

  assert.equal(decision.taskId, 7);
  assert.equal(decision.durationMinutes, 10);
  assert.match(decision.firstAction, /smallest concrete next step/);
  assert.match(decision.stoppingPoint, /10 minutes/);
  assert.match(decision.reason, /important and timely/);
});

test("malformed or blank decision fields are rejected", () => {
  assert.throws(
    () => validateExecutionDecision({
      taskId: 7,
      durationMinutes: 20,
      firstAction: "",
      stoppingPoint: "Stop",
      reason: "Reason",
    }),
    /firstAction/,
  );
  assert.throws(
    () => validateExecutionDecision({
      taskId: 7,
      durationMinutes: 20.5,
      firstAction: "Start",
      stoppingPoint: "Stop",
      reason: "Reason",
    }),
    /whole number/,
  );
});