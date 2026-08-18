import { useCallback, useEffect, useRef, useState } from 'react';
import { healthCheck, subscribeApiLifecycle } from '@workspace/api-client-react';

const RENDER_IDLE_WINDOW_MS = 15 * 60 * 1000;
const WAKE_TIMEOUT_MS = 35 * 1000;
const STATUS_REFRESH_MS = 30 * 1000;

export type ServerWakeState = 'checking' | 'ready' | 'sleeping' | 'waking' | 'offline' | 'error';

type WakeResult = {
  ok: boolean;
  state: ServerWakeState;
};

let lastSuccessfulRequestAt: number | null = null;

function canReachNetwork() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function isLikelyWakeFailure(status?: number) {
  // An undefined status means the request never received an HTTP response and
  // may indicate a sleeping/unreachable Render service. Any HTTP status,
  // including 5xx, proves the service was reached and should remain an
  // explicit server error rather than being presented as offline/sleeping.
  return status === undefined;
}

export function useServerWakeState() {
  const [state, setState] = useState<ServerWakeState>(() => (
    lastSuccessfulRequestAt === null ? 'checking' : 'ready'
  ));
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(lastSuccessfulRequestAt);
  const wakePromiseRef = useRef<Promise<WakeResult> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeApiLifecycle((event) => {
      if (event.type === 'success') {
        lastSuccessfulRequestAt = event.at;
        setLastSuccessAt(event.at);
        setState('ready');
        return;
      }

      if (isLikelyWakeFailure(event.status)) {
        setState(canReachNetwork() ? 'sleeping' : 'offline');
      } else if (event.status && event.status >= 500) {
        setState('error');
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (!lastSuccessfulRequestAt || state === 'waking') return;
      if (Date.now() - lastSuccessfulRequestAt >= RENDER_IDLE_WINDOW_MS) {
        setState('sleeping');
      } else if (state === 'sleeping') {
        setState('ready');
      }
    };

    refresh();
    const timer = window.setInterval(refresh, STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    const handleOffline = () => setState('offline');
    const handleOnline = () => {
      if (state === 'offline') setState(lastSuccessfulRequestAt ? 'sleeping' : 'checking');
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [state]);

  const wake = useCallback(async (): Promise<WakeResult> => {
    if (wakePromiseRef.current) return wakePromiseRef.current;

    const promise = (async () => {
      if (!canReachNetwork()) {
        setState('offline');
        return { ok: false, state: 'offline' as const };
      }

      setState('waking');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

      try {
        await healthCheck({ signal: controller.signal });
        const result = { ok: true, state: 'ready' as const };
        lastSuccessfulRequestAt = Date.now();
        setLastSuccessAt(lastSuccessfulRequestAt);
        setState(result.state);
        return result;
      } catch {
        const nextState: 'error' | 'offline' = canReachNetwork() ? 'error' : 'offline';
        setState(nextState);
        return { ok: false, state: nextState };
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    wakePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      wakePromiseRef.current = null;
    }
  }, []);

  const isIdle = Boolean(
    lastSuccessAt && Date.now() - lastSuccessAt >= RENDER_IDLE_WINDOW_MS,
  );

  return {
    state: isIdle && state === 'ready' ? 'sleeping' as const : state,
    lastSuccessAt,
    wake,
  };
}