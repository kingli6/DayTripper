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
  LoaderCircle,
  LockKeyhole,
  Menu,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getListActivitiesQueryKey,
  useCreateActivity,
  useDeleteActivity,
  useGetAiStatus,
  useHealthCheck,
  useListActivities,
  useCreatePlanningProposal,
  useUpdateActivity,
} from '@workspace/api-client-react';
import type { Activity, PlanningProposal } from '@workspace/api-client-react';
import { ChangeReviewPanel } from '@/components/change-review-panel';
import { ReplanningStudio } from '@/components/replanning-studio';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
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
  pinned: boolean;
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

function durationMinutes(activity: Activity) {
  if (!activity.endTime) return null;
  const duration = minutesFromTime(activity.endTime) - minutesFromTime(activity.startTime);
  return duration > 0 ? duration : null;
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
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
    pinned: activity?.pinned ?? false,
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

function Sidebar({ onAdd, onOpenPlanning }: { onAdd: () => void; onOpenPlanning: () => void }) {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col justify-between bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <div>
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <div>
            <p className="font-display text-[22px] leading-none tracking-[-0.03em]">Day Tripper</p>
            <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">a softer daily practice</p>
          </div>
        </div>
        <div className="mt-16">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your space</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]">
            <CalendarDays className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            <span>Today</span>
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </div>
        </div>
        <div className="mt-14 px-3">
          <div className="mb-4 flex size-8 items-center justify-center rounded-full border border-sidebar-primary/35 bg-sidebar-primary/10 text-sidebar-primary">
            <Circle className="size-3.5 fill-current" strokeWidth={1.7} />
          </div>
          <p className="font-display text-[20px] leading-[1.15] text-sidebar-foreground/90">A day can change shape.</p>
          <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/55">Keep the next thing close. Let the rest be allowed to move.</p>
        </div>
      </div>
      <div>
        <button type="button" onClick={onAdd} data-testid="button-sidebar-add" className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-3 py-3 text-sm font-semibold text-sidebar-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0">
          <Plus className="size-4" strokeWidth={2.2} />
          Add to the day
        </button>
        <button type="button" onClick={onOpenPlanning} data-testid="button-sidebar-planning" className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-sidebar-primary/35 px-3 py-3 text-sm font-semibold text-sidebar-foreground transition-colors hover:border-sidebar-primary/70 hover:bg-sidebar-accent">
          <Sparkles className="size-4 text-sidebar-primary" strokeWidth={1.8} />
          Shape the day
        </button>
        <div className="border-t border-sidebar-border/80 px-3 pt-5">
          <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
            <ShieldCheck className="size-3.5 text-sidebar-primary/80" strokeWidth={1.8} />
            <span>Private by design</span>
          </div>
          <p className="mt-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35">Foundation / 01</p>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader({ onAdd, onOpenPlanning }: { onAdd: () => void; onOpenPlanning: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-sidebar px-5 py-4 text-sidebar-foreground lg:hidden">
      <div className="flex items-center gap-3">
        <BrandMark />
        <p className="font-display text-[21px] tracking-[-0.03em]">Day Tripper</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpenPlanning} aria-label="Shape the day with a suggestion" data-testid="button-mobile-planning" className="flex size-10 items-center justify-center rounded-xl border border-sidebar-primary/35 text-sidebar-foreground">
          <Sparkles className="size-4 text-sidebar-primary" strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onAdd} aria-label="Add an activity" data-testid="button-mobile-add" className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <Plus className="size-5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function ApiStatus() {
  const health = useHealthCheck();
  const ai = useGetAiStatus();
  const healthy = Boolean(health.data && !health.isError);
  const aiCopy = ai.isLoading ? 'checking services' : ai.data?.configured ? 'planning services ready' : 'planning services quiet';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground" data-testid="status-service">
      <span className="inline-flex items-center gap-2">
        <span className={`size-2 rounded-full ${health.isLoading ? 'animate-breathe bg-muted-foreground/40' : healthy ? 'bg-primary' : 'bg-destructive'}`} />
        {health.isLoading ? 'connecting' : healthy ? 'day space connected' : 'connection paused'}
      </span>
      <span className="text-border">/</span>
      <span>{aiCopy}</span>
      {health.isError && (
        <button type="button" onClick={() => void health.refetch()} data-testid="button-retry-service" className="font-semibold text-primary underline-offset-4 hover:underline">
          Retry
        </button>
      )}
    </div>
  );
}

