import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
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
  useUpdateActivity,
} from '@workspace/api-client-react';
import type { Activity } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

const CATEGORIES = ['focused', 'managing', 'fun', 'social', 'break'] as const;
type Category = (typeof CATEGORIES)[number];
type EditorActivity = Activity | null;

const categoryMeta: Record<Category, { label: string; color: string; soft: string }> = {
  focused: { label: 'Focused', color: 'hsl(var(--primary))', soft: 'hsl(var(--primary) / 0.12)' },
  managing: { label: 'Managing', color: 'hsl(22 62% 53%)', soft: 'hsl(28 72% 84% / 0.62)' },
  fun: { label: 'Fun', color: 'hsl(310 32% 52%)', soft: 'hsl(309 42% 88% / 0.75)' },
  social: { label: 'Social', color: 'hsl(191 50% 42%)', soft: 'hsl(191 48% 84% / 0.66)' },
  break: { label: 'Break', color: 'hsl(45 48% 46%)', soft: 'hsl(46 64% 86% / 0.75)' },
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

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function BrandMark() {
  return (
    <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
      <span className="font-display -mt-0.5">d</span>
      <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
    </div>
  );
}

function Sidebar({ onAdd }: { onAdd: () => void }) {
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

function MobileHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-sidebar px-5 py-4 text-sidebar-foreground lg:hidden">
      <div className="flex items-center gap-3">
        <BrandMark />
        <p className="font-display text-[21px] tracking-[-0.03em]">Day Tripper</p>
      </div>
      <button type="button" onClick={onAdd} aria-label="Add an activity" data-testid="button-mobile-add" className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <Plus className="size-5" strokeWidth={2} />
      </button>
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

function ActivityModal({ date, activity, onClose, onSaved }: { date: string; activity: EditorActivity; onClose: () => void; onSaved: () => void }) {
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState(date);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState('');
  const editing = Boolean(activity);
  const pending = createActivity.isPending || updateActivity.isPending || deleteActivity.isPending;

  useEffect(() => {
    setTitle(activity?.title ?? '');
    setScheduledDate(activity?.scheduledDate ?? date);
    setStartTime(activity?.startTime ?? '09:00');
    setEndTime(activity?.endTime ?? '');
    setCategory(activity?.category && isCategory(activity.category) ? activity.category : '');
    setNote(activity?.note ?? '');
    setConfirmDelete(false);
    setFormError('');
  }, [activity, date]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setFormError('Give this activity a short name first.');
      return;
    }
    setFormError('');
    const payload = {
      title: title.trim(),
      scheduledDate,
      startTime,
      endTime: endTime || null,
      category: category || null,
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
      onSaved();
    } catch {
      setFormError('That did not delete. The activity is still here.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="activity-modal-title" className="paper-grain max-h-[92dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7" data-testid="dialog-activity">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">{editing ? 'Make a change' : 'Add to the day'}</p>
            <h2 id="activity-modal-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">{editing ? 'Adjust the plan.' : 'What belongs here?'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close activity form" data-testid="button-close-activity" className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        {confirmDelete ? (
          <div className="mt-8 rounded-[20px] border border-destructive/25 bg-destructive/[0.06] p-5">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 size-5 text-destructive" strokeWidth={1.7} />
              <div>
                <h3 className="font-semibold">Remove “{activity?.title}”?</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">This will remove it from your day. There is no rush — you can keep it instead.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} data-testid="button-cancel-delete" className="rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-40">Keep activity</button>
              <button type="button" onClick={() => void remove()} disabled={pending} data-testid="button-confirm-delete" className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50">
                {pending && <LoaderCircle className="size-3.5 animate-spin" />}
                Remove it
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
            <div>
              <label htmlFor="activity-title" className="text-xs font-semibold text-foreground">Activity</label>
              <input id="activity-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Call the school" data-testid="input-activity-title" className="mt-2 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <div>
                <label htmlFor="activity-date" className="text-xs font-semibold text-foreground">Date</label>
                <input id="activity-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} data-testid="input-activity-date" className="mt-2 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="activity-start" className="text-xs font-semibold text-foreground">Starts</label>
                  <input id="activity-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} data-testid="input-activity-start" className="mt-2 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </div>
                <div>
                  <label htmlFor="activity-end" className="text-xs font-semibold text-foreground">Ends <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <input id="activity-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} data-testid="input-activity-end" className="mt-2 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="activity-category" className="text-xs font-semibold text-foreground">Kind <span className="font-normal text-muted-foreground">(optional)</span></label>
              <div className="relative mt-2">
                <select id="activity-category" value={category} onChange={(event) => setCategory(event.target.value as Category | '')} data-testid="select-activity-category" className="w-full appearance-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                  <option value="">No label</option>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{categoryMeta[item].label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label htmlFor="activity-note" className="text-xs font-semibold text-foreground">A note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="activity-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything future-you should know?" rows={3} data-testid="input-activity-note" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            {formError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-activity-form-error">{formError}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
              {editing ? <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} data-testid="button-delete-activity" className="inline-flex items-center gap-2 self-start text-xs font-semibold text-destructive hover:underline disabled:opacity-40"><Trash2 className="size-3.5" strokeWidth={1.8} /> Remove activity</button> : <span className="text-[11px] text-muted-foreground">You can always move it later.</span>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={pending} data-testid="button-cancel-activity" className="rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-40">Cancel</button>
                <button type="submit" disabled={pending} data-testid="button-save-activity" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55">
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
  const updateActivity = useUpdateActivity();
  const queryClient = useQueryClient();
  const list = useListActivities({ date }, { query: { queryKey: getListActivitiesQueryKey({ date }) } });
  const activities = list.data ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(currentMinutes()), 60_000);
    return () => window.clearInterval(timer);
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
        <Sidebar onAdd={openCreate} />
        <div className="min-w-0 flex-1">
          <MobileHeader onAdd={openCreate} />
          <main className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
            <header className="animate-rise flex items-center justify-between border-b border-border/60 pb-5">
              <div className="flex items-center gap-2">
                <Circle className="size-2.5 fill-accent text-accent" strokeWidth={0} />
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A private day planner</span>
              </div>
              <span className="hidden text-xs text-muted-foreground/75 sm:block">Take the day as it comes</span>
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
                  <button type="button" onClick={openCreate} data-testid="button-add-activity" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0">
                    <Plus className="size-3.5" strokeWidth={2.2} />
                    <span className="hidden sm:inline">Add activity</span>
                    <span className="sm:hidden">Add</span>
                  </button>
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
      {editorActivity !== undefined && <ActivityModal date={date} activity={editorActivity} onClose={() => setEditorActivity(undefined)} onSaved={() => void refreshAfterMutation()} />}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Today} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;