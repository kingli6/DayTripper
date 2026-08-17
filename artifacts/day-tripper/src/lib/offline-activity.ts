import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  createActivity as createActivityRequest,
  deleteActivity as deleteActivityRequest,
  updateActivity as updateActivityRequest,
} from '@workspace/api-client-react';
import type { Activity, ActivityInput, ActivityUpdate } from '@workspace/api-client-react';

const STORAGE_PREFIX = 'day-tripper:offline-activities:v1';

type CreateOperation = {
  kind: 'create';
  localId: number;
  data: ActivityInput;
};

type UpdateOperation = {
  kind: 'update';
  id: number;
  data: ActivityUpdate;
};

type DeleteOperation = {
  kind: 'delete';
  id: number;
};

export type PendingActivityOperation = CreateOperation | UpdateOperation | DeleteOperation;

type OfflineState = {
  snapshots: Record<string, Activity[]>;
  queue: PendingActivityOperation[];
};

export type OfflineSyncStatus = 'synced' | 'saving' | 'syncing' | 'pending' | 'offline' | 'error';

type UseOfflineActivitySyncOptions = {
  userId: string | undefined;
  date: string;
  today: string;
  queryKey: QueryKey;
};

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function emptyState(): OfflineState {
  return { snapshots: {}, queue: [] };
}

function isActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object') return false;
  const activity = value as Partial<Activity>;
  return (
    typeof activity.id === 'number' &&
    typeof activity.title === 'string' &&
    typeof activity.scheduledDate === 'string' &&
    typeof activity.startTime === 'string' &&
    (typeof activity.endTime === 'string' || activity.endTime === null) &&
    typeof activity.completed === 'boolean' &&
    typeof activity.locked === 'boolean' &&
    typeof activity.pinned === 'boolean' &&
    (typeof activity.note === 'string' || activity.note === null)
  );
}

function isActivityInput(value: unknown): value is ActivityInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<ActivityInput>;
  return (
    typeof input.title === 'string' &&
    typeof input.scheduledDate === 'string' &&
    typeof input.startTime === 'string'
  );
}

function readState(userId: string | undefined): OfflineState {
  if (!userId || typeof window === 'undefined') return emptyState();

  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<OfflineState>;
    const snapshots = Object.fromEntries(
      Object.entries(parsed.snapshots ?? {}).map(([date, activities]) => [
        date,
        Array.isArray(activities) ? activities.filter(isActivity) : [],
      ]),
    );
    const queue = Array.isArray(parsed.queue)
      ? parsed.queue.filter((operation): operation is PendingActivityOperation => {
          if (!operation || typeof operation !== 'object' || typeof operation.kind !== 'string') return false;
          if (operation.kind === 'create') return typeof operation.localId === 'number' && isActivityInput(operation.data);
          if (operation.kind === 'update') return typeof operation.id === 'number' && Boolean(operation.data);
          return operation.kind === 'delete' && typeof operation.id === 'number';
        })
      : [];
    return { snapshots, queue };
  } catch {
    return emptyState();
  }
}

