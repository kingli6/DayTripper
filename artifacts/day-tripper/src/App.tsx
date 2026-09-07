import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity as ActivityIcon,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Cloud,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getListActivitiesQueryKey,
  useCreateActivity,
  useListActivities,
  useListTasks,
  useCreatePlanningProposal,
} from '@workspace/api-client-react';
import type { Activity, ActivityInput, PlanningDiscussionMessage, PlanningProposal, PlanningRequest, Task } from '@workspace/api-client-react';
import { ChangeReviewPanel } from '@/components/change-review-panel';
import { AppShell } from '@/components/app-shell';
import { ExecutionGuidancePanel } from '@/components/execution-guidance-panel';
import TasksPage from '@/pages/tasks';
import { PlanningDiscussion } from '@/components/planning-discussion';
import { ReplanningStudio } from '@/components/replanning-studio';
import { ErrorBoundary } from '@/components/error-boundary';
import { useOfflineActivitySync, type OfflineSyncStatus } from '@/lib/offline-activity';
import { ServerAvailabilityProvider, useServerWakeState, type ServerWakeState } from '@/lib/server-wake';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import RetentionPage from '@/pages/retention';
import SettingsPage from '@/pages/settings';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import AdminPage from '@/pages/admin';

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  const status = errorStatus(error);
  if (status === null) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A single short retry can recover a transient cold start without
      // repeatedly hammering a failing API in the background.
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(750 * (attemptIndex + 1), 1500),
      // The app has explicit wake/retry controls and offline sync. Avoid
      // surprise requests when the tab regains focus or connectivity.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the app environment.');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(177 28% 39%)',
    colorForeground: 'hsl(205 32% 20%)',
    colorMutedForeground: 'hsl(201 15% 47%)',
    colorDanger: 'hsl(8 62% 54%)',
    colorBackground: 'hsl(43 40% 97%)',
    colorInput: 'hsl(43 40% 97%)',
    colorInputForeground: 'hsl(205 32% 20%)',
    colorNeutral: 'hsl(39 22% 84%)',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbfaf5] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#28383f]',
    headerSubtitle: 'text-[#6a7779]',
    socialButtonsBlockButtonText: 'text-[#28383f]',
    formFieldLabel: 'text-[#28383f]',
    footerActionLink: 'text-[#236f6b]',
    footerActionText: 'text-[#6a7779]',
    dividerText: 'text-[#6a7779]',
    identityPreviewEditButton: 'text-[#236f6b]',
    formFieldSuccessText: 'text-[#236f6b]',
    alertText: 'text-[#8f332a]',
    logoBox: 'h-12',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'border-[#d8d0c2] bg-[#fbfaf5]',
    formButtonPrimary: 'bg-[#236f6b] text-[#fbfaf5]',
    formFieldInput: 'border-[#d8d0c2] bg-[#fbfaf5] text-[#28383f]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#d8d0c2]',
    alert: 'border-[#e5c3bd] bg-[#fbefed]',
    otpCodeFieldInput: 'border-[#d8d0c2] bg-[#fbfaf5] text-[#28383f]',
    formFieldRow: 'text-[#28383f]',
    main: 'bg-transparent',
  },
};

const CATEGORIES = ['work', 'recovery', 'managing', 'social', 'fun'] as const;
type Category = (typeof CATEGORIES)[number];
type EditorActivity = Activity | null;
type ActivityDraft = {
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string | null;
  category: string | null;
  completed: boolean;
  locked: boolean;
  note: string | null;
};

const categoryMeta: Record<Category, { label: string; color: string; soft: string }> = {
  work: { label: 'Work', color: 'hsl(var(--primary))', soft: 'hsl(var(--primary) / 0.12)' },
  recovery: { label: 'Recovery', color: 'hsl(45 48% 46%)', soft: 'hsl(46 64% 86% / 0.75)' },
  managing: { label: 'Managing', color: 'hsl(22 62% 53%)', soft: 'hsl(28 72% 84% / 0.62)' },
  fun: { label: 'Fun', color: 'hsl(310 32% 52%)', soft: 'hsl(309 42% 88% / 0.75)' },
  social: { label: 'Social', color: 'hsl(191 50% 42%)', soft: 'hsl(191 48% 84% / 0.66)' },
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isOnLocalDate(timestamp: string | null | undefined, date: string) {
  if (!timestamp) return false;
  const parsed = new Date(timestamp);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === date;
}

function moveDate(date: string, amount: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return localDate(next);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function timeLabel(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function currentTimeValue() {
  const now = new Date();
  return `${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`;
}

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function isValidTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function safeTimeLabel(value: string) {
  return isValidTime(value) ? timeLabel(value) : value || 'Choose a time';
}

function draftFromActivity(activity: EditorActivity, date: string): ActivityDraft {
  return {
    title: activity?.title ?? '',
    scheduledDate: activity?.scheduledDate ?? date,
    startTime: activity?.startTime ?? '09:00',
    endTime: activity?.endTime ?? null,
    category: activity?.category ?? null,
    completed: activity?.completed ?? false,
    locked: activity?.locked ?? false,
    note: activity?.note ?? null,
  };
}

function BrandMark() {
  return (
    <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
      <span className="font-display -mt-0.5">d</span>
      <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
    </div>
  );
}

function ServerWakeStatus({
  state,
  onWake,
  compact = false,
}: {
  state: ServerWakeState;
  onWake: () => void;
  compact?: boolean;
}) {
  const copy: Record<ServerWakeState, string> = {
    checking: 'Checking the day space',
    ready: 'Day space ready',
    sleeping: 'The server may be waking up',
    waking: 'Waking the server…',
    offline: 'Connection paused',
    error: 'The server is unavailable',
    'auth-error': 'Authentication needs attention',
  };
  const canWake = state === 'sleeping' || state === 'error';
  const tone = state === 'sleeping' || state === 'error'
    ? 'border-accent/35 bg-accent/[0.08] text-accent-foreground'
    : state === 'auth-error'
      ? 'border-destructive/20 bg-destructive/[0.06] text-destructive'
    : state === 'offline'
      ? 'border-destructive/20 bg-destructive/[0.06] text-destructive'
      : 'border-border/70 bg-card/60 text-muted-foreground';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] ${tone}`}
      title="The server may rest after about 15 minutes without activity. Wake Day Tripper before you begin."
      data-testid="status-server-wake"
    >
      <EyeOff className={`size-3.5 shrink-0 ${state === 'waking' ? 'animate-breathe' : ''}`} strokeWidth={1.8} />
      {!compact && <span>{copy[state]}</span>}
      {compact && <span className="sr-only">{copy[state]}</span>}
      {canWake && (
        <button
          type="button"
          onClick={onWake}
          className="font-semibold underline decoration-current/35 underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="button-wake-server"
        >
          {state === 'error' ? 'Try again' : 'Wake up'}
        </button>
      )}
      {state === 'waking' && <LoaderCircle className="size-3 animate-spin" strokeWidth={1.8} />}
    </div>
  );
}

function GlobalServerAvailabilityIndicator() {
  const serverWake = useServerWakeState();
  const quiet = serverWake.state === 'checking' || serverWake.state === 'ready';

  return (
    <div className={quiet ? 'sr-only' : 'pointer-events-none fixed right-4 top-3 z-50 sm:right-6'}>
      <div className="pointer-events-auto">
        <ServerWakeStatus state={serverWake.state} onWake={() => void serverWake.wake()} />
      </div>
    </div>
  );
}

function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded || !isSignedIn) return <>{children}</>;

  return (
    <ServerAvailabilityProvider>
      <GlobalServerAvailabilityIndicator />
      {children}
    </ServerAvailabilityProvider>
  );
}

function OfflineSyncBanner({
  status,
  errorMessage,
  hasPendingChanges,
  hasCachedDay,
  onRetry,
  onWakeAndContinue,
  serverState,
}: {
  status: OfflineSyncStatus;
  errorMessage: string;
  hasPendingChanges: boolean;
  hasCachedDay: boolean;
  onRetry: () => void;
  onWakeAndContinue: () => void;
  serverState: ServerWakeState;
}) {
  const copy: Record<OfflineSyncStatus, string> = {
    synced: 'Your current day is synced.',
    saving: 'Saving your change…',
    syncing: 'Syncing saved changes…',
    pending: 'Changes are waiting to sync.',
    'auth-required': 'Sign in to sync your changes.',
    conflict: 'This day changed elsewhere. Review before syncing.',
    offline: hasCachedDay
      ? 'Offline — your recent current day is still available.'
      : 'Offline — this day has not been saved on this device yet.',
    error: errorMessage || 'Sync is paused. Your local changes are still here.',
  };
  const shouldRetry = status === 'error' || status === 'offline';
  const shouldWake = shouldRetry && (serverState === 'sleeping' || serverState === 'error');

  return (
    <div
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-xs ${
        status === 'error'
          ? 'border-destructive/25 bg-destructive/[0.06] text-destructive'
          : status === 'offline' || hasPendingChanges
            ? 'border-accent/30 bg-accent/[0.08] text-accent-foreground'
            : 'border-primary/20 bg-primary/[0.05] text-primary'
      }`}
      role="status"
      data-testid="status-offline-sync"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Cloud className="size-3.5 shrink-0" strokeWidth={1.8} />
        <span>{copy[status]}</span>
      </span>
      {shouldRetry && (
        <button
          type="button"
          onClick={shouldWake ? onWakeAndContinue : onRetry}
          className="rounded-full border border-current/25 px-3 py-1.5 text-[11px] font-semibold hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="button-retry-offline-sync"
        >
          {shouldWake ? 'Wake & continue' : 'Try again'}
        </button>
      )}
    </div>
  );
}

