export const EXECUTION_POLICY_STRATEGIES = [
  "bounded_focus",
  "energy_matched",
  "partial_progress",
  "protected_priority",
  "deep_work",
  "restart_small",
  "concrete_start",
  "steady_progress",
] as const;

export const EXECUTION_POLICY_NEXT_ACTION_STYLES = [
  "concrete_first_action",
  "partial_stopping_point",
  "priority_action",
  "energy_matched_step",
  "self_directed_progress",
] as const;

export type ExecutionPolicyStrategy = typeof EXECUTION_POLICY_STRATEGIES[number];
export type ExecutionPolicyNextActionStyle =
  typeof EXECUTION_POLICY_NEXT_ACTION_STYLES[number];
export type ExecutionPolicyStateLevel = "low" | "normal" | "high";
export type ExecutionPolicyStateContext =
  | "baseline"
  | "relaxed"
  | "normal"
  | "stressed"
  | "overloaded"
  | null;

export type ExecutionPolicyTask = {
  title: string;
  importance: number;
  urgency: number;
  energyRequired: number;
  interest: number;
  estimatedMinutes: number;
  deadline: Date | null;
};

export type ExecutionPolicyState = {
  energy: ExecutionPolicyStateLevel | null;
  stress: ExecutionPolicyStateLevel | null;
  availableMinutes: number | null;
};

export type ExecutionPolicyObservation = {
  dimension: string;
  finding: string;
  stateContext: ExecutionPolicyStateContext;
  confidence: number;
  evidenceCount: number;
};

export type ExecutionPolicyInput = {
  task: ExecutionPolicyTask;
  state: ExecutionPolicyState;
  observations: ExecutionPolicyObservation[];
};

export type ExecutionPolicyResult = {
  strategy: ExecutionPolicyStrategy;
  suggestedDurationMinutes: number;
  nextActionStyle: ExecutionPolicyNextActionStyle;
  stoppingPointRequired: boolean;
  reduceScope: boolean;
  reason: string;
};

const POSTPONEMENT_MARKERS = [
  "postpone",
  "postponed",
  "put off",
  "delay",
  "delayed",
  "avoid",
  "stall",
  "stuck",
  "hard to start",
  "procrastinat",
];

const TASK_RELEVANCE_MARKERS = [
  "task",
  "work",
  "start",
  "ambiguous",
  "open-ended",
  "open ended",
  "unclear",
  "follow-through",
  "follow through",
  "decision",
];

function hasMarker(value: string, markers: string[]): boolean {
  const normalized = value.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

function isLevel(value: unknown): value is ExecutionPolicyStateLevel {
  return value === "low" || value === "normal" || value === "high";
}

function isStateContext(value: unknown): value is ExecutionPolicyStateContext {
  return value === null
    || value === "baseline"
    || value === "relaxed"
    || value === "normal"
    || value === "stressed"
    || value === "overloaded";
}

function assertTask(task: unknown): asserts task is ExecutionPolicyTask {
  if (!task || typeof task !== "object") {
    throw new TypeError("Execution policy task is required.");
  }

  const value = task as Record<string, unknown>;
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    throw new TypeError("Execution policy task title is required.");
  }

  for (const key of ["importance", "urgency", "energyRequired", "interest"]) {
    const field = value[key];
    if (typeof field !== "number" || !Number.isInteger(field) || field < 1 || field > 5) {
      throw new TypeError(`Execution policy task ${key} must be an integer from 1 to 5.`);
    }
  }

  if (
    typeof value.estimatedMinutes !== "number"
    || !Number.isInteger(value.estimatedMinutes)
    || value.estimatedMinutes <= 0
  ) {
    throw new TypeError("Execution policy task estimatedMinutes must be a positive integer.");
  }

  if (
    value.deadline !== null
    && (!(value.deadline instanceof Date) || Number.isNaN(value.deadline.getTime()))
  ) {
    throw new TypeError("Execution policy task deadline must be a valid Date or null.");
  }
}

