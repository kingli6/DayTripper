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
};

const ServerAvailabilityContext = createContext<ServerAvailabilityContextValue | null>(null);

export function ServerAvailabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerWakeState>('checking');
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
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
  }), [lastSuccessAt, probe, state, wake]);

  return createElement(ServerAvailabilityContext.Provider, { value }, children);
}

export function useServerWakeState() {
  const context = useContext(ServerAvailabilityContext);
  if (!context) {
    throw new Error('useServerWakeState must be used within ServerAvailabilityProvider.');
  }
  return context;
}