function DateNavigator({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  const isToday = date === today;
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <button type="button" onClick={() => onChange(moveDate(date, -1))} aria-label="View previous day" data-testid="button-previous-day" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-4" strokeWidth={1.8} />
      </button>
      <button type="button" onClick={() => onChange(moveDate(date, 1))} aria-label="View next day" data-testid="button-next-day" className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowRight className="size-4" strokeWidth={1.8} />
      </button>
      {!isToday && (
        <button type="button" onClick={() => onChange(today)} data-testid="button-jump-today" className="rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
          Back to today
        </button>
      )}
      <label className="relative flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5 text-primary" strokeWidth={1.8} />
        <span className="sr-only">Choose a date</span>
        <input type="date" value={date} onChange={(event) => onChange(event.target.value)} data-testid="input-calendar-date" className="min-w-0 bg-transparent font-mono-ui text-[11px] text-foreground outline-none" />
      </label>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading your day" data-testid="status-activities-loading">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex gap-4 rounded-[20px] border border-border/60 bg-card/55 p-4">
          <div className="mt-1 size-3 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-2/5 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded-full bg-muted/75" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyDay({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[26px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-14 text-center sm:px-12" data-testid="status-activities-empty">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Clock3 className="size-5" strokeWidth={1.6} />
      </div>
      <h2 className="mt-5 font-display text-[29px] leading-tight tracking-[-0.03em]">An open stretch of day.</h2>
      <p className="mx-auto mt-3 max-w-[360px] text-sm leading-6 text-muted-foreground">Nothing is pencilled in for this date. That can be useful space, too.</p>
      <button type="button" onClick={onAdd} data-testid="button-empty-add" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
        <Plus className="size-3.5" strokeWidth={2.2} />
        Add a small thing
      </button>
    </div>
  );
}

function ActivityCard({ activity, now, onEdit, onToggle }: { activity: Activity; now: number; onEdit: (activity: Activity) => void; onToggle: (activity: Activity) => void }) {
  const category = activity.category && isCategory(activity.category) ? categoryMeta[activity.category] : null;
  const start = minutesFromTime(activity.startTime);
  const isOngoing = activity.endTime === null;
  const isCurrent = !activity.completed && start <= now && (isOngoing || minutesFromTime(activity.endTime ?? activity.startTime) > now);
  const isPast = !activity.completed && !isCurrent && (activity.endTime ? minutesFromTime(activity.endTime) < now : start < now);

  return (
    <article className={`group relative flex gap-3 sm:gap-5 ${activity.completed ? 'opacity-60' : ''}`} data-testid={`card-activity-${activity.id}`}>
      <div className="flex w-[58px] shrink-0 flex-col items-end pt-2 text-right sm:w-[70px]">
        <time dateTime={activity.startTime} className={`font-mono-ui text-[11px] ${isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground'}`} data-testid={`text-start-time-${activity.id}`}>
          {timeLabel(activity.startTime)}
        </time>
        {activity.endTime ? <span className="mt-1 text-[10px] text-muted-foreground/65">{timeLabel(activity.endTime)}</span> : <span className="mt-1 text-[10px] text-primary/75">ongoing</span>}
      </div>
      <div className="relative flex min-w-0 flex-1 gap-3">
        <div className="relative flex w-4 shrink-0 justify-center">
          <span className={`mt-3 size-3 rounded-full border-2 bg-background ${activity.completed ? 'border-primary bg-primary' : isCurrent ? 'border-accent shadow-[0_0_0_5px_hsl(var(--accent)/0.14)]' : 'border-primary/45'}`} aria-hidden="true">
            {activity.completed && <Check className="size-2 text-primary-foreground" strokeWidth={3} />}
          </span>
          <span className="absolute bottom-[-24px] top-6 w-px bg-border/70" aria-hidden="true" />
        </div>
        <div className={`mb-4 min-w-0 flex-1 rounded-[20px] border px-4 py-3.5 transition-colors sm:px-5 ${isCurrent ? 'border-accent/55 bg-accent/[0.09]' : 'border-border/75 bg-card/75 hover:border-primary/30'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {isCurrent && <span className="rounded-full bg-accent/20 px-2 py-1 font-mono-ui text-[9px] font-medium uppercase tracking-[0.14em] text-accent-foreground">Now</span>}
                {isPast && !activity.completed && <span className="font-mono-ui text-[9px] uppercase tracking-[0.12em] text-muted-foreground/65">passed by</span>}
                {category && <span className="rounded-full px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em]" style={{ backgroundColor: category.soft, color: category.color }}>{category.label}</span>}
                {activity.locked && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-secondary-foreground"><LockKeyhole className="size-3" strokeWidth={1.8} /> Locked</span>}
              </div>
              <h3 className={`mt-2 text-[15px] font-semibold leading-5 ${activity.completed ? 'text-muted-foreground line-through decoration-primary/40' : 'text-foreground'}`} data-testid={`text-activity-title-${activity.id}`}>{activity.title}</h3>
              {activity.note && <p className="mt-1.5 max-w-[520px] text-xs leading-5 text-muted-foreground" data-testid={`text-activity-note-${activity.id}`}>{activity.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
              <button type="button" onClick={() => onEdit(activity)} aria-label={`Edit ${activity.title}`} data-testid={`button-edit-activity-${activity.id}`} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Pencil className="size-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
            <span className="text-[11px] text-muted-foreground">{activity.completed ? 'Done for now' : isOngoing ? 'No end time set' : 'Scheduled'}</span>
            <button type="button" onClick={() => onToggle(activity)} data-testid={`button-toggle-activity-${activity.id}`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${activity.completed ? 'border border-border bg-background text-foreground hover:border-primary/45 hover:text-primary' : 'bg-primary/10 text-primary hover:bg-primary/15'}`}>
              {activity.completed ? <RotateCcw className="size-3" strokeWidth={2} /> : <Check className="size-3" strokeWidth={2.3} />}
              {activity.completed ? 'Undo' : 'Mark done'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Timeline({ activities, now, onEdit, onToggle }: { activities: Activity[]; now: number; onEdit: (activity: Activity) => void; onToggle: (activity: Activity) => void }) {
  const sorted = useMemo(() => [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime)), [activities]);
  const currentIndex = sorted.findIndex((activity) => !activity.completed && minutesFromTime(activity.startTime) <= now && (activity.endTime === null || minutesFromTime(activity.endTime) > now));
  return (
    <div className="relative" data-testid="timeline-activities">
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Your day, in pieces</span>
        <span className="h-px flex-1 bg-border/65" />
        <span className="font-mono-ui text-[10px] text-muted-foreground">{activities.length} {activities.length === 1 ? 'item' : 'items'}</span>
      </div>
      {sorted.map((activity, index) => {
        const previous = sorted[index - 1];
        const gap = previous?.endTime ? minutesFromTime(activity.startTime) - minutesFromTime(previous.endTime) : 0;
        const showNowBefore = currentIndex === index && !activity.completed;
        return (
          <div key={activity.id}>
            {gap > 45 && <div className="mb-4 ml-[82px] flex items-center gap-2 text-[10px] italic text-muted-foreground/70 sm:ml-[100px]" data-testid={`status-empty-time-${activity.id}`}><span className="h-px w-5 bg-border/70" />Open time · {gap >= 120 ? `${Math.floor(gap / 60)}h ${gap % 60 ? `${gap % 60}m` : ''}` : `${gap}m`}</div>}
            {showNowBefore && <div className="mb-3 ml-[82px] flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.15em] text-accent sm:ml-[100px]" data-testid="status-now-indicator"><span className="size-1.5 animate-breathe rounded-full bg-accent" />Now</div>}
            <ActivityCard activity={activity} now={now} onEdit={onEdit} onToggle={onToggle} />
          </div>
        );
      })}
    </div>
  );
}

function CompletedTaskCard({ task }: { task: Task }) {
  const completedAt = task.completedAt ? new Date(task.completedAt) : null;
  const completionTime = completedAt && !Number.isNaN(completedAt.getTime())
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(completedAt)
    : null;

  return (
    <article className="flex gap-3 border-b border-border/65 py-3 last:border-0" data-testid={`card-completed-task-${task.id}`}>
      <div className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-2.5" strokeWidth={3} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {completionTime ? `Completed at ${completionTime}` : 'Completed task'}
        </p>
      </div>
      <Link href="/tasks" data-testid={`link-completed-task-${task.id}`} className="self-start rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
        Open tasks
      </Link>
    </article>
  );
}

function CompletedTimeline({
  plannedActivities,
  completedActivities,
  tasks,
  now,
  onEdit,
  onToggle,
}: {
  plannedActivities: Activity[];
  completedActivities: Activity[];
  tasks: Task[];
  now: number;
  onEdit: (activity: Activity) => void;
  onToggle: (activity: Activity) => void;
}) {
  const sortedCompletedActivities = useMemo(
    () => [...completedActivities].sort((first, second) => (
      (second.completedAt ?? '').localeCompare(first.completedAt ?? '') || first.id - second.id
    )),
    [completedActivities],
  );
  const sortedTasks = useMemo(
    () => [...tasks].sort((first, second) => (second.completedAt ?? '').localeCompare(first.completedAt ?? '') || first.id - second.id),
    [tasks],
  );
  const total = plannedActivities.length + completedActivities.length + tasks.length;

  return (
    <div data-testid="timeline-completed">
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">A record of what moved</span>
        <span className="h-px flex-1 bg-border/65" />
        <span className="font-mono-ui text-[10px] text-muted-foreground">{total} {total === 1 ? 'item' : 'items'}</span>
      </div>
      {plannedActivities.length > 0 && (
        <section aria-labelledby="completed-schedule-title">
          <h3 id="completed-schedule-title" className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-primary">Planned</h3>
          <Timeline activities={plannedActivities} now={now} onEdit={onEdit} onToggle={onToggle} />
        </section>
      )}
      {(sortedCompletedActivities.length > 0 || sortedTasks.length > 0) && (
        <section className={plannedActivities.length > 0 ? 'mt-6 border-t border-border/60 pt-5' : undefined} aria-labelledby="completed-items-title" data-testid="section-completed-timeline-items">
          <h3 id="completed-items-title" className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-primary">Completed</h3>
          {sortedCompletedActivities.length > 0 && (
            <Timeline activities={sortedCompletedActivities} now={now} onEdit={onEdit} onToggle={onToggle} />
          )}
          {sortedTasks.length > 0 && (
            <div className={sortedCompletedActivities.length > 0 ? 'mt-6 border-t border-border/60 pt-5' : undefined} data-testid="section-completed-timeline-tasks">
              <h4 className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tasks</h4>
              <div className="rounded-[20px] border border-border/75 bg-card/75 px-4 sm:px-5">
                {sortedTasks.map((task) => <CompletedTaskCard key={task.id} task={task} />)}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type ProposalReviewItem = {
  id: string;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  category: string;
  note: string | null;
  selected: boolean;
  removed: boolean;
  error?: string;
};

function proposalReviewItems(proposal: PlanningProposal): ProposalReviewItem[] {
  return proposal.proposedActivities.map((item, index) => ({
    id: `proposal-item-${index}`,
    title: item.title,
    scheduledDate: item.scheduledDate,
    startTime: item.startTime,
    endTime: item.endTime,
    category: item.category ?? '',
    note: item.note,
    selected: true,
    removed: false,
  }));
}

function PlanningStudio({ date, activities, onClose, onAccepted }: { date: string; activities: Activity[]; onClose: () => void; onAccepted: (count: number) => Promise<void> | void }) {
  const createPlanningProposal = useCreatePlanningProposal();
  const createActivity = useCreateActivity();
  const queryClient = useQueryClient();
  const intentionRef = useRef<HTMLTextAreaElement>(null);
  const [planningStage, setPlanningStage] = useState<'details' | 'discussion'>('details');
  const [intention, setIntention] = useState('');
  const [currentTime, setCurrentTime] = useState(currentTimeValue());
  const [availableStart, setAvailableStart] = useState('09:00');
  const [availableEnd, setAvailableEnd] = useState('17:00');
  const [planningStyle, setPlanningStyle] = useState<'lighter' | 'balanced' | 'fuller'>('balanced');
  const [fixedCommitments, setFixedCommitments] = useState('');
  const [proposal, setProposal] = useState<PlanningProposal | null>(null);
  const [reviewItems, setReviewItems] = useState<ProposalReviewItem[]>([]);
  const [formError, setFormError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState<PlanningDiscussionMessage[]>([]);
  const lockedActivities = activities.filter((activity) => activity.locked);
  const pending = createPlanningProposal.isPending;
  const hasPlanningContext = intention.trim().length > 0;

  useEffect(() => {
    if (planningStage !== 'details') return;
    const frame = window.requestAnimationFrame(() => intentionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [planningStage]);

  function validatePlanningDetails() {
    if (!/^\d{2}:\d{2}$/.test(currentTime) || !/^\d{2}:\d{2}$/.test(availableStart) || !/^\d{2}:\d{2}$/.test(availableEnd)) {
      setFormError('Choose valid times for the planning context.');
      return false;
    }
    if (minutesFromTime(availableEnd) <= minutesFromTime(availableStart)) {
      setFormError('The open-time window needs to end after it starts.');
      return false;
    }
    if (!hasPlanningContext) {
      setFormError('Add a short intention before starting the conversation.');
      return false;
    }
    return true;
  }

  async function startProposal(messages: PlanningDiscussionMessage[]) {
    setFormError('');
    setProposal(null);
    setDiscussionMessages(messages);
    setPlanningStage('details');
    try {
      const result = await createPlanningProposal.mutateAsync({
        data: {
          ...(intention.trim() ? { intention: intention.trim() } : {}),
          currentDate: date,
          currentTime,
          availableTime: [{ startTime: availableStart, endTime: availableEnd }],
          planningStyle,
          fixedCommitments: fixedCommitments.trim() || null,
          discussionMessages: messages,
        } as unknown as PlanningRequest,
      });
      setProposal(result);
      setReviewItems(proposalReviewItems(result));
      setReviewError('');
    } catch (error) {
      const responseData = (error as { data?: unknown }).data;
      const serverMessage = responseData && typeof responseData === 'object' && typeof (responseData as { error?: unknown }).error === 'string'
        ? (responseData as { error: string }).error
        : null;
      setFormError(serverMessage ?? 'The planner could not prepare a proposal. Check the connection and try again.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validatePlanningDetails()) return;
    setFormError('');
    setDiscussionMessages([]);
    setPlanningStage('discussion');
  }

  function returnToIntention() {
    setProposal(null);
    setReviewItems([]);
    setReviewError('');
    setFormError('');
    setPlanningStage('details');
    setDiscussionMessages([]);
    window.requestAnimationFrame(() => intentionRef.current?.focus());
  }

  function updateReviewItem(id: string, updates: Partial<Pick<ProposalReviewItem, 'title' | 'startTime' | 'endTime' | 'category'>>) {
    setReviewItems((current) => current.map((item) => item.id === id ? { ...item, ...updates, error: undefined } : item));
    setReviewError('');
  }

  function toggleReviewItem(id: string) {
    setReviewItems((current) => current.map((item) => item.id === id ? { ...item, selected: !item.selected, error: undefined } : item));
    setReviewError('');
  }

  function removeReviewItem(id: string) {
    setReviewItems((current) => current.map((item) => item.id === id ? { ...item, removed: true, selected: false, error: undefined } : item));
    setReviewError('');
  }

  function restoreReviewItem(id: string) {
    setReviewItems((current) => current.map((item) => item.id === id ? { ...item, removed: false, selected: true, error: undefined } : item));
    setReviewError('');
  }

  async function acceptReview(mode: 'selected' | 'remaining') {
    const candidates = reviewItems.filter((item) => !item.removed && (mode === 'remaining' || item.selected));
    if (!candidates.length) {
      setReviewError(mode === 'selected' ? 'Choose at least one suggested activity to add.' : 'There are no remaining suggested activities to add.');
      return;
    }

    const invalidIds = new Set(
      candidates
        .filter((item) => !item.title.trim() || !isValidTime(item.startTime) || !isValidTime(item.endTime) || minutesFromTime(item.endTime) <= minutesFromTime(item.startTime))
        .map((item) => item.id),
    );
    if (invalidIds.size) {
      setReviewItems((current) => current.map((item) => {
        if (!invalidIds.has(item.id)) return item;
        if (!item.title.trim()) return { ...item, error: 'Add a title before accepting this suggestion.' };
        if (!isValidTime(item.startTime) || !isValidTime(item.endTime)) return { ...item, error: 'Choose valid start and end times.' };
        return { ...item, error: 'The end time needs to be after the start time.' };
      }));
      setReviewError('A few suggestions need a small correction before they can be added.');
      return;
    }

    setReviewError('');
    setAccepting(true);
    let savedCount = 0;
    const unsavedIds: string[] = [];

    for (const item of candidates) {
      try {
        await createActivity.mutateAsync({
          data: {
            title: item.title.trim(),
            scheduledDate: item.scheduledDate,
            startTime: item.startTime,
            endTime: item.endTime,
            category: isCategory(item.category) ? item.category : null,
            completed: false,
            locked: false,
            pinned: false,
            note: item.note?.trim() || null,
          },
        });
        savedCount += 1;
        setReviewItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, removed: true, selected: false, error: undefined } : currentItem));
      } catch {
        unsavedIds.push(item.id);
        setReviewItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, error: 'This suggestion could not be added yet.' } : currentItem));
      }
    }

    if (savedCount > 0 && unsavedIds.length > 0) {
      await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    }

    setAccepting(false);
    if (unsavedIds.length > 0) {
      setReviewError(savedCount > 0
        ? `${savedCount} ${savedCount === 1 ? 'suggestion was' : 'suggestions were'} added. ${unsavedIds.length} ${unsavedIds.length === 1 ? 'suggestion needs' : 'suggestions need'} another try.`
        : 'Nothing was added yet. Check the connection, then try the remaining suggestions again.');
      return;
    }

    await onAccepted(savedCount);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending && !accepting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="planning-studio-title" aria-describedby="planning-studio-description" className="paper-grain max-h-[94dvh] w-full max-w-[720px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:max-h-[90dvh] sm:rounded-[28px] sm:p-7" data-testid="dialog-planning-studio">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary"><Sparkles className="size-3.5" strokeWidth={1.8} /> AI Studio</p>
            <h2 id="planning-studio-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">{proposal ? 'Look over the version.' : planningStage === 'discussion' ? 'Stay with the important part.' : 'Shape a possible day.'}</h2>
            <p id="planning-studio-description" className="mt-2 max-w-[550px] text-sm leading-6 text-muted-foreground">{proposal ? 'This is a proposal, not a silent rewrite. Adjust what you want, then explicitly add only the suggestions that feel right.' : planningStage === 'discussion' ? 'A short, user-controlled conversation before a proposal. You decide when it has done enough.' : 'Add a short intention, set the open time, and ask for one workable version. Your saved timeline stays untouched.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending || accepting} aria-label="Close AI Studio" data-testid="button-close-planning-studio" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        {proposal ? (
          <div className="mt-8 space-y-5" data-testid="status-planning-proposal-ready">
            <div className="rounded-[22px] border border-primary/20 bg-primary/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">Suggested plan</p>
                  <h3 className="mt-2 font-display text-[27px] leading-tight tracking-[-0.03em]">One workable version to review.</h3>
                </div>
                <span className="rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 font-mono-ui text-[10px] text-primary" data-testid="status-proposal-count">{reviewItems.filter((item) => !item.removed).length} remaining</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">This is a possible way to shape the day, not a change to your saved activities. Adjust, remove, or leave any suggestion behind before accepting it.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{reviewItems.filter((item) => item.selected && !item.removed).length}</p><p className="mt-1 text-[11px] text-muted-foreground">selected to add</p></div>
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{proposal.buffers.length + proposal.restPeriods.length}</p><p className="mt-1 text-[11px] text-muted-foreground">buffers and rest periods</p></div>
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{proposal.didNotFit.length}</p><p className="mt-1 text-[11px] text-muted-foreground">items still outside</p></div>
              </div>
            </div>

            <div className="rounded-[22px] border border-border/75 bg-card/55 p-4 sm:p-5" data-testid="section-proposal-items">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Review each suggestion</p>
                  <h3 className="mt-2 font-display text-[23px] leading-tight tracking-[-0.03em]">What might belong in the day?</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">Nothing is saved until you accept it.</p>
              </div>
              <div className="mt-5 space-y-3">
                {reviewItems.filter((item) => !item.removed).map((item, index) => {
                  const category = isCategory(item.category) ? categoryMeta[item.category] : null;
                  return (
                    <article key={item.id} className={`rounded-[18px] border bg-background/65 p-4 transition-colors ${item.error ? 'border-destructive/40' : item.selected ? 'border-primary/35' : 'border-border/75'}`} data-testid={`card-proposal-item-${index}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={item.selected} onChange={() => toggleReviewItem(item.id)} aria-label={`Select ${item.title || 'suggested activity'}`} data-testid={`checkbox-proposal-item-${index}`} className="mt-1 size-5 shrink-0 accent-[hsl(var(--primary))]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <label htmlFor={`proposal-title-${item.id}`} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Suggested activity</label>
                              <input id={`proposal-title-${item.id}`} value={item.title} onChange={(event) => updateReviewItem(item.id, { title: event.target.value })} aria-invalid={Boolean(item.error && !item.title.trim())} data-testid={`input-proposal-title-${index}`} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                            </div>
                            <button type="button" onClick={() => removeReviewItem(item.id)} aria-label={`Remove ${item.title || 'suggested activity'} from this review`} data-testid={`button-remove-proposal-item-${index}`} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <Trash2 className="size-4" strokeWidth={1.8} />
                            </button>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1.1fr]">
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Date</span>
                              <p className="mt-1 flex min-h-10 items-center rounded-lg border border-border/65 bg-card/55 px-3 text-xs text-foreground" data-testid={`text-proposal-date-${index}`}>{formatShortDate(item.scheduledDate)}</p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Time</span>
                              <div className="mt-1 grid grid-cols-2 gap-1.5">
                                <input type="time" value={item.startTime} onChange={(event) => updateReviewItem(item.id, { startTime: event.target.value })} aria-label={`Start time for ${item.title || 'suggested activity'}`} data-testid={`input-proposal-start-${index}`} className="min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                                <input type="time" value={item.endTime} onChange={(event) => updateReviewItem(item.id, { endTime: event.target.value })} aria-label={`End time for ${item.title || 'suggested activity'}`} data-testid={`input-proposal-end-${index}`} className="min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                              </div>
                              <p className="mt-1 text-[10px] text-muted-foreground">{safeTimeLabel(item.startTime)} – {safeTimeLabel(item.endTime)}</p>
                            </div>
                            <div>
                              <label htmlFor={`proposal-category-${item.id}`} className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Category</label>
                              <select id={`proposal-category-${item.id}`} value={item.category} onChange={(event) => updateReviewItem(item.id, { category: event.target.value })} data-testid={`select-proposal-category-${index}`} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                                <option value="">Uncategorized</option>
                                {CATEGORIES.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryMeta[categoryName].label}</option>)}
                              </select>
                              {category && <span className="mt-1 inline-flex rounded-full px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.1em]" style={{ backgroundColor: category.soft, color: category.color }}>{category.label}</span>}
                            </div>
                          </div>
                          {item.note && <p className="mt-3 border-t border-border/55 pt-3 text-xs leading-5 text-muted-foreground" data-testid={`text-proposal-note-${index}`}><span className="font-semibold text-foreground">Note:</span> {item.note}</p>}
                          {item.error && <p className="mt-3 rounded-lg bg-destructive/[0.07] px-3 py-2 text-xs leading-5 text-destructive" role="alert" data-testid={`status-proposal-item-error-${index}`}>{item.error}</p>}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {reviewItems.filter((item) => item.removed).map((item, index) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-dashed border-border/80 bg-background/35 px-4 py-3" data-testid={`status-proposal-item-removed-${index}`}>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-muted-foreground line-through">{item.title || 'Untitled suggestion'}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/75">Left out of this review</p>
                    </div>
                    <button type="button" onClick={() => restoreReviewItem(item.id)} data-testid={`button-restore-proposal-item-${index}`} className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Keep suggestion</button>
                  </div>
                ))}
                {!reviewItems.length && <p className="rounded-xl bg-background/70 px-3 py-3 text-xs leading-5 text-muted-foreground" data-testid="status-planning-proposal-empty">Nothing was suggested for this version. Open time is still allowed to stay open.</p>}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <details className="rounded-[20px] border border-border/75 bg-card/55 p-4" data-testid="section-proposal-context">
                <summary className="cursor-pointer list-none text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">Context held alongside this version</summary>
                <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Locked activities stay as context</p>
                    {lockedActivities.length ? <ul className="mt-2 space-y-2">{lockedActivities.map((activity) => <li key={activity.id} className="flex items-start gap-2 text-xs leading-5 text-foreground" data-testid={`text-proposal-locked-${activity.id}`}><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={1.8} />{activity.title} · {timeLabel(activity.startTime)}</li>)}</ul> : <p className="mt-2 text-xs leading-5 text-muted-foreground">No locked activities were on this day.</p>}
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">These saved activities were not edited by the proposal.</p>
                  </div>
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Assumptions</p>
                    {proposal.assumptions.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">{proposal.assumptions.map((assumption, index) => <li key={`${assumption}-${index}`} data-testid={`text-proposal-assumption-${index}`}>{assumption}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No assumptions were listed.</p>}
                  </div>
                </div>
              </details>
              <details className="rounded-[20px] border border-border/75 bg-card/55 p-4" data-testid="section-proposal-shape-notes">
                <summary className="cursor-pointer list-none text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">Space around the suggestions</summary>
                <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Buffers</p>
                    {proposal.buffers.length ? <ul className="mt-2 space-y-2">{proposal.buffers.map((buffer, index) => <li key={`${buffer.scheduledDate}-${buffer.startTime}-${index}`} className="text-xs leading-5 text-muted-foreground" data-testid={`text-proposal-buffer-${index}`}><span className="font-medium text-foreground">{formatShortDate(buffer.scheduledDate)} · {safeTimeLabel(buffer.startTime)}–{safeTimeLabel(buffer.endTime)}</span><br />{buffer.reason}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No buffer was listed.</p>}
                  </div>
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Rest periods</p>
                    {proposal.restPeriods.length ? <ul className="mt-2 space-y-2">{proposal.restPeriods.map((rest, index) => <li key={`${rest.scheduledDate}-${rest.startTime}-${index}`} className="text-xs leading-5 text-muted-foreground" data-testid={`text-proposal-rest-${index}`}><span className="font-medium text-foreground">{formatShortDate(rest.scheduledDate)} · {safeTimeLabel(rest.startTime)}–{safeTimeLabel(rest.endTime)}</span><br />{rest.reason}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No rest period was listed.</p>}
                  </div>
                </div>
              </details>
              <details className="rounded-[20px] border border-border/75 bg-card/55 p-4 lg:col-span-2" data-testid="section-proposal-boundaries">
                <summary className="cursor-pointer list-none text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">What stayed outside this version</summary>
                <div className="mt-4 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Conflicts to notice</p>
                    {proposal.conflicts.length ? <ul className="mt-2 space-y-3">{proposal.conflicts.map((conflict, index) => <li key={`${conflict.description}-${index}`} className="text-xs leading-5 text-muted-foreground" data-testid={`text-proposal-conflict-${index}`}><span className="font-medium text-foreground">{conflict.description}</span>{conflict.relatedActivityTitles.length > 0 && <span className="mt-1 block">Related: {conflict.relatedActivityTitles.join(', ')}</span>}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No conflicts were listed.</p>}
                  </div>
                  <div>
                    <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Did not fit</p>
                    {proposal.didNotFit.length ? <ul className="mt-2 space-y-3">{proposal.didNotFit.map((item, index) => <li key={`${item.title}-${index}`} className="text-xs leading-5 text-muted-foreground" data-testid={`text-proposal-did-not-fit-${index}`}><span className="font-medium text-foreground">{item.title}</span><span className="mt-1 block">{item.reason}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nothing was listed outside this version.</p>}
                  </div>
                </div>
              </details>
            </div>

            {reviewError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-planning-review-error">{reviewError}</p>}
            <div className="flex flex-col gap-3 border-t border-border/65 pt-5">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={returnToIntention} disabled={accepting} data-testid="button-plan-again" className="min-h-11 self-start rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45">Try another version</button>
                <button type="button" onClick={onClose} disabled={accepting} data-testid="button-reject-planning-proposal" className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45">Reject proposal</button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => void acceptReview('selected')} disabled={accepting || !reviewItems.some((item) => item.selected && !item.removed)} data-testid="button-accept-selected-proposal" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary/35 bg-primary/[0.06] px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                  {accepting && <LoaderCircle className="size-3.5 animate-spin" />}
                  Accept selected
                </button>
                <button type="button" onClick={() => void acceptReview('remaining')} disabled={accepting || !reviewItems.some((item) => !item.removed)} data-testid="button-accept-remaining-proposal" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                  {accepting && <LoaderCircle className="size-3.5 animate-spin" />}
                  Accept complete remaining version
                </button>
              </div>
              <p className="text-right text-[11px] leading-5 text-muted-foreground">Only the suggestions you accept become saved activities. Existing activities remain untouched.</p>
            </div>
          </div>
        ) : planningStage === 'discussion' ? (
          <PlanningDiscussion
            currentDate={date}
            intention={intention.trim() || null}
            currentTime={currentTime}
            availableTime={[{ startTime: availableStart, endTime: availableEnd }]}
            planningStyle={planningStyle}
            fixedCommitments={fixedCommitments.trim() || null}
            onBack={() => setPlanningStage('details')}
            onStartProposal={(messages) => void startProposal(messages)}
          />
        ) : pending ? (
          <div className="mt-7 space-y-3" aria-label="Preparing a planning proposal" data-testid="status-planning-loading">
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-[19px] border border-border/60 bg-card/55 p-4">
                <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
                <div className="mt-4 h-4 w-10/12 animate-pulse rounded-full bg-muted" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-muted/70" />
              </div>
            ))}
            <p className="pt-2 text-center text-xs text-muted-foreground">Holding your choices gently while the proposal takes shape.</p>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
            <div>
              <label htmlFor="planning-intention" className="text-xs font-semibold text-foreground">What would help today?</label>
              <textarea ref={intentionRef} id="planning-intention" value={intention} onChange={(event) => setIntention(event.target.value)} placeholder="Finish the report, eat something proper, and leave a little room before dinner." rows={4} data-testid="input-planning-intention" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="planning-current-time" className="text-xs font-semibold text-foreground">Current time</label>
                <input id="planning-current-time" type="time" required value={currentTime} onChange={(event) => setCurrentTime(event.target.value)} data-testid="input-planning-current-time" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
              <div>
                <label htmlFor="planning-open-start" className="text-xs font-semibold text-foreground">Open from</label>
                <input id="planning-open-start" type="time" required value={availableStart} onChange={(event) => setAvailableStart(event.target.value)} data-testid="input-planning-open-start" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
              <div>
                <label htmlFor="planning-open-end" className="text-xs font-semibold text-foreground">Open until</label>
                <input id="planning-open-end" type="time" required value={availableEnd} onChange={(event) => setAvailableEnd(event.target.value)} data-testid="input-planning-open-end" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
            </div>
            <div>
              <label htmlFor="planning-style" className="text-xs font-semibold text-foreground">How full should this version feel?</label>
              <select id="planning-style" value={planningStyle} onChange={(event) => setPlanningStyle(event.target.value as 'lighter' | 'balanced' | 'fuller')} data-testid="select-planning-style" className="mt-2 min-h-11 w-full appearance-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                <option value="lighter">Lighter — leave more room</option>
                <option value="balanced">Balanced — a workable version</option>
                <option value="fuller">Fuller — fit a little more in</option>
              </select>
            </div>
            <div>
              <label htmlFor="planning-commitments" className="text-xs font-semibold text-foreground">Fixed commitments <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="planning-commitments" value={fixedCommitments} onChange={(event) => setFixedCommitments(event.target.value)} placeholder="School pickup at 3:30, or anything else that must stay in place." rows={2} data-testid="input-planning-commitments" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="rounded-[18px] border border-border/75 bg-card/55 p-4">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.8} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Saved activities stay in view</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{activities.length ? `${activities.length} saved ${activities.length === 1 ? 'activity is' : 'activities are'} included automatically.` : 'There are no saved activities for this day yet.'} {lockedActivities.length ? `${lockedActivities.length} locked ${lockedActivities.length === 1 ? 'activity is' : 'activities are'} protected.` : 'Lock anything that must not move before asking for a proposal.'}</p>
                  {lockedActivities.length > 0 && <p className="mt-2 truncate text-[11px] font-medium text-primary" title={lockedActivities.map((activity) => activity.title).join(', ')}>Protected: {lockedActivities.map((activity) => activity.title).join(', ')}</p>}
                </div>
              </div>
            </div>
            {formError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-planning-error">{formError}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[330px] text-[11px] leading-5 text-muted-foreground">Planning needs an internet connection. It creates a proposal only; your saved schedule will not change automatically.</p>
              {!hasPlanningContext && <p className="max-w-[330px] text-[11px] leading-5 text-muted-foreground">Add a short intention before starting the conversation.</p>}
              <button type="submit" disabled={pending || !hasPlanningContext} data-testid="button-create-planning-proposal" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55">
                {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" strokeWidth={1.8} />}
                {pending ? 'Preparing a proposal…' : 'Suggest a possible plan'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function ActivityModal({ date, activity, onClose, onSave, onDelete, onDeleted }: {
  date: string;
  activity: EditorActivity;
  onClose: () => void;
  onSave: (activity: Activity | null, data: ActivityInput) => Promise<void>;
  onDelete: (activity: Activity) => Promise<void>;
  onDeleted: (activity: Activity) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(date);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [ongoing, setOngoing] = useState(true);
  const [category, setCategory] = useState<Category | ''>('');
  const [completed, setCompleted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [note, setNote] = useState('');
  const [initialDraft, setInitialDraft] = useState<ActivityDraft>(() => draftFromActivity(activity, date));
  const [confirmAction, setConfirmAction] = useState<'delete' | 'discard' | null>(null);
  const [formError, setFormError] = useState('');
  const editing = Boolean(activity);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const nextDraft = draftFromActivity(activity, date);
    setInitialDraft(nextDraft);
    setTitle(nextDraft.title);
    setScheduledDate(nextDraft.scheduledDate);
    setStartTime(nextDraft.startTime);
    setEndTime(nextDraft.endTime ?? '');
    setOngoing(nextDraft.endTime === null);
    setCategory(activity?.category && isCategory(activity.category) ? activity.category : '');
    setCompleted(nextDraft.completed);
    setLocked(nextDraft.locked);
    setNote(nextDraft.note ?? '');
    setConfirmAction(null);
    setFormError('');
  }, [activity, date]);

  const currentDraft: ActivityDraft = {
    title,
    scheduledDate,
    startTime,
    endTime: ongoing ? null : endTime || null,
    category: category || null,
    completed,
    locked,
    note: note || null,
  };
  const hasUnsavedChanges = JSON.stringify(currentDraft) !== JSON.stringify(initialDraft);

  function requestClose() {
    if (pending) return;
    if (confirmAction) {
      setConfirmAction(null);
      return;
    }
    if (hasUnsavedChanges) {
      setConfirmAction('discard');
      return;
    }
    onClose();
  }

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [confirmAction, hasUnsavedChanges, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setFormError('Give this activity a short name first.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      setFormError('Choose a valid date for this activity.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      setFormError('Choose a valid start time.');
      return;
    }
    if (!ongoing && !endTime) {
      setFormError('Add an end time or mark this activity as ongoing.');
      return;
    }
    if (!ongoing && minutesFromTime(endTime) <= minutesFromTime(startTime)) {
      setFormError('The end time needs to be after the start time.');
      return;
    }
    setFormError('');
    const payload = {
      title: title.trim(),
      scheduledDate,
      startTime,
      endTime: ongoing ? null : endTime,
      category: category || null,
      completed,
      locked,
      pinned: activity?.pinned ?? false,
      note: note.trim() || null,
    };
    try {
      setPending(true);
      await onSave(activity, payload);
      onClose();
    } catch {
      setFormError('That did not save. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!activity) return;
    try {
      setPending(true);
      await onDelete(activity);
      onDeleted(activity);
    } catch {
      setFormError('That did not delete. The activity is still here.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" aria-describedby="activity-modal-description" className="paper-grain max-h-[94dvh] w-full max-w-[680px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:max-h-[90dvh] sm:rounded-[28px] sm:p-7" data-testid="dialog-activity">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">{editing ? 'Make a change' : 'Add to the day'}</p>
            <h2 id="activity-modal-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">{editing ? 'Adjust the plan.' : 'What belongs here?'}</h2>
            <p id="activity-modal-description" className="mt-2 max-w-[510px] text-sm leading-6 text-muted-foreground">{editing ? 'Change the schedule directly. Nothing is sent to AI or changed elsewhere without your save.' : 'Give this part of the day a shape that feels possible.'}</p>
          </div>
          <button type="button" onClick={requestClose} disabled={pending} aria-label="Close activity form" data-testid="button-close-activity" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        {confirmAction === 'delete' ? (
          <div className="mt-8 rounded-[20px] border border-destructive/25 bg-destructive/[0.06] p-5">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 size-5 text-destructive" strokeWidth={1.7} />
              <div>
                <h3 className="font-semibold">Remove “{activity?.title}”?</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">This removes it from the day. You will have a short chance to undo it after confirming.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} disabled={pending} data-testid="button-cancel-delete" className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">Keep activity</button>
              <button type="button" onClick={() => void remove()} disabled={pending} data-testid="button-confirm-delete" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                {pending && <LoaderCircle className="size-3.5 animate-spin" />}
                Remove it
              </button>
            </div>
          </div>
        ) : confirmAction === 'discard' ? (
          <div className="mt-8 rounded-[20px] border border-primary/20 bg-primary/[0.05] p-5">
            <div className="flex items-start gap-3">
              <Pencil className="mt-0.5 size-5 text-primary" strokeWidth={1.7} />
              <div>
                <h3 className="font-semibold">Leave without saving?</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Your changes are still here. Keep editing or discard them and return to the timeline.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} data-testid="button-keep-editing" className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Keep editing</button>
              <button type="button" onClick={onClose} data-testid="button-discard-changes" className="min-h-11 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Discard changes</button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
            <div>
              <label htmlFor="activity-title" className="text-xs font-semibold text-foreground">Activity</label>
              <input ref={titleInputRef} id="activity-title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Call the school" aria-invalid={Boolean(formError && !title.trim())} data-testid="input-activity-title" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <div>
                <label htmlFor="activity-date" className="text-xs font-semibold text-foreground">Date</label>
                <input id="activity-date" required type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} data-testid="input-activity-date" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="activity-start" className="text-xs font-semibold text-foreground">Starts</label>
                  <input id="activity-start" required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} data-testid="input-activity-start" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </div>
                <div>
                  <label htmlFor="activity-end" className="text-xs font-semibold text-foreground">Ends <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <input id="activity-end" type="time" disabled={ongoing} value={endTime} onChange={(event) => { setEndTime(event.target.value); if (event.target.value) setOngoing(false); }} data-testid="input-activity-end" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-45 focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/75 bg-card/55 p-3.5 transition-colors hover:border-primary/35">
                <input type="checkbox" checked={ongoing} onChange={(event) => { setOngoing(event.target.checked); if (event.target.checked) setEndTime(''); }} data-testid="checkbox-activity-ongoing" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Clock3 className="size-3.5 text-primary" strokeWidth={1.8} /> Ongoing activity</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Leave the end open for now.</span>
                </span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/75 bg-card/55 p-3.5 transition-colors hover:border-primary/35">
                <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} data-testid="checkbox-activity-completed" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Check className="size-3.5 text-primary" strokeWidth={2.2} /> Mark as complete</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Completion is always your choice.</span>
                </span>
              </label>
            </div>
            <div>
              <label htmlFor="activity-category" className="text-xs font-semibold text-foreground">Kind <span className="font-normal text-muted-foreground">(optional)</span></label>
              <div className="relative mt-2">
                <select id="activity-category" value={category} onChange={(event) => setCategory(event.target.value as Category | '')} data-testid="select-activity-category" className="min-h-11 w-full appearance-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                   <option value="">Uncategorized</option>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{categoryMeta[item].label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label htmlFor="activity-note" className="text-xs font-semibold text-foreground">A note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="activity-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything future-you should know?" rows={3} data-testid="input-activity-note" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/75 bg-card/55 p-3.5 transition-colors hover:border-primary/35">
                <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} data-testid="checkbox-activity-locked" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><LockKeyhole className="size-3.5 text-primary" strokeWidth={1.8} /> Lock this activity</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Protect it from future planning changes.</span>
                </span>
              </label>
            </div>
            {formError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-activity-form-error">{formError}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
              {editing ? <button type="button" onClick={() => setConfirmAction('delete')} disabled={pending} data-testid="button-delete-activity" className="inline-flex min-h-11 items-center gap-2 self-start text-xs font-semibold text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><Trash2 className="size-3.5" strokeWidth={1.8} /> Remove activity</button> : <span className="text-[11px] text-muted-foreground">You can always move it later.</span>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={requestClose} disabled={pending} data-testid="button-cancel-activity" className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">Cancel</button>
                <button type="submit" disabled={pending} data-testid="button-save-activity" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55">
                  {pending && <LoaderCircle className="size-3.5 animate-spin" />}
                  {editing ? 'Save change' : 'Add activity'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Today() {
  const today = localDate();
  const { user } = useUser();
  const [date, setDate] = useState(today);
  const [now, setNow] = useState(currentMinutes());
  const [timelineView, setTimelineView] = useState<'schedule' | 'completed'>('schedule');
  const [editorActivity, setEditorActivity] = useState<EditorActivity | undefined>(undefined);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [replanningOpen, setReplanningOpen] = useState(false);
  const [changeReviewOpen, setChangeReviewOpen] = useState(false);
  const [acceptedNotice, setAcceptedNotice] = useState('');
  const [deletedActivity, setDeletedActivity] = useState<Activity | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoError, setUndoError] = useState('');
  const deleteTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const userQueryKey = user?.id ?? 'signed-out';
  const activityQueryKey = useMemo(
    () => [...getListActivitiesQueryKey({ date }), userQueryKey],
    [date, userQueryKey],
  );
  const dayLogQueryKey = useMemo(
    () => [...getListActivitiesQueryKey({ date, includeCompleted: true }), userQueryKey],
    [date, userQueryKey],
  );
  const offline = useOfflineActivitySync({
    userId: user?.id,
    date,
    today,
    queryKey: activityQueryKey,
  });
  const serverWake = useServerWakeState();
  const list = useListActivities({ date }, {
    query: {
      // Activity data is private to the active Clerk session. Keep the
      // generated API key shape but add the user to the client cache key so
      // switching accounts cannot reuse the previous user's list.
      queryKey: activityQueryKey,
      enabled: offline.isOnline,
    },
  });
  const dayLogList = useListActivities({ date, includeCompleted: true }, {
    query: {
      queryKey: dayLogQueryKey,
      enabled: offline.isOnline && timelineView === 'completed',
    },
  });
  const taskList = useListTasks();
  const activities = list.data ?? offline.cachedActivities ?? [];
  const scheduleActivities = useMemo(() => activities.filter((activity) => !activity.completed), [activities]);
  const dayLogActivities = dayLogList.data ?? (date === today ? offline.cachedActivities : null) ?? [];
  const plannedActivities = useMemo(
    () => dayLogActivities.filter((activity) => activity.scheduledDate === date),
    [date, dayLogActivities],
  );
  const completedActivities = useMemo(
    () => dayLogActivities.filter((activity) => isOnLocalDate(activity.completedAt, date)),
    [date, dayLogActivities],
  );
  const completedTasks = useMemo(
    () => (taskList.data ?? []).filter((task) => (
      task.status === 'completed'
      && task.repeatIntervalMinutes === null
      && Boolean(task.completedAt)
      && isOnLocalDate(task.completedAt, date)
    )),
    [date, taskList.data],
  );
  const scheduleCompletedTasks = useMemo(
    () => (taskList.data ?? []).filter((task) => (
      task.status === 'completed'
      && Boolean(task.completedAt)
      && isOnLocalDate(task.completedAt, date)
    )),
    [date, taskList.data],
  );
  const hasCachedDay = offline.cachedActivities !== null;
  const timelineLoading = list.isLoading && !hasCachedDay;
  const timelineUnavailable = !list.data && !hasCachedDay && (!offline.isOnline || list.isError);
  const dayLogLoading = dayLogList.isLoading && !dayLogList.data && !(date === today && hasCachedDay);
  const dayLogUnavailable = !dayLogList.data && !(date === today && hasCachedDay) && (!offline.isOnline || dayLogList.isError);
  const activeTimelineLoading = timelineView === 'completed' ? dayLogLoading : timelineLoading;
  const activeTimelineUnavailable = timelineView === 'completed' ? dayLogUnavailable : timelineUnavailable;

  useEffect(() => {
    if (list.data) offline.saveServerSnapshot(list.data);
  }, [list.data, offline.saveServerSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentMinutes()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const completedCount = timelineView === 'completed'
    ? completedActivities.length + completedTasks.length
    : activities.filter((activity) => activity.completed).length + scheduleCompletedTasks.length;
  const nextActivity = useMemo(() => scheduleActivities.filter((activity) => minutesFromTime(activity.startTime) >= now).sort((a, b) => a.startTime.localeCompare(b.startTime))[0], [scheduleActivities, now]);

  function openPlanToday() {
    const hasRemainingSchedule = activities.some((activity) => (
      !activity.completed
      && (activity.endTime === null || minutesFromTime(activity.endTime) > now)
    ));
    if (hasRemainingSchedule) {
      setReplanningOpen(true);
    } else {
      setPlanningOpen(true);
    }
  }

  function openCreate() {
    setEditorActivity(null);
  }

  function openEdit(activity: Activity) {
    setEditorActivity(activity);
  }

  async function refreshAfterMutation() {
    setEditorActivity(undefined);
    await queryClient.invalidateQueries({ queryKey: dayLogQueryKey });
  }

  async function handleAccepted(count: number) {
    await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    setPlanningOpen(false);
    setAcceptedNotice(`${count} ${count === 1 ? 'suggested activity was' : 'suggested activities were'} added to your day.`);
  }

  async function handleReplanningApplied(count: number) {
    await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    setReplanningOpen(false);
    setAcceptedNotice(`${count} ${count === 1 ? 'approved change is' : 'approved changes are'} now part of your day.`);
  }

  function handleDeleted(deleted: Activity) {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    setEditorActivity(undefined);
    setDeletedActivity(deleted);
    setUndoError('');
    deleteTimerRef.current = window.setTimeout(() => {
      setDeletedActivity(null);
      setUndoError('');
      deleteTimerRef.current = null;
    }, 8000);
  }

  async function undoDelete() {
    if (!deletedActivity || undoPending) return;
    const activityToRestore = deletedActivity;
    setUndoPending(true);
    setUndoError('');
    try {
      await offline.save(null, {
        title: activityToRestore.title,
        scheduledDate: activityToRestore.scheduledDate,
        startTime: activityToRestore.startTime,
        endTime: activityToRestore.endTime,
        category: activityToRestore.category,
        completed: activityToRestore.completed,
        locked: activityToRestore.locked,
        pinned: activityToRestore.pinned,
        note: activityToRestore.note,
      });
      await queryClient.invalidateQueries({ queryKey: dayLogQueryKey });
      setDeletedActivity(null);
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
    } catch {
      setUndoError('Could not restore it. You can add the activity again.');
    } finally {
      setUndoPending(false);
    }
  }

  async function toggle(activity: Activity) {
    try {
      await offline.update(activity, { completed: !activity.completed });
      await queryClient.invalidateQueries({ queryKey: dayLogQueryKey });
    } catch {
      // The query remains untouched; the next render keeps the activity available.
    }
  }

  async function saveActivity(activity: Activity | null, data: ActivityInput) {
    await offline.save(activity, data);
    await refreshAfterMutation();
  }

  async function deleteActivity(activity: Activity) {
    await offline.remove(activity);
    await refreshAfterMutation();
  }

  async function wakeAndContinue() {
    const wakeResult = await serverWake.wake();
    if (!wakeResult.ok) return;
    await offline.retry();
    if (!offline.hasPendingChanges) await list.refetch();
  }

  function retryOfflineSync() {
    if (serverWake.state === 'sleeping' || serverWake.state === 'error') {
      void wakeAndContinue();
      return;
    }
    void offline.retry();
    void list.refetch();
  }

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <AppShell>
        <main className="mx-auto w-full max-w-[1180px] px-5 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pb-12 lg:pt-8">
            <div className="mt-5 flex flex-col gap-5 border-b border-border/60 pb-6 sm:mt-7 sm:flex-row sm:items-end sm:justify-between">
              <div className="animate-rise min-w-0">
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">{date === today ? 'Today' : `Log / ${formatShortDate(date)}`}</p>
                <h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.055em]" data-testid="text-current-date">{formatDate(date)}</h1>
              </div>
              <div className="animate-rise delay-1 shrink-0">
                <DateNavigator date={date} today={today} onChange={setDate} />
              </div>
            </div>
            <div className="grid gap-8 pt-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-12 lg:pt-8">
              <section aria-labelledby="timeline-title" className="animate-rise delay-1 min-w-0">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                     <div className="flex items-center gap-3">
                       <h2 id="timeline-title" className="font-display text-[22px] font-semibold tracking-[-0.03em]">Timeline</h2>
                       <div className="flex items-center rounded-full border border-border/70 bg-card/55 p-0.5" role="tablist" aria-label="Timeline view">
                         <button type="button" role="tab" aria-selected={timelineView === 'schedule'} onClick={() => setTimelineView('schedule')} data-testid="tab-timeline-schedule" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${timelineView === 'schedule' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Schedule</button>
                         <button type="button" role="tab" aria-selected={timelineView === 'completed'} onClick={() => setTimelineView('completed')} data-testid="tab-timeline-completed" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${timelineView === 'completed' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Completed{completedCount > 0 ? ` · ${completedCount}` : ''}</button>
                       </div>
                     </div>
                    {completedCount > 0 && <p className="mt-1 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{completedCount} complete</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={openPlanToday} data-testid="button-open-plan-today" className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
                     <Sparkles className="size-3.5" strokeWidth={1.8} />
                      <span className="hidden sm:inline">Plan today</span>
                     <span className="sm:hidden">Plan</span>
                   </button>
                     <button type="button" onClick={() => setChangeReviewOpen(true)} data-testid="button-open-change-review" className="inline-flex items-center gap-2 rounded-full border border-transparent bg-transparent px-2 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Clock3 className="size-3.5" strokeWidth={1.8} />
                      <span className="hidden sm:inline">Review changes</span>
                      <span className="sm:hidden">Review</span>
                    </button>
                   <button type="button" onClick={openCreate} data-testid="button-add-activity" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0">
                    <Plus className="size-3.5" strokeWidth={2.2} />
                    <span className="hidden sm:inline">Add activity</span>
                    <span className="sm:hidden">Add</span>
                   </button>
                  </div>
                </div>
                 {date === today && (
                   <OfflineSyncBanner
                     status={offline.status}
                     errorMessage={offline.errorMessage}
                     hasPendingChanges={offline.hasPendingChanges}
                     hasCachedDay={hasCachedDay}
                     onRetry={retryOfflineSync}
                      onWakeAndContinue={() => void wakeAndContinue()}
                      serverState={serverWake.state}
                   />
                 )}
                  {activeTimelineLoading ? <TimelineSkeleton /> : activeTimelineUnavailable ? (
                  <div className="rounded-[24px] border border-destructive/20 bg-destructive/[0.05] p-6" role="alert" data-testid="status-activities-error">
                    <p className="font-semibold">The timeline took a pause.</p>
                     <p className="mt-1 text-sm leading-6 text-muted-foreground">{offline.isOnline ? 'We could not bring in this day right now. Your plans have not been changed.' : 'This date has not been loaded on this device yet. The current day can be used offline once it has been opened online.'}</p>
                     <button type="button" onClick={retryOfflineSync} disabled={list.isFetching} data-testid="button-retry-activities" className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-50">
                      <RotateCcw className={`size-3.5 ${list.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.8} />
                      Try again
                    </button>
                  </div>
                 ) : timelineView === 'schedule' ? (
                   scheduleActivities.length === 0 ? <EmptyDay onAdd={openCreate} /> : <Timeline activities={scheduleActivities} now={now} onEdit={openEdit} onToggle={(activity) => void toggle(activity)} />
                  ) : taskList.isLoading && plannedActivities.length === 0 && completedActivities.length === 0 ? (
                   <TimelineSkeleton />
                  ) : plannedActivities.length === 0 && completedCount === 0 ? (
                   <div className="rounded-[26px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-14 text-center sm:px-12" data-testid="status-completed-empty">
                     <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-5" strokeWidth={1.8} /></div>
                     <h2 className="mt-5 font-display text-[29px] leading-tight tracking-[-0.03em]">Nothing completed yet.</h2>
                     <p className="mx-auto mt-3 max-w-[360px] text-sm leading-6 text-muted-foreground">Completed activities and tasks will collect here for this date.</p>
                   </div>
                 ) : (
                    <CompletedTimeline plannedActivities={plannedActivities} completedActivities={completedActivities} tasks={completedTasks} now={now} onEdit={openEdit} onToggle={(activity) => void toggle(activity)} />
                 )}
              </section>
                <aside className="animate-rise delay-2 space-y-4 lg:pt-1">
                <div className="rounded-md border border-primary/25 bg-primary/[0.08] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">Next up</span>
                    <ActivityIcon className="size-4 text-primary" strokeWidth={1.7} />
                  </div>
                   <p className="mt-5 font-display text-[21px] font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">{nextActivity ? nextActivity.title : activities.length ? 'No more scheduled items.' : 'No scheduled items.'}</p>
                   <p className="mt-3 font-mono-ui text-[11px] text-muted-foreground">{nextActivity ? `${timeLabel(nextActivity.startTime)}${nextActivity.endTime ? ` · ${timeLabel(nextActivity.endTime)}` : ' · ongoing'}` : 'Open time'}</p>
                </div>
                  <ExecutionGuidancePanel />
              </aside>
            </div>
        </main>
      </AppShell>
      {acceptedNotice && (
        <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)]" role="status" data-testid="status-planning-accepted">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" strokeWidth={2.4} /></span>
            <p className="text-xs font-semibold text-foreground">{acceptedNotice}</p>
          </div>
          <button type="button" onClick={() => setAcceptedNotice('')} aria-label="Dismiss saved suggestion message" data-testid="button-dismiss-planning-accepted" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-3.5" strokeWidth={1.8} />
          </button>
        </div>
      )}
      {deletedActivity && (
        <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)]" role="status" data-testid="status-activity-deleted">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{undoError || `“${deletedActivity.title}” was removed.`}</p>
            {!undoError && <p className="mt-0.5 text-[11px] text-muted-foreground">You can restore it for a few seconds.</p>}
          </div>
          {!undoError && <button type="button" onClick={() => void undoDelete()} disabled={undoPending} data-testid="button-undo-delete" className="min-h-11 shrink-0 rounded-full border border-primary/35 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{undoPending ? 'Restoring…' : 'Undo'}</button>}
        </div>
      )}
      {planningOpen && <PlanningStudio date={date} activities={activities} onClose={() => setPlanningOpen(false)} onAccepted={handleAccepted} />}
      {replanningOpen && <ReplanningStudio date={date} activities={activities} onClose={() => setReplanningOpen(false)} onApplied={handleReplanningApplied} />}
      {changeReviewOpen && <ChangeReviewPanel date={date} onClose={() => setChangeReviewOpen(false)} />}
      {editorActivity !== undefined && <ActivityModal date={date} activity={editorActivity} onClose={() => setEditorActivity(undefined)} onSave={saveActivity} onDelete={deleteActivity} onDeleted={handleDeleted} />}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/today" component={UserPortal} />
        <Route path="/tasks" component={TasksPortal} />
        <Route path="/retention/:id?" component={RetentionPage} />
        <Route path="/settings" component={SettingsPortal} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function AuthLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
      <div>
        <div className="mx-auto size-3 animate-breathe rounded-full bg-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Preparing your private day space…</p>
      </div>
    </div>
  );
}

function Landing() {
  const [, setLocation] = useLocation();

  return (
    <main className="paper-grain flex min-h-[100dvh] items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-[720px]">
        <div className="rounded-md border border-border/75 bg-card/75 p-7 shadow-[0_24px_80px_hsl(205_32%_2%/0.35)] sm:p-10">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-display text-[22px] font-semibold leading-none tracking-[-0.03em]">Day Tripper</p>
            </div>
          </div>
          <p className="mt-14 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Private day planner</p>
          <h1 className="mt-4 max-w-[620px] font-display text-[clamp(2.8rem,7vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.055em]">
            Make room for the day you actually have.
          </h1>
          <p className="mt-7 max-w-[540px] text-[15px] leading-7 text-muted-foreground">
            Keep the next thing close, leave room for what changes, and let your plans remain yours.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button type="button" onClick={() => setLocation('/sign-up')} className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
              Create your day space
            </button>
            <button type="button" onClick={() => setLocation('/sign-in')} className="rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/45 hover:text-primary">
              Sign in
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <AuthLoading />;
  if (isSignedIn) return <Redirect to="/today" />;
  return <Landing />;
}

function UserPortal() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Today />;
}

function TasksPortal() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <TasksPage />;
}

function SettingsPortal() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <SettingsPage />;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to access your private day space',
          },
        },
        signUp: {
          start: {
            title: 'Create your day space',
            subtitle: 'A gentler way to plan what comes next',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AuthenticatedAppShell>
            <Router />
          </AuthenticatedAppShell>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;