function assertState(state: unknown): asserts state is ExecutionPolicyState {
  if (!state || typeof state !== "object") {
    throw new TypeError("Execution policy state is required.");
  }

  const value = state as Record<string, unknown>;
  if (value.energy !== null && !isLevel(value.energy)) {
    throw new TypeError("Execution policy energy must be low, normal, high, or null.");
  }
  if (value.stress !== null && !isLevel(value.stress)) {
    throw new TypeError("Execution policy stress must be low, normal, high, or null.");
  }
  if (
    value.availableMinutes !== null
    && (
      typeof value.availableMinutes !== "number"
      || !Number.isInteger(value.availableMinutes)
      || value.availableMinutes < 0
      || value.availableMinutes > 1440
    )
  ) {
    throw new TypeError("Execution policy availableMinutes must be an integer from 0 to 1440 or null.");
  }
}

function assertObservations(observations: unknown): asserts observations is ExecutionPolicyObservation[] {
  if (!Array.isArray(observations)) {
    throw new TypeError("Execution policy observations must be an array.");
  }

  for (const observation of observations) {
    if (!observation || typeof observation !== "object") {
      throw new TypeError("Execution policy observations must contain objects.");
    }

    const value = observation as Record<string, unknown>;
    if (
      typeof value.dimension !== "string"
      || typeof value.finding !== "string"
      || !isStateContext(value.stateContext)
      || typeof value.confidence !== "number"
      || !Number.isFinite(value.confidence)
      || value.confidence < 0
      || value.confidence > 1
      || typeof value.evidenceCount !== "number"
      || !Number.isInteger(value.evidenceCount)
      || value.evidenceCount < 0
    ) {
      throw new TypeError("Execution policy observation has an invalid shape.");
    }
  }
}

export function validateExecutionPolicyInput(
  input: unknown,
): asserts input is ExecutionPolicyInput {
  if (!input || typeof input !== "object") {
    throw new TypeError("Execution policy input is required.");
  }

  const value = input as Record<string, unknown>;
  assertTask(value.task);
  assertState(value.state);
  assertObservations(value.observations);
}

export function validateExecutionPolicyResult(value: unknown): ExecutionPolicyResult {
  if (!value || typeof value !== "object") {
    throw new TypeError("Execution policy result must be an object.");
  }

  const result = value as Record<string, unknown>;
  if (
    typeof result.strategy !== "string"
    || !EXECUTION_POLICY_STRATEGIES.includes(result.strategy as ExecutionPolicyStrategy)
    || typeof result.suggestedDurationMinutes !== "number"
    || !Number.isInteger(result.suggestedDurationMinutes)
    || result.suggestedDurationMinutes < 0
    || result.suggestedDurationMinutes > 1440
    || typeof result.nextActionStyle !== "string"
    || !EXECUTION_POLICY_NEXT_ACTION_STYLES.includes(
      result.nextActionStyle as ExecutionPolicyNextActionStyle,
    )
    || typeof result.stoppingPointRequired !== "boolean"
    || typeof result.reduceScope !== "boolean"
    || typeof result.reason !== "string"
    || result.reason.trim().length === 0
  ) {
    throw new TypeError("Execution policy result has an invalid shape.");
  }

  return value as ExecutionPolicyResult;
}

function currentStateContext(state: ExecutionPolicyState): ExecutionPolicyStateContext {
  if (state.stress === "high") return "stressed";
  if (state.stress === "low") return "relaxed";
  if (state.stress === "normal") return "normal";
  return "baseline";
}

function observationStrength(observation: ExecutionPolicyObservation): number {
  return Math.min(
    1,
    Math.max(0, observation.confidence) * Math.min(3, observation.evidenceCount) / 2,
  );
}

function appliesToCurrentState(
  observation: ExecutionPolicyObservation,
  state: ExecutionPolicyState,
): boolean {
  const context = currentStateContext(state);
  return observation.stateContext === null
    || observation.stateContext === "baseline"
    || observation.stateContext === context;
}

function appliesToTask(
  observation: ExecutionPolicyObservation,
  taskIsAmbiguous: boolean,
): boolean {
  const finding = `${observation.dimension} ${observation.finding}`.toLowerCase();
  return hasMarker(finding, TASK_RELEVANCE_MARKERS)
    || (taskIsAmbiguous && hasMarker(finding, ["unclear", "ambiguous", "open-ended"]));
}

function hasRepeatedPostponementEvidence(
  observations: ExecutionPolicyObservation[],
  state: ExecutionPolicyState,
  taskIsAmbiguous: boolean,
): boolean {
  return observations.some((observation) =>
    observation.evidenceCount >= 2
    && observationStrength(observation) >= 0.5
    && appliesToCurrentState(observation, state)
    && appliesToTask(observation, taskIsAmbiguous)
    && hasMarker(observation.finding, POSTPONEMENT_MARKERS),
  );
}