function writeState(userId: string | undefined, state: OfflineState): boolean {
  if (!userId || typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function setActivityInSnapshot(
  snapshot: Activity[],
  activity: Activity,
  previousId?: number,
): Activity[] {
  const withoutPrevious = snapshot.filter((item) => item.id !== (previousId ?? activity.id));
  return [...withoutPrevious, activity].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function removeActivityFromSnapshots(state: OfflineState, id: number): OfflineState {
  const snapshots = Object.fromEntries(
    Object.entries(state.snapshots).map(([date, activities]) => [
      date,
      activities.filter((activity) => activity.id !== id),
    ]),
  );
  return { ...state, snapshots };
}

function replaceLocalActivity(
  state: OfflineState,
  localId: number,
  savedActivity: Activity,
): OfflineState {
  const withoutLocal = removeActivityFromSnapshots(state, localId);
  const existing = withoutLocal.snapshots[savedActivity.scheduledDate] ?? [];
  return {
    ...withoutLocal,
    snapshots: {
      ...withoutLocal.snapshots,
      [savedActivity.scheduledDate]: setActivityInSnapshot(existing, savedActivity),
    },
  };
}

function applyUpdateToState(
  state: OfflineState,
  id: number,
  data: ActivityUpdate,
): OfflineState {
  let result = removeActivityFromSnapshots(state, id);

  for (const [date, activities] of Object.entries(state.snapshots)) {
    const previous = activities.find((activity) => activity.id === id);
    if (!previous) continue;

    const updated: Activity = {
      ...previous,
      ...data,
      endTime: data.endTime === undefined ? previous.endTime : data.endTime,
      category: data.category === undefined ? previous.category : data.category,
      note: data.note === undefined ? previous.note : data.note,
      scheduledDate: data.scheduledDate ?? previous.scheduledDate,
    };
    const targetDate = updated.scheduledDate;
    const targetSnapshot = result.snapshots[targetDate] ?? [];
    result = {
      ...result,
      snapshots: {
        ...result.snapshots,
        [targetDate]: setActivityInSnapshot(targetSnapshot, updated),
        ...(targetDate !== date && { [date]: result.snapshots[date] ?? [] }),
      },
    };
    break;
  }

  return result;
}

function optimisticActivity(localId: number, data: ActivityInput): Activity {
  return {
    id: localId,
    title: data.title,
    scheduledDate: data.scheduledDate,
    startTime: data.startTime,
    endTime: data.endTime ?? null,
    category: data.category ?? null,
    completed: data.completed ?? false,
    locked: data.locked ?? false,
    pinned: data.pinned ?? false,
    note: data.note ?? null,
  };
}

function isConnectionError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return !error || typeof error !== 'object' || !('status' in error);
}

let nextLocalId = -Date.now();

export function useOfflineActivitySync({
  userId,
  date,
  today,
  queryKey,
}: UseOfflineActivitySyncOptions) {
  const queryClient = useQueryClient();
  const canUseOffline = Boolean(userId && date === today);
  const [state, setState] = useState<OfflineState>(() => readState(userId));
  const stateRef = useRef(state);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const [status, setStatus] = useState<OfflineSyncStatus>(() => (
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced'
  ));
  const [errorMessage, setErrorMessage] = useState('');
  const syncingRef = useRef(false);
  const [cachedActivities, setCachedActivities] = useState<Activity[] | null>(() => {
    if (!canUseOffline) return null;
    return readState(userId).snapshots[date] ?? null;
  });

  const commit = useCallback((next: OfflineState, nextStatus?: OfflineSyncStatus) => {
    stateRef.current = next;
    setState(next);
    const persisted = writeState(userId, next);
    if (!persisted && userId) {
      setErrorMessage('This change could not be kept for offline use on this device.');
      setStatus('error');
      return;
    }
    if (nextStatus) setStatus(nextStatus);
  }, [userId]);

  const updateVisibleActivities = useCallback((activities: Activity[]) => {
    if (!canUseOffline) return;
    setCachedActivities(activities);
    queryClient.setQueryData<Activity[]>(queryKey, activities);
  }, [canUseOffline, queryClient, queryKey]);

  useEffect(() => {
    const next = readState(userId);
    stateRef.current = next;
    setState(next);
    setCachedActivities(canUseOffline ? next.snapshots[date] ?? null : null);
    setErrorMessage('');
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
  }, [canUseOffline, date, userId]);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };
    const handleOnline = () => {
      setIsOnline(true);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const saveServerSnapshot = useCallback((activities: Activity[]) => {
    if (!canUseOffline || stateRef.current.queue.length > 0) return;
    const next: OfflineState = {
      ...stateRef.current,
      snapshots: { ...stateRef.current.snapshots, [date]: activities },
    };
    commit(next, isOnline ? 'synced' : 'offline');
    updateVisibleActivities(activities);
  }, [canUseOffline, commit, date, isOnline, updateVisibleActivities]);

  const applyLocalState = useCallback((next: OfflineState, nextStatus: OfflineSyncStatus = 'pending') => {
    const activities = next.snapshots[date] ?? [];
    commit(next, nextStatus);
    updateVisibleActivities(activities);
  }, [commit, date, updateVisibleActivities]);

  const queueCreate = useCallback((data: ActivityInput) => {
    const localId = nextLocalId;
    nextLocalId -= 1;
    const activity = optimisticActivity(localId, data);
    const next: OfflineState = {
      ...stateRef.current,
      snapshots: {
        ...stateRef.current.snapshots,
        [data.scheduledDate]: setActivityInSnapshot(
          stateRef.current.snapshots[data.scheduledDate] ?? [],
          activity,
        ),
      },
      queue: [...stateRef.current.queue, { kind: 'create', localId, data }],
    };
    applyLocalState(next);
  }, [applyLocalState]);

  const queueUpdate = useCallback((id: number, data: ActivityUpdate) => {
    const queue = stateRef.current.queue;
    const createIndex = queue.findIndex((operation) => operation.kind === 'create' && operation.localId === id);
    let nextQueue = queue;
    if (createIndex >= 0) {
      const createOperation = queue[createIndex];
      if (createOperation.kind === 'create') {
        nextQueue = queue.map((operation, index) => (
          index === createIndex
            ? { ...createOperation, data: { ...createOperation.data, ...data } }
            : operation
        ));
      }
    } else {
      const updateIndex = queue.findIndex((operation) => operation.kind === 'update' && operation.id === id);
      const merged: PendingActivityOperation[] = updateIndex >= 0
        ? queue.map((operation, index) => {
            if (index !== updateIndex || operation.kind !== 'update') return operation;
            return { ...operation, data: { ...operation.data, ...data } };
          })
        : [...queue, { kind: 'update', id, data } satisfies UpdateOperation];
      nextQueue = merged.filter((operation) => !(operation.kind === 'delete' && operation.id === id));
    }
    applyLocalState(applyUpdateToState({ ...stateRef.current, queue: nextQueue }, id, data));
  }, [applyLocalState]);

  const queueDelete = useCallback((id: number) => {
    const nextQueue = stateRef.current.queue.filter((operation) => {
      if (operation.kind === 'create') return operation.localId !== id;
      return operation.id !== id;
    });
    const hasCreate = stateRef.current.queue.some((operation) => operation.kind === 'create' && operation.localId === id);
    const next: OfflineState = {
      ...removeActivityFromSnapshots(stateRef.current, id),
      queue: hasCreate ? nextQueue : [...nextQueue, { kind: 'delete', id }],
    };
    applyLocalState(next);
  }, [applyLocalState]);

  const applyServerActivity = useCallback((activity: Activity) => {
    const withoutPrevious = removeActivityFromSnapshots(stateRef.current, activity.id);
    const next: OfflineState = {
      ...withoutPrevious,
      snapshots: {
        ...withoutPrevious.snapshots,
        ...(activity.scheduledDate === date && {
          [date]: setActivityInSnapshot(withoutPrevious.snapshots[date] ?? [], activity),
        }),
      },
    };
    commit(next, next.queue.length ? 'pending' : 'synced');
    updateVisibleActivities(next.snapshots[date] ?? []);
  }, [commit, date, updateVisibleActivities]);

  const applyServerDelete = useCallback((id: number) => {
    const next = removeActivityFromSnapshots(stateRef.current, id);
    commit(next, next.queue.length ? 'pending' : 'synced');
    updateVisibleActivities(next.snapshots[date] ?? []);
  }, [commit, date, updateVisibleActivities]);

  const syncPending = useCallback(async () => {
    if (!canUseOffline || !isOnline || syncingRef.current || !stateRef.current.queue.length) {
      if (canUseOffline && isOnline && !stateRef.current.queue.length && status !== 'synced') setStatus('synced');
      return;
    }

    syncingRef.current = true;
    setStatus('syncing');
    setErrorMessage('');

    try {
      for (const operation of [...stateRef.current.queue]) {
        if (!isOnline) throw new TypeError('Connection paused');
        if (operation.kind === 'create') {
          const saved = await createActivityRequest(operation.data);
          let next = replaceLocalActivity(stateRef.current, operation.localId, saved);
          next = { ...next, queue: next.queue.filter((item) => item !== operation) };
          commit(next, next.queue.length ? 'syncing' : 'synced');
          updateVisibleActivities(next.snapshots[date] ?? []);
        } else if (operation.kind === 'update') {
          const saved = await updateActivityRequest(operation.id, operation.data);
          let next = applyUpdateToState(stateRef.current, operation.id, saved);
          next = { ...next, queue: next.queue.filter((item) => item !== operation) };
          commit(next, next.queue.length ? 'syncing' : 'synced');
          updateVisibleActivities(next.snapshots[date] ?? []);
        } else {
          await deleteActivityRequest(operation.id);
          const next = {
            ...removeActivityFromSnapshots(stateRef.current, operation.id),
            queue: stateRef.current.queue.filter((item) => item !== operation),
          };
          commit(next, next.queue.length ? 'syncing' : 'synced');
          updateVisibleActivities(next.snapshots[date] ?? []);
        }
      }
      setStatus('synced');
    } catch (error) {
      if (isConnectionError(error)) {
        setIsOnline(false);
        setStatus('offline');
        setErrorMessage('Your saved changes are waiting until the connection returns.');
      } else {
        setStatus('error');
        setErrorMessage('A saved change needs your attention before it can sync.');
      }
    } finally {
      syncingRef.current = false;
    }
  }, [canUseOffline, commit, date, isOnline, status, updateVisibleActivities]);

  useEffect(() => {
    if (isOnline && canUseOffline) void syncPending();
  }, [canUseOffline, isOnline, syncPending]);

  const save = useCallback(async (activity: Activity | null, data: ActivityInput) => {
    if (canUseOffline && !isOnline) {
      if (activity) queueUpdate(activity.id, data);
      else queueCreate(data);
      return;
    }

    setStatus('saving');
    setErrorMessage('');
    try {
      if (activity) {
        const saved = await updateActivityRequest(activity.id, data);
        applyServerActivity(saved);
      } else {
        const saved = await createActivityRequest(data);
        applyServerActivity(saved);
      }
      setStatus('synced');
    } catch (error) {
      if (canUseOffline && isConnectionError(error)) {
        setIsOnline(false);
        if (activity) queueUpdate(activity.id, data);
        else queueCreate(data);
        setErrorMessage('The connection paused, so this change is waiting to sync.');
        setStatus('offline');
        return;
      }
      setStatus('error');
      throw error;
    }
  }, [applyServerActivity, canUseOffline, isOnline, queueCreate, queueUpdate]);

  const update = useCallback(async (activity: Activity, data: ActivityUpdate) => {
    if (canUseOffline && !isOnline) {
      queueUpdate(activity.id, data);
      return;
    }

    setStatus('saving');
    setErrorMessage('');
    try {
      const saved = await updateActivityRequest(activity.id, data);
      applyServerActivity(saved);
      setStatus('synced');
    } catch (error) {
      if (canUseOffline && isConnectionError(error)) {
        setIsOnline(false);
        queueUpdate(activity.id, data);
        setErrorMessage('The connection paused, so this change is waiting to sync.');
        setStatus('offline');
        return;
      }
      setStatus('error');
      throw error;
    }
  }, [applyServerActivity, canUseOffline, isOnline, queueUpdate]);

  const remove = useCallback(async (activity: Activity) => {
    if (canUseOffline && !isOnline) {
      queueDelete(activity.id);
      return;
    }

    setStatus('saving');
    setErrorMessage('');
    try {
      await deleteActivityRequest(activity.id);
      applyServerDelete(activity.id);
      setStatus('synced');
    } catch (error) {
      if (canUseOffline && isConnectionError(error)) {
        setIsOnline(false);
        queueDelete(activity.id);
        setErrorMessage('The connection paused, so this removal is waiting to sync.');
        setStatus('offline');
        return;
      }
      setStatus('error');
      throw error;
    }
  }, [applyServerDelete, canUseOffline, isOnline, queueDelete]);

  const retry = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }
    setIsOnline(true);
    await syncPending();
  }, [syncPending]);

  return {
    isOnline,
    canUseOffline,
    cachedActivities,
    hasPendingChanges: state.queue.length > 0,
    status,
    errorMessage,
    saveServerSnapshot,
    save,
    update,
    remove,
    retry,
  };
}