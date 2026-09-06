import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveExecutionPolicy,
  validateExecutionPolicyResult,
} from "./executionPolicy.ts";

function input(overrides = {}) {
  return {
    task: {
      title: "Write the project update",
      importance: 3,
      urgency: 3,
      energyRequired: 3,
      interest: 3,
      estimatedMinutes: 60,
      deadline: null,
    },
    state: {
      energy: "normal",
      stress: "normal",
      availableMinutes: 60,
    },
    observations: [],
    ...overrides,
  };
}

test("high stress and an ambiguous task produce a short bounded session", () => {
  const result = deriveExecutionPolicy(input({
    task: { ...input().task, title: "Work on project" },
    state: { energy: "normal", stress: "high", availableMinutes: 60 },
  }));

  assert.equal(result.strategy, "bounded_focus");
  assert.equal(result.suggestedDurationMinutes, 15);
  assert.equal(result.nextActionStyle, "concrete_first_action");
  assert.equal(result.stoppingPointRequired, true);
  assert.equal(result.reduceScope, true);
});

test("low energy softens a high-energy task without rejecting it", () => {
  const result = deriveExecutionPolicy(input({
    task: { ...input().task, energyRequired: 5 },
    state: { energy: "low", stress: "normal", availableMinutes: 60 },
  }));

  assert.equal(result.strategy, "energy_matched");
  assert.equal(result.suggestedDurationMinutes, 20);
  assert.equal(result.reduceScope, true);
  assert.match(result.reason, /lower-energy subtask/);
});

test("limited time becomes an explicit partial stopping point", () => {
  const result = deriveExecutionPolicy(input({
    state: { energy: "normal", stress: "normal", availableMinutes: 20 },
  }));

  assert.equal(result.strategy, "partial_progress");
  assert.equal(result.suggestedDurationMinutes, 20);
  assert.equal(result.nextActionStyle, "partial_stopping_point");
  assert.equal(result.stoppingPointRequired, true);
  assert.equal(result.reduceScope, true);
  assert.match(result.reason, /not the whole task/);
});

test("important and urgent work is protected from interest bias", () => {
  const result = deriveExecutionPolicy(input({
    task: { ...input().task, importance: 5, urgency: 5, interest: 1 },
  }));

  assert.equal(result.strategy, "protected_priority");
  assert.equal(result.nextActionStyle, "priority_action");
  assert.match(result.reason, /novelty or interest bias/);
});

test("relaxed state with capacity allows a longer self-directed session", () => {
  const result = deriveExecutionPolicy(input({
    state: { energy: "high", stress: "low", availableMinutes: 60 },
  }));

  assert.equal(result.strategy, "deep_work");
  assert.equal(result.suggestedDurationMinutes, 45);
  assert.equal(result.nextActionStyle, "self_directed_progress");
  assert.equal(result.stoppingPointRequired, false);
  assert.equal(result.reduceScope, false);
});

test("the same task changes strategy between stressed and relaxed states", () => {
  const task = { ...input().task, title: "Work on project" };
  const stressed = deriveExecutionPolicy(input({
    task,
    state: { energy: "normal", stress: "high", availableMinutes: 60 },
  }));
  const relaxed = deriveExecutionPolicy(input({
    task,
    state: { energy: "high", stress: "low", availableMinutes: 60 },
  }));

  assert.equal(stressed.suggestedDurationMinutes, 15);
  assert.equal(relaxed.suggestedDurationMinutes, 45);
  assert.notEqual(stressed.strategy, relaxed.strategy);
  assert.equal(relaxed.stoppingPointRequired, false);
});

test("strong repeated postponement evidence favors a smaller restart", () => {
  const result = deriveExecutionPolicy(input({
    task: { ...input().task, title: "Write the project update" },
    observations: [{
      dimension: "follow_through",
      finding: "This type of task is repeatedly postponed when the first step is unclear.",
      stateContext: "normal",
      confidence: 0.8,
      evidenceCount: 3,
    }],
  }));

  assert.equal(result.strategy, "restart_small");
  assert.equal(result.suggestedDurationMinutes, 20);
  assert.equal(result.reduceScope, true);
  assert.match(result.reason, /postponement evidence/);
});

test("weak evidence does not override a deterministic low-energy rule", () => {
  const result = deriveExecutionPolicy(input({
    task: { ...input().task, energyRequired: 5 },
    state: { energy: "low", stress: "normal", availableMinutes: 60 },
    observations: [{
      dimension: "follow_through",
      finding: "The user may postpone some work.",
      stateContext: "normal",
      confidence: 0.2,
      evidenceCount: 1,
    }],
  }));

  assert.equal(result.strategy, "energy_matched");
  assert.equal(result.suggestedDurationMinutes, 20);
});

test("the result validator rejects unsupported policy output", () => {
  assert.throws(
    () => validateExecutionPolicyResult({
      strategy: "unknown",
      suggestedDurationMinutes: 15,
      nextActionStyle: "concrete_first_action",
      stoppingPointRequired: true,
      reduceScope: true,
      reason: "test",
    }),
    /invalid shape/,
  );
});