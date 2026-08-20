import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  canSubmitStopwatch,
  claimStopwatchSubmission,
  elapsedStopwatchMilliseconds,
  formatStopwatchDuration,
  stopwatchMinutes,
} from './retention-stopwatch.ts';

test('calculates elapsed time from timestamps and formats the display', () => {
  const elapsed = elapsedStopwatchMilliseconds(10_000, 1_072_000);

  assert.equal(elapsed, 1_062_000);
  assert.equal(formatStopwatchDuration(elapsed), '17:42');
});

test('rounds elapsed time to one decimal minute', () => {
  assert.equal(stopwatchMinutes(1_062_000), 17.7);
});

test('requires at least one second before submission', () => {
  assert.equal(canSubmitStopwatch(999), false);
  assert.equal(canSubmitStopwatch(1_000), true);
});

test('synchronously rejects duplicate submission claims', () => {
  const guard = { current: false };

  assert.equal(claimStopwatchSubmission(guard), true);
  assert.equal(claimStopwatchSubmission(guard), false);

  guard.current = false;
  assert.equal(claimStopwatchSubmission(guard), true);
});