function clampDuration(
  target: number,
  task: ExecutionPolicyTask,
  state: ExecutionPolicyState,
): number {
  const available = state.availableMinutes ?? target;
  return Math.max(0, Math.min(target, task.estimatedMinutes, available));
}

export function deriveExecutionPolicy(input: ExecutionPolicyInput): ExecutionPolicyResult {
  validateExecutionPolicyInput(input);

  const { task, state, observations } = input;
  const taskIsAmbiguous = hasMarker(task.title, [
    "work on",
    "deal with",
    "figure out",
    "make progress",
    "organize",
    "research",
    "prepare",
    "sort out",
  ]) || task.title.trim().split(/\s+/).length <= 2;
  const highStressAmbiguity = state.stress === "high" && taskIsAmbiguous;
  const lowEnergyMismatch = state.energy === "low" && task.energyRequired >= 4;
  const limitedTime = state.availableMinutes !== null
    && state.availableMinutes < task.estimatedMinutes;
  const protectedPriority = task.importance >= 4 && task.urgency >= 4;
  const repeatedPostponement = hasRepeatedPostponementEvidence(
    observations,
    state,
    taskIsAmbiguous,
  );
  const relaxedCapacity = (
    (state.energy === "normal" || state.energy === "high")
    && state.stress === "low"
    && (state.availableMinutes === null || state.availableMinutes >= 30)
  );

  let strategy: ExecutionPolicyStrategy = "steady_progress";
  let nextActionStyle: ExecutionPolicyNextActionStyle = "concrete_first_action";
  let targetDuration = 25;
  const reasons: string[] = [];

  if (protectedPriority) {
    strategy = "protected_priority";
    nextActionStyle = "priority_action";
    targetDuration = 30;
    reasons.push("High importance and urgency protect this task from novelty or interest bias.");
  } else if (highStressAmbiguity) {
    strategy = "bounded_focus";
    nextActionStyle = "concrete_first_action";
    targetDuration = 15;
    reasons.push("High stress and an open-ended task call for one concrete action in a short session.");
  } else if (repeatedPostponement) {
    strategy = "restart_small";
    nextActionStyle = "concrete_first_action";
    targetDuration = 20;
    reasons.push("Repeated, sufficiently supported postponement evidence favors a smaller restart.");
  } else if (limitedTime) {
    strategy = "partial_progress";
    nextActionStyle = "partial_stopping_point";
    targetDuration = state.availableMinutes ?? 0;
    reasons.push("Available time is shorter than the estimate, so this is a useful partial step, not the whole task.");
  } else if (lowEnergyMismatch) {
    strategy = "energy_matched";
    nextActionStyle = "energy_matched_step";
    targetDuration = 20;
    reasons.push("Low energy favors a lower-energy subtask where reasonable without discarding important work.");
  } else if (relaxedCapacity) {
    strategy = "deep_work";
    nextActionStyle = "self_directed_progress";
    targetDuration = 45;
    reasons.push("Low stress and sufficient capacity allow a longer, self-directed session.");
  } else if (taskIsAmbiguous) {
    strategy = "concrete_start";
    nextActionStyle = "concrete_first_action";
    targetDuration = 20;
    reasons.push("The open-ended task is converted into a bounded first action instead of generic work.");
  } else {
    reasons.push("Use a steady next step sized to the task and current capacity.");
  }

  if (highStressAmbiguity) {
    reasons.push("Set an explicit stopping point before starting.");
  }
  if (limitedTime && !reasons.some((reason) => reason.includes("partial step"))) {
    reasons.push("Set a stopping point that makes the partial boundary visible.");
  }
  if (lowEnergyMismatch && !reasons.some((reason) => reason.includes("Low energy"))) {
    reasons.push("Keep unused capacity in reserve rather than filling the available time.");
  }

  const result = {
    strategy,
    suggestedDurationMinutes: clampDuration(targetDuration, task, state),
    nextActionStyle,
    stoppingPointRequired: highStressAmbiguity || limitedTime || repeatedPostponement,
    reduceScope: (
      (taskIsAmbiguous && !relaxedCapacity)
      || lowEnergyMismatch
      || limitedTime
      || repeatedPostponement
    ),
    reason: reasons.join(" "),
  } satisfies ExecutionPolicyResult;

  return validateExecutionPolicyResult(result);
}