function AccountControl() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const label = user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Your account';

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground sm:block">{label}</span>
      <button
        type="button"
        onClick={() => void signOut({ redirectUrl: basePath || '/' })}
        className="rounded-full border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/45 hover:text-primary"
      >
        Sign out
      </button>
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
                {activity.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-secondary-foreground"><Pin className="size-3" strokeWidth={1.8} /> Pinned</span>}
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

function DayDistribution({ activities }: { activities: Activity[] }) {
  const distribution = useMemo(() => {
    const totals = CATEGORIES.map((category) => ({
      category,
      minutes: activities.reduce((total, activity) => (
        activity.category === category ? total + (durationMinutes(activity) ?? 0) : total
      ), 0),
    }));
    const uncategorizedMinutes = activities.reduce((total, activity) => (
      activity.category && isCategory(activity.category) ? total : total + (durationMinutes(activity) ?? 0)
    ), 0);
    const timedMinutes = totals.reduce((total, item) => total + item.minutes, 0) + uncategorizedMinutes;
    const ongoingCount = activities.filter((activity) => activity.endTime === null).length;

    return {
      rows: [
        ...totals.filter((item) => item.minutes > 0),
        ...(uncategorizedMinutes > 0 ? [{ category: 'uncategorized' as const, minutes: uncategorizedMinutes }] : []),
      ],
      timedMinutes,
      ongoingCount,
    };
  }, [activities]);

  return (
    <details open className="group rounded-[22px] border border-border/75 bg-card/65 p-5" data-testid="summary-day-distribution">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-muted-foreground">A quiet mirror</p>
          <h2 className="mt-2 font-display text-[23px] leading-tight tracking-[-0.03em]">How today is distributed</h2>
        </div>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" strokeWidth={1.8} />
      </summary>
      <div className="mt-5 border-t border-border/60 pt-4">
        {distribution.timedMinutes > 0 ? (
          <div className="space-y-3" role="list" aria-label="Timed activity distribution">
            {distribution.rows.map((row) => {
              const isUncategorized = row.category === 'uncategorized';
              const meta = isUncategorized ? null : categoryMeta[row.category];
              const percentage = Math.round((row.minutes / distribution.timedMinutes) * 100);
              return (
                <div key={row.category} role="listitem" data-testid={`distribution-row-${row.category}`}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta?.color ?? 'hsl(var(--muted-foreground))' }} aria-hidden="true" />
                      <span>{meta?.label ?? 'Uncategorized'}</span>
                    </span>
                    <span className="shrink-0 font-mono-ui text-[10px] text-muted-foreground">{durationLabel(row.minutes)} · {percentage}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: meta?.color ?? 'hsl(var(--muted-foreground))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground" data-testid="status-distribution-empty">
            No fixed durations to mirror yet. Open time is still part of the day.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[11px] leading-5 text-muted-foreground">
          <span>{distribution.timedMinutes ? `${durationLabel(distribution.timedMinutes)} with an end time` : 'No fixed durations recorded'}</span>
          {distribution.ongoingCount > 0 && (
            <>
              <span className="text-border" aria-hidden="true">/</span>
              <span data-testid="text-distribution-ongoing">{distribution.ongoingCount} ongoing {distribution.ongoingCount === 1 ? 'activity' : 'activities'} kept separate</span>
            </>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground/75">This only reflects the schedule you entered. It is not a target or a measure of how the day should look.</p>
      </div>
    </details>
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
  const [intention, setIntention] = useState('');
  const [currentTime, setCurrentTime] = useState(currentTimeValue());
  const [availableStart, setAvailableStart] = useState('09:00');
  const [availableEnd, setAvailableEnd] = useState('17:00');
  const [planningStyle, setPlanningStyle] = useState<'lighter' | 'balanced' | 'fuller'>('balanced');
  const [fixedCommitments, setFixedCommitments] = useState('');
  const [useHistoricalContext, setUseHistoricalContext] = useState(false);
  const [historicalContext, setHistoricalContext] = useState('');
  const [proposal, setProposal] = useState<PlanningProposal | null>(null);
  const [reviewItems, setReviewItems] = useState<ProposalReviewItem[]>([]);
  const [formError, setFormError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const lockedActivities = activities.filter((activity) => activity.locked);
  const pending = createPlanningProposal.isPending;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => intentionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intention.trim()) {
      setFormError('Tell the planner what you would like the day to hold.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(currentTime) || !/^\d{2}:\d{2}$/.test(availableStart) || !/^\d{2}:\d{2}$/.test(availableEnd)) {
      setFormError('Choose valid times for the planning context.');
      return;
    }
    if (minutesFromTime(availableEnd) <= minutesFromTime(availableStart)) {
      setFormError('The open-time window needs to end after it starts.');
      return;
    }

    setFormError('');
    setProposal(null);
    try {
      const result = await createPlanningProposal.mutateAsync({
        data: {
          intention: intention.trim(),
          currentDate: date,
          currentTime,
          availableTime: [{ startTime: availableStart, endTime: availableEnd }],
          planningStyle,
          fixedCommitments: fixedCommitments.trim() || null,
          useHistoricalContext,
          historicalContext: useHistoricalContext ? historicalContext.trim() || null : null,
        },
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

  function returnToIntention() {
    setProposal(null);
    setReviewItems([]);
    setReviewError('');
    setFormError('');
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
            <h2 id="planning-studio-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">Shape a possible day.</h2>
            <p id="planning-studio-description" className="mt-2 max-w-[550px] text-sm leading-6 text-muted-foreground">Describe what matters. Day Tripper will return a proposal to review, without changing the schedule you already saved.</p>
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
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
            <div>
              <label htmlFor="planning-intention" className="text-xs font-semibold text-foreground">What would you like the day to hold?</label>
              <textarea ref={intentionRef} id="planning-intention" required value={intention} onChange={(event) => setIntention(event.target.value)} placeholder="I have work, groceries, dinner, and I would like some time to recover." rows={4} data-testid="input-planning-intention" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
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
            <details className="rounded-[18px] border border-border/75 bg-card/55 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">Use previous notes for this proposal</summary>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Only notes you explicitly include here will be sent as historical context.</p>
              <label className="mt-3 flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={useHistoricalContext} onChange={(event) => setUseHistoricalContext(event.target.checked)} data-testid="checkbox-planning-history" className="size-4 accent-[hsl(var(--primary))]" />
                Include approved context
              </label>
              {useHistoricalContext && <textarea value={historicalContext} onChange={(event) => setHistoricalContext(event.target.value)} placeholder="What should the planner know from a previous day?" rows={3} data-testid="input-planning-history" className="mt-3 w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />}
            </details>
            {formError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-planning-error">{formError}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[330px] text-[11px] leading-5 text-muted-foreground">Planning needs an internet connection. It creates a proposal only; your saved schedule will not change automatically.</p>
              <button type="submit" disabled={pending} data-testid="button-create-planning-proposal" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55">
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

function ActivityModal({ date, activity, onClose, onSaved, onDeleted }: { date: string; activity: EditorActivity; onClose: () => void; onSaved: () => void; onDeleted: (activity: Activity) => void }) {
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
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
  const [pinned, setPinned] = useState(false);
  const [note, setNote] = useState('');
  const [initialDraft, setInitialDraft] = useState<ActivityDraft>(() => draftFromActivity(activity, date));
  const [confirmAction, setConfirmAction] = useState<'delete' | 'discard' | null>(null);
  const [formError, setFormError] = useState('');
  const editing = Boolean(activity);
  const pending = createActivity.isPending || updateActivity.isPending || deleteActivity.isPending;

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
    setPinned(nextDraft.pinned);
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
    pinned,
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
      pinned,
      note: note.trim() || null,
    };
    try {
      if (activity) {
        await updateActivity.mutateAsync({ id: activity.id, data: payload });
      } else {
        await createActivity.mutateAsync({ data: payload });
      }
      onSaved();
    } catch {
      setFormError('That did not save. Check the connection and try again.');
    }
  }

  async function remove() {
    if (!activity) return;
    try {
      await deleteActivity.mutateAsync({ id: activity.id });
      onDeleted(activity);
    } catch {
      setFormError('That did not delete. The activity is still here.');
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/75 bg-card/55 p-3.5 transition-colors hover:border-primary/35">
                <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} data-testid="checkbox-activity-locked" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><LockKeyhole className="size-3.5 text-primary" strokeWidth={1.8} /> Lock this activity</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Protect it from future planning changes.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/75 bg-card/55 p-3.5 transition-colors hover:border-primary/35">
                <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} data-testid="checkbox-activity-pinned" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Pin className="size-3.5 text-primary" strokeWidth={1.8} /> Pin for reuse</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Keep this activity marked as a reusable template.</span>
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
  const [date, setDate] = useState(today);
  const [now, setNow] = useState(currentMinutes());
  const [editorActivity, setEditorActivity] = useState<EditorActivity | undefined>(undefined);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [replanningOpen, setReplanningOpen] = useState(false);
  const [changeReviewOpen, setChangeReviewOpen] = useState(false);
  const [acceptedNotice, setAcceptedNotice] = useState('');
  const [deletedActivity, setDeletedActivity] = useState<Activity | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoError, setUndoError] = useState('');
  const deleteTimerRef = useRef<number | null>(null);
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const queryClient = useQueryClient();
  const list = useListActivities({ date }, { query: { queryKey: getListActivitiesQueryKey({ date }) } });
  const activities = list.data ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentMinutes()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const completedCount = activities.filter((activity) => activity.completed).length;
  const nextActivity = useMemo(() => activities.filter((activity) => !activity.completed && minutesFromTime(activity.startTime) >= now).sort((a, b) => a.startTime.localeCompare(b.startTime))[0], [activities, now]);

  function openCreate() {
    setEditorActivity(null);
  }

  function openEdit(activity: Activity) {
    setEditorActivity(activity);
  }

  async function refreshAfterMutation() {
    await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    setEditorActivity(undefined);
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
    void queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
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
      await createActivity.mutateAsync({
        data: {
          title: activityToRestore.title,
          scheduledDate: activityToRestore.scheduledDate,
          startTime: activityToRestore.startTime,
          endTime: activityToRestore.endTime,
          category: activityToRestore.category,
          completed: activityToRestore.completed,
          locked: activityToRestore.locked,
          pinned: activityToRestore.pinned,
          note: activityToRestore.note,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
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
      await updateActivity.mutateAsync({ id: activity.id, data: { completed: !activity.completed } });
      await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    } catch {
      // The query remains untouched; the next render keeps the activity available.
    }
  }

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-28 size-[430px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-180px] left-[25%] size-[420px] rounded-full bg-secondary/35 blur-3xl" />
      <div className="relative flex min-h-[100dvh]">
        <Sidebar onAdd={openCreate} onOpenPlanning={() => setPlanningOpen(true)} />
        <div className="min-w-0 flex-1">
          <MobileHeader onAdd={openCreate} onOpenPlanning={() => setPlanningOpen(true)} />
          <main className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
            <header className="animate-rise flex items-center justify-between border-b border-border/60 pb-5">
              <div className="flex items-center gap-2">
                <Circle className="size-2.5 fill-accent text-accent" strokeWidth={0} />
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A private day planner</span>
              </div>
               <div className="flex items-center gap-3">
                 <span className="hidden text-xs text-muted-foreground/75 md:block">Take the day as it comes</span>
                 <AccountControl />
               </div>
            </header>
            <div className="mt-9 flex flex-col gap-6 border-b border-border/60 pb-8 sm:mt-12 sm:flex-row sm:items-end sm:justify-between">
              <div className="animate-rise min-w-0">
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">{date === today ? 'Today' : 'Looking back'}</p>
                <h1 className="mt-3 font-display text-[clamp(3rem,7vw,5.8rem)] leading-[0.9] tracking-[-0.065em]" data-testid="text-current-date">{formatDate(date)}</h1>
                <p className="mt-5 max-w-[480px] text-[15px] leading-7 text-muted-foreground">{date === today ? 'See what is next, leave room for what is not planned, and let the day be a day.' : `A quiet view of ${formatShortDate(date)}. Plans can be revisited without catching up.`}</p>
              </div>
              <div className="animate-rise delay-1 shrink-0">
                <DateNavigator date={date} today={today} onChange={setDate} />
              </div>
            </div>
            <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16 lg:pt-10">
              <section aria-labelledby="timeline-title" className="animate-rise delay-1 min-w-0">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 id="timeline-title" className="font-display text-[27px] tracking-[-0.035em]">The shape of things</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{completedCount ? `${completedCount} already held` : 'Nothing needs to be finished to make this day count.'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                   <button type="button" onClick={() => setReplanningOpen(true)} data-testid="button-open-replanning" className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/[0.08] px-4 py-2.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                     <RotateCcw className="size-3.5" strokeWidth={1.8} />
                     <span className="hidden sm:inline">Re-plan the rest</span>
                     <span className="sm:hidden">Re-plan</span>
                   </button>
                   <button type="button" onClick={() => setPlanningOpen(true)} data-testid="button-open-planning" className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
                     <Sparkles className="size-3.5" strokeWidth={1.8} />
                     <span className="hidden sm:inline">Shape the day</span>
                     <span className="sm:hidden">Plan</span>
                   </button>
                    <button type="button" onClick={() => setChangeReviewOpen(true)} data-testid="button-open-change-review" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                {list.isLoading ? <TimelineSkeleton /> : list.isError ? (
                  <div className="rounded-[24px] border border-destructive/20 bg-destructive/[0.05] p-6" role="alert" data-testid="status-activities-error">
                    <p className="font-semibold">The timeline took a pause.</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">We could not bring in this day right now. Your plans have not been changed.</p>
                    <button type="button" onClick={() => void list.refetch()} disabled={list.isFetching} data-testid="button-retry-activities" className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-50">
                      <RotateCcw className={`size-3.5 ${list.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.8} />
                      Try again
                    </button>
                  </div>
                ) : activities.length === 0 ? <EmptyDay onAdd={openCreate} /> : <Timeline activities={activities} now={now} onEdit={openEdit} onToggle={(activity) => void toggle(activity)} />}
              </section>
               <aside className="animate-rise delay-2 space-y-4 lg:pt-1">
                 <DayDistribution activities={activities} />
                <div className="rounded-[24px] border border-primary/15 bg-primary p-5 text-primary-foreground shadow-[0_20px_50px_hsl(177_28%_39%/0.14)]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary-foreground/65">A little orientation</span>
                    <ActivityIcon className="size-4 text-secondary" strokeWidth={1.7} />
                  </div>
                  <p className="mt-8 font-display text-[27px] leading-[1.04] tracking-[-0.035em]">{nextActivity ? `Next: ${nextActivity.title}` : activities.length ? 'You have reached the edge of the plan.' : 'There is nothing to catch up on.'}</p>
                  <p className="mt-4 text-sm leading-6 text-primary-foreground/70">{nextActivity ? `${timeLabel(nextActivity.startTime)}${nextActivity.endTime ? ` · until ${timeLabel(nextActivity.endTime)}` : ' · ongoing'}` : 'Open time is not an empty result. It is time you can use, share, or simply leave alone.'}</p>
                </div>
                <div className="rounded-[22px] border border-border/75 bg-card/65 p-5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Cloud className="size-4 text-primary" strokeWidth={1.7} />
                    <span className="font-mono-ui text-[10px] uppercase tracking-[0.15em]">Held lightly</span>
                  </div>
                  <p className="mt-4 font-display text-[21px] leading-[1.15] tracking-[-0.025em]">Plans are a place to return to, not a test to pass.</p>
                  <ApiStatus />
                </div>
              </aside>
            </div>
            <footer className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-5 text-[11px] text-muted-foreground/75 sm:flex-row sm:items-center sm:justify-between">
              <p data-testid="text-privacy-note">Your day stays yours. No scores, streaks, or performance signals here.</p>
              <span className="font-mono-ui text-[9px] uppercase tracking-[0.15em]">Day Tripper / Today</span>
            </footer>
          </main>
        </div>
      </div>
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
      {editorActivity !== undefined && <ActivityModal date={date} activity={editorActivity} onClose={() => setEditorActivity(undefined)} onSaved={() => void refreshAfterMutation()} onDeleted={handleDeleted} />}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/today" component={UserPortal} />
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
        <div className="rounded-[32px] border border-border/75 bg-card/75 p-7 shadow-[0_24px_80px_hsl(205_32%_20%/0.08)] sm:p-12">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-display text-[22px] leading-none tracking-[-0.03em]">Day Tripper</p>
              <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-muted-foreground">a softer daily practice</p>
            </div>
          </div>
          <p className="mt-16 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">A private day planner</p>
          <h1 className="mt-4 max-w-[620px] font-display text-[clamp(3rem,8vw,6.4rem)] leading-[0.9] tracking-[-0.065em]">
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
          <Router />
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