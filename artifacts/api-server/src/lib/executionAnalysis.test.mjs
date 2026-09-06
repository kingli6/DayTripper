import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeExecutionHistory,
  analyzeExecutionOutcome,
} from "./executionAnalysis.ts";

function session(overrides = {}) {
  return {
    id: 1,
    taskId: 10,
    startedAt: "2026-09-06T10:00:00.000Z",
    endedAt: "2026-09-06T10:13:00.000Z",
    plannedMinutes: 20,
    status: "stopped",
    ...overrides,
  };
}

test("calculates a stopped session outcome from persisted timestamps", () => {
  assert.deepEqual(analyzeExecutionOutcome(session(), { estimatedMinutes: 30 }), {
    sessionId: 1,
    taskId: 10,
    plannedMinutes: 20,
    actualMinutes: 13,
    durationDifferenceMinutes: -7,
    durationRatio: 0.65,
    status: "stopped",
    endedEarly: true,
    ranLong: false,
    taskEstimatedMinutes: 30,
  });
});

test("calculates a completed session that runs beyond its plan", () => {
  const outcome = analyzeExecutionOutcome(session({
    status: "completed",
    endedAt: "2026-09-06T10:20:01.000Z",
  }));
  assert.equal(outcome.actualMinutes, 20.02);
  assert.equal(outcome.durationDifferenceMinutes, 0.02);
  assert.equal(outcome.durationRatio, 1);
  assert.equal(outcome.endedEarly, false);
  assert.equal(outcome.ranLong, true);
});

test("excludes active sessions from outcomes", () => {
  assert.equal(analyzeExecutionOutcome(session({ status: "active", endedAt: null })), null);
  assert.equal(analyzeExecutionOutcome(session({ status: "unknown" })), null);
});

test("rejects missing, reversed, and invalid durations", () => {
  assert.equal(analyzeExecutionOutcome(session({ endedAt: null })), null);
  assert.equal(analyzeExecutionOutcome(session({
    startedAt: "2026-09-06T10:30:00.000Z",
  })), null);
  assert.equal(analyzeExecutionOutcome(session({ plannedMinutes: 0 })), null);
  assert.equal(analyzeExecutionOutcome(session({ plannedMinutes: -5 })), null);
});

test("exactly planned duration is neither early nor an overrun", () => {
  const outcome = analyzeExecutionOutcome(session({
    status: "completed",
    endedAt: "2026-09-06T10:20:00.000Z",
  }));
  assert.equal(outcome.endedEarly, false);
  assert.equal(outcome.ranLong, false);
  assert.equal(outcome.durationDifferenceMinutes, 0);
  assert.equal(outcome.durationRatio, 1);
});

test("weak evidence does not produce a candidate observation", () => {
  const result = analyzeExecutionHistory([
    { session: session(), task: { estimatedMinutes: 20 } },
    { session: session({ id: 2 }), task: { estimatedMinutes: 20 } },
  ]);
  assert.deepEqual(result.candidateObservations, []);
});

test("repeated early evidence produces a candidate without persisting guidance", () => {
  const result = analyzeExecutionHistory([
    { session: session({ id: 1 }), task: null },
    { session: session({ id: 2, taskId: 11 }), task: null },
    { session: session({ id: 3, taskId: 12 }), task: null },
  ]);
  assert.equal(result.candidateObservations.length, 1);
  assert.equal(result.candidateObservations[0].evidenceCount, 3);
  assert.equal(result.candidateObservations[0].source, "execution-analysis");
  assert.equal(result.candidateObservations[0].dimension, "time_estimation");
  assert.equal(result.candidateObservations[0].confidence > 0.5, true);
  assert.equal(result.candidateObservations[0].finding.includes("earlier"), true);
});

test("repeated overrun evidence produces a bounded candidate", () => {
  const result = analyzeExecutionHistory([
    { session: session({ id: 1, status: "completed", endedAt: "2026-09-06T10:30:00.000Z" }) },
    { session: session({ id: 2, status: "completed", endedAt: "2026-09-06T10:30:00.000Z" }) },
    { session: session({ id: 3, status: "completed", endedAt: "2026-09-06T10:30:00.000Z" }) },
  ]);
  assert.equal(result.candidateObservations.length, 1);
  assert.equal(result.candidateObservations[0].confidence <= 0.9, true);
  assert.equal(result.candidateObservations[0].finding.includes("longer"), true);
});

test("task-duration context can produce a repeated early-stop candidate", () => {
  const result = analyzeExecutionHistory([
    { session: session({ id: 1 }), task: { estimatedMinutes: 25 } },
    { session: session({ id: 2 }), task: { estimatedMinutes: 30 } },
    { session: session({ id: 3 }), task: { estimatedMinutes: 15 } },
  ]);
  assert.equal(result.candidateObservations.length, 2);
  assert.equal(result.candidateObservations.some((item) => item.dimension === "session_completion"), true);
});

test("analysis is deterministic and reports missing state context without inventing it", () => {
  const result = analyzeExecutionHistory([
    { session: session(), task: null },
  ]);
  assert.equal(result.signals.averageActualMinutes, 13);
  assert.equal(result.limitations.some((item) => item.includes("state at session start")), true);
});