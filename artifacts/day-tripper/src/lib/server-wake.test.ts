import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyHealthFailure,
  createHealthProbeController,
} from './server-wake-core.ts';

test('concurrent wake callers share one health request', async () => {
  let requestCount = 0;
  let resolveRequest!: () => void;
  const request = () => {
    requestCount += 1;
    return new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });
  };
  const controller = createHealthProbeController({ request });

  const first = controller.probe(true);
  const second = controller.probe(true);
  assert.strictEqual(first, second);
  assert.equal(requestCount, 1);

  resolveRequest();
  assert.deepEqual(await first, { ok: true, state: 'ready' });
});

test('health failure classification never treats authentication as sleeping', () => {
  assert.equal(classifyHealthFailure(401), 'auth-error');
  assert.equal(classifyHealthFailure(403), 'auth-error');
  assert.equal(classifyHealthFailure(500), 'error');
  assert.equal(classifyHealthFailure(undefined), 'sleeping');
});

test('a successful health response returns the controller to ready', async () => {
  const controller = createHealthProbeController({
    request: async () => undefined,
  });

  assert.deepEqual(await controller.probe(true), { ok: true, state: 'ready' });
});

test('a bounded no-response probe is classified as sleeping and can be retried', async () => {
  let requestCount = 0;
  const controller = createHealthProbeController({
    timeoutMs: 5,
    request: (signal) => {
      requestCount += 1;
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    },
  });

  assert.deepEqual(await controller.probe(true), { ok: false, state: 'sleeping' });
  assert.equal(requestCount, 1);
  assert.deepEqual(await controller.probe(true), { ok: false, state: 'sleeping' });
  assert.equal(requestCount, 2);
});

test('cooldown suppresses repeated probes without continuous polling', async () => {
  let now = 1_000;
  let requestCount = 0;
  const controller = createHealthProbeController({
    now: () => now,
    cooldownMs: 100,
    request: async () => {
      requestCount += 1;
    },
  });

  await controller.probe();
  await controller.probe();
  assert.equal(requestCount, 1);

  now += 101;
  await controller.probe();
  assert.equal(requestCount, 2);
});