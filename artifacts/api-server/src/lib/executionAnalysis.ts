export type ExecutionAnalysisStatus = "active" | "completed" | "stopped";

export type ExecutionAnalysisSession = {
  id: number;
  taskId: number;
  startedAt: Date | string | number;
  endedAt: Date | string | number | null;
  plannedMinutes: number;
  status: ExecutionAnalysisStatus;
};

export type ExecutionAnalysisTask = {
  estimatedMinutes: number;
} | null;

export type ExecutionOutcome = {
  sessionId: number;
  taskId: number;
  plannedMinutes: number;
  actualMinutes: number;
  durationDifferenceMinutes: number;
  durationRatio: number;
  status: "completed" | "stopped";
  endedEarly: boolean;
  ranLong: boolean;
  taskEstimatedMinutes: number | null;
};

export type CandidateObservation = {
  dimension: "time_estimation" | "session_completion";
  finding: string;
  evidenceCount: number;
  confidence: number;
  source: "execution-analysis";
};

export type ExecutionAnalysisSignals = {
  completedCount: number;
  stoppedCount: number;
  earlyCount: number;
  overrunCount: number;
  averagePlannedMinutes: number;
  averageActualMinutes: number;
  averageDurationRatio: number;
};

export type ExecutionAnalysisResult = {
  analyzedSessions: number;
  signals: ExecutionAnalysisSignals;
  candidateObservations: CandidateObservation[];
  limitations: string[];
};

type AnalysisRecord = {
  session: ExecutionAnalysisSession;
  task?: ExecutionAnalysisTask;
};

function round(value: number, decimalPlaces = 2): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

function validDate(value: Date | string | number | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function validPlannedMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 1440;
}

export function analyzeExecutionOutcome(
  session: ExecutionAnalysisSession,
  task: ExecutionAnalysisTask = null,
): ExecutionOutcome | null {
  if ((session.status !== "completed" && session.status !== "stopped")
    || !validPlannedMinutes(session.plannedMinutes)) {
    return null;
  }

  const startedAt = validDate(session.startedAt);
  const endedAt = validDate(session.endedAt);
  if (!startedAt || !endedAt) return null;

  const elapsedMilliseconds = endedAt.getTime() - startedAt.getTime();
  if (elapsedMilliseconds < 0 || !Number.isFinite(elapsedMilliseconds)) {
    return null;
  }

  const actualMinutes = round(elapsedMilliseconds / 60_000);
  const durationDifferenceMinutes = round(actualMinutes - session.plannedMinutes);
  const durationRatio = round(actualMinutes / session.plannedMinutes);

  return {
    sessionId: session.id,
    taskId: session.taskId,
    plannedMinutes: session.plannedMinutes,
    actualMinutes,
    durationDifferenceMinutes,
    durationRatio,
    status: session.status,
    endedEarly: elapsedMilliseconds < session.plannedMinutes * 60_000,
    ranLong: elapsedMilliseconds > session.plannedMinutes * 60_000,
    taskEstimatedMinutes: task && Number.isInteger(task.estimatedMinutes) && task.estimatedMinutes > 0
      ? task.estimatedMinutes
      : null,
  };
}

function significantlyEarly(outcome: ExecutionOutcome): boolean {
  return outcome.endedEarly
    && outcome.durationDifferenceMinutes <= -5
    && outcome.durationRatio <= 0.75;
}

function significantlyLong(outcome: ExecutionOutcome): boolean {
  return outcome.ranLong
    && outcome.durationDifferenceMinutes >= 5
    && outcome.durationRatio >= 1.25;
}

function confidence(evidenceCount: number, supportRate: number): number {
  return round(Math.min(0.9, 0.55 + Math.min(evidenceCount, 8) * 0.04 + Math.max(0, supportRate - 0.6) * 0.2));
}

function candidate(
  dimension: CandidateObservation["dimension"],
  finding: string,
  evidenceCount: number,
  supportRate: number,
): CandidateObservation {
  return {
    dimension,
    finding,
    evidenceCount,
    confidence: confidence(evidenceCount, supportRate),
    source: "execution-analysis",
  };
}

