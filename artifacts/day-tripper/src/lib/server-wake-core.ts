export const RENDER_IDLE_WINDOW_MS = 15 * 60 * 1000;
export const WAKE_TIMEOUT_MS = 35 * 1000;
export const PROBE_COOLDOWN_MS = 10 * 1000;

export type ServerWakeState =
  | 'checking'
  | 'ready'
  | 'sleeping'
  | 'waking'
  | 'offline'
  | 'error'
  | 'auth-error';

export type WakeResult = {
  ok: boolean;
  state: ServerWakeState;
};

export type HealthFailureClassification =
  | 'offline'
  | 'sleeping'
  | 'error'
  | 'auth-error';

export function classifyHealthFailure(
  status: number | undefined,
  networkAvailable = true,
): HealthFailureClassification {
  if (!networkAvailable) return 'offline';
  if (status === 401 || status === 403) return 'auth-error';
  if (status === undefined) return 'sleeping';
  return 'error';
}

export function createHealthProbeController({
  request,
  now = () => Date.now(),
  cooldownMs = PROBE_COOLDOWN_MS,
  timeoutMs = WAKE_TIMEOUT_MS,
}: {
  request: (signal: AbortSignal) => Promise<void>;
  now?: () => number;
  cooldownMs?: number;
  timeoutMs?: number;
}) {
  let inFlight: Promise<WakeResult> | null = null;
  let lastProbeAt = -Infinity;
  let lastResult: WakeResult = { ok: false, state: 'checking' };

  return {
    probe(force = false): Promise<WakeResult> {
      if (inFlight) return inFlight;

      if (!force && now() - lastProbeAt < cooldownMs) {
        return Promise.resolve(lastResult);
      }

      lastProbeAt = now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const promise = request(controller.signal)
        .then(() => {
          lastResult = { ok: true, state: 'ready' };
          return lastResult;
        })
        .catch((error: unknown) => {
          const status = error && typeof error === 'object' && 'status' in error
            && typeof error.status === 'number'
            ? error.status
            : undefined;
          lastResult = {
            ok: false,
            state: classifyHealthFailure(status),
          };
          return lastResult;
        })
        .finally(() => {
          clearTimeout(timeout);
          inFlight = null;
        });

      inFlight = promise;
      return promise;
    },
  };
}