import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { healthCheck, subscribeApiLifecycle } from '@workspace/api-client-react';
import {
  classifyHealthFailure as classifyHealthFailureCore,
  createHealthProbeController,
  RENDER_IDLE_WINDOW_MS,
  WAKE_TIMEOUT_MS,
  type HealthFailureClassification,
  type ServerWakeState,
  type WakeResult,
} from './server-wake-core';

export const FOREGROUND_PROBE_WINDOW_MS = 60 * 1000;
export const KEEP_APP_ACTIVE_INTERVAL_MS = 10 * 60 * 1000;
const KEEP_APP_ACTIVE_STORAGE_KEY = 'day-tripper.keep-app-active';

export function canReachNetwork() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function classifyHealthFailure(status?: number): HealthFailureClassification {
  return classifyHealthFailureCore(status, canReachNetwork());
}

export { createHealthProbeController };
export type { HealthFailureClassification, ServerWakeState, WakeResult };

function isHealthCheckEvent(event: { url: string }) {
  return event.url.replace(/\/+$/, '').endsWith('/api/healthz');
}

type ServerAvailabilityContextValue = {
  state: ServerWakeState;
  lastSuccessAt: number | null;
  wake: () => Promise<WakeResult>;
  probe: (options?: { force?: boolean }) => Promise<WakeResult>;
  keepAppActive: boolean;
  setKeepAppActive: (enabled: boolean) => void;
};

const ServerAvailabilityContext = createContext<ServerAvailabilityContextValue | null>(null);

export function ServerAvailabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerWakeState>('checking');
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [keepAppActive, setKeepAppActiveState] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(KEEP_APP_ACTIVE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const probeControllerRef = useRef<ReturnType<typeof createHealthProbeController> | null>(null);

  if (!probeControllerRef.current) {
    probeControllerRef.current = createHealthProbeController({
      request: async (signal) => {
        await healthCheck({ signal });
      },
    });
  }

  const probe = useCallback(async ({ force = false }: { force?: boolean } = {}): Promise<WakeResult> => {
    if (!canReachNetwork()) {
      setState('offline');
      return { ok: false, state: 'offline' };
    }

    setState('waking');
    const result = await probeControllerRef.current!.probe(force);
    if (result.ok) setLastSuccessAt(Date.now());
    setState(result.state);
    return result;
  }, []);

  const wake = useCallback(() => probe({ force: true }), [probe]);
  const setKeepAppActive = useCallback((enabled: boolean) => {
    setKeepAppActiveState(enabled);
    try {
      if (enabled) {
        window.localStorage.setItem(KEEP_APP_ACTIVE_STORAGE_KEY, 'true');
      } else {
        window.localStorage.removeItem(KEEP_APP_ACTIVE_STORAGE_KEY);
      }
    } catch {
      // The preference still applies for this session if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    return subscribeApiLifecycle((event) => {
      if (!isHealthCheckEvent(event)) return;

      if (event.type === 'success') {
        const successAt = event.at;
        setLastSuccessAt(successAt);
        setState('ready');
        return;
      }

      const nextState = classifyHealthFailure(event.status);
      setState(nextState);
    });
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    let hiddenAt: number | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      if (hiddenAt !== null && Date.now() - hiddenAt >= FOREGROUND_PROBE_WINDOW_MS) {
        void probe();
      }
      hiddenAt = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [probe]);

  useEffect(() => {
    if (!keepAppActive) return;

    let intervalId: number | null = null;
    const clearHeartbeat = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const sendHeartbeat = () => {
      if (document.visibilityState === 'visible') void probe({ force: true });
    };
    const startHeartbeat = () => {
      clearHeartbeat();
      if (document.visibilityState === 'visible') {
        intervalId = window.setInterval(sendHeartbeat, KEEP_APP_ACTIVE_INTERVAL_MS);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        startHeartbeat();
      } else {
        clearHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
      startHeartbeat();
    }

    return () => {
      clearHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [keepAppActive, probe]);

  useEffect(() => {
    const handleOffline = () => setState('offline');
    const handleOnline = () => {
      if (state === 'offline') void probe();
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [probe, state]);

  const value = useMemo<ServerAvailabilityContextValue>(() => ({
    state: lastSuccessAt && Date.now() - lastSuccessAt >= RENDER_IDLE_WINDOW_MS && state === 'ready'
      ? 'sleeping'
      : state,
    lastSuccessAt,
    wake,
    probe,
    keepAppActive,
    setKeepAppActive,
  }), [keepAppActive, lastSuccessAt, probe, setKeepAppActive, state, wake]);

  return createElement(ServerAvailabilityContext.Provider, { value }, children);
}

export function useServerWakeState() {
  const context = useContext(ServerAvailabilityContext);
  if (!context) {
    throw new Error('useServerWakeState must be used within ServerAvailabilityProvider.');
  }
  return context;
}

export function useKeepAppActive() {
  const { keepAppActive, setKeepAppActive } = useServerWakeState();
  return {
    enabled: keepAppActive,
    setEnabled: setKeepAppActive,
  };
}