function durationBand(estimatedMinutes: number): "short" | "medium" | "long" {
  if (estimatedMinutes <= 30) return "short";
  if (estimatedMinutes <= 90) return "medium";
  return "long";
}

function bandLabel(band: "short" | "medium" | "long"): string {
  if (band === "short") return "30 minutes or less";
  if (band === "medium") return "31–90 minutes";
  return "more than 90 minutes";
}

function repeatedCandidate(
  outcomes: ExecutionOutcome[],
  predicate: (outcome: ExecutionOutcome) => boolean,
): { evidenceCount: number; supportRate: number } | null {
  const matching = outcomes.filter(predicate);
  if (matching.length < 3) return null;
  return {
    evidenceCount: matching.length,
    supportRate: matching.length / outcomes.length,
  };
}

export function analyzeExecutionHistory(records: AnalysisRecord[]): ExecutionAnalysisResult {
  const outcomes = records
    .map(({ session, task }) => analyzeExecutionOutcome(session, task))
    .filter((outcome): outcome is ExecutionOutcome => outcome !== null);

  const completedCount = outcomes.filter((outcome) => outcome.status === "completed").length;
  const stoppedCount = outcomes.filter((outcome) => outcome.status === "stopped").length;
  const earlyCount = outcomes.filter((outcome) => outcome.endedEarly).length;
  const overrunCount = outcomes.filter((outcome) => outcome.ranLong).length;
  const totalPlanned = outcomes.reduce((sum, outcome) => sum + outcome.plannedMinutes, 0);
  const totalActual = outcomes.reduce((sum, outcome) => sum + outcome.actualMinutes, 0);
  const totalRatio = outcomes.reduce((sum, outcome) => sum + outcome.durationRatio, 0);

  const candidateObservations: CandidateObservation[] = [];
  const earlyPattern = repeatedCandidate(outcomes, significantlyEarly);
  if (earlyPattern && earlyPattern.supportRate >= 0.6) {
    candidateObservations.push(candidate(
      "time_estimation",
      "Sessions have repeatedly ended at least 5 minutes and 25% earlier than planned.",
      earlyPattern.evidenceCount,
      earlyPattern.supportRate,
    ));
  }

  const longPattern = repeatedCandidate(outcomes, significantlyLong);
  if (longPattern && longPattern.supportRate >= 0.6) {
    candidateObservations.push(candidate(
      "time_estimation",
      "Sessions have repeatedly run at least 5 minutes and 25% longer than planned.",
      longPattern.evidenceCount,
      longPattern.supportRate,
    ));
  }

  const bandGroups = new Map<"short" | "medium" | "long", ExecutionOutcome[]>();
  for (const outcome of outcomes) {
    if (outcome.status !== "stopped" || outcome.taskEstimatedMinutes === null) continue;
    const band = durationBand(outcome.taskEstimatedMinutes);
    const group = bandGroups.get(band) ?? [];
    group.push(outcome);
    bandGroups.set(band, group);
  }

  for (const [band, bandOutcomes] of bandGroups) {
    const earlyStops = bandOutcomes.filter(significantlyEarly);
    if (bandOutcomes.length < 3 || earlyStops.length / bandOutcomes.length < 0.6) continue;
    candidateObservations.push(candidate(
      "session_completion",
      `Stopped sessions for tasks estimated at ${bandLabel(band)} have repeatedly ended early.`,
      earlyStops.length,
      earlyStops.length / bandOutcomes.length,
    ));
  }

  return {
    analyzedSessions: outcomes.length,
    signals: {
      completedCount,
      stoppedCount,
      earlyCount,
      overrunCount,
      averagePlannedMinutes: outcomes.length ? round(totalPlanned / outcomes.length) : 0,
      averageActualMinutes: outcomes.length ? round(totalActual / outcomes.length) : 0,
      averageDurationRatio: outcomes.length ? round(totalRatio / outcomes.length) : 0,
    },
    candidateObservations,
    limitations: [
      "Active sessions and sessions with invalid or missing timestamps are excluded.",
      "Execution state at session start is not stored, so state-associated patterns are not inferred.",
      "Candidate observations are returned for review only and are not persisted or applied automatically.",
    ],
  };
}