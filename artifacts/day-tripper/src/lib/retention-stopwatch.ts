export const MINIMUM_STOPWATCH_DURATION_MS = 3_000;

export function elapsedStopwatchMilliseconds(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

export function formatStopwatchDuration(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function stopwatchMinutes(elapsedMs: number): number {
  return Math.round((Math.max(0, elapsedMs) / 60_000) * 10) / 10;
}

export function canSubmitStopwatch(elapsedMs: number): boolean {
  return elapsedMs >= MINIMUM_STOPWATCH_DURATION_MS;
}

export function claimStopwatchSubmission(guard: { current: boolean }): boolean {
  if (guard.current) return false;
  guard.current = true;
  return true;
}