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

test('requires enough time to record a non-zero tenth of a minute', () => {
  assert.equal(canSubmitStopwatch(2_999), false);
  assert.equal(canSubmitStopwatch(3_000), true);
  assert.equal(stopwatchMinutes(2_999), 0);
  assert.equal(stopwatchMinutes(3_000), 0.1);
});

test('synchronously rejects duplicate submission claims', () => {
  const guard = { current: false };

  assert.equal(claimStopwatchSubmission(guard), true);
  assert.equal(claimStopwatchSubmission(guard), false);

  guard.current = false;
  assert.equal(claimStopwatchSubmission(guard), true);
});