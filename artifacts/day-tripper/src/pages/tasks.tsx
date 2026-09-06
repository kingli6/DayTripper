import { zodResolver } from '@hookform/resolvers/zod';
import {
  getListActivitiesQueryKey,
  getListTasksQueryKey,
  useArchiveTask,
  useCompleteTask,
  useCreateTask,
  useListTasks,
  useRecommendTasks,
  useScheduleTask,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { Task, TaskInput, TaskScheduleInput, TaskUpdate } from '@workspace/api-client-react';
import { Archive, Check, Clock3, ListTodo, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'wouter';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Give this task a short title.').max(200, 'Keep the title under 200 characters.'),
  notes: z.string().max(2000, 'Keep notes under 2,000 characters.'),
  importance: z.preprocess((value) => Number(value), z.number().int().min(1).max(5)),
  urgency: z.preprocess((value) => Number(value), z.number().int().min(1).max(5)),
  energyRequired: z.preprocess((value) => Number(value), z.number().int().min(1).max(5)),
  interest: z.preprocess((value) => Number(value), z.number().int().min(1).max(5)),
  estimatedMinutes: z.preprocess((value) => Number(value), z.number().int().min(1).max(1440)),
  deadline: z.string(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

type RecommendationInputs = {
  availableMinutes: number;
  energy: number;
};

type RecommendationResult = {
  taskId: number;
  rank: number;
  reason: string;
};

type QuadrantKey = 'importantUrgent' | 'importantNotUrgent' | 'notImportantUrgent' | 'notImportantNotUrgent';

const QUADRANTS: Array<{ key: QuadrantKey; title: string; description: string; tone: string }> = [
  { key: 'importantUrgent', title: 'Important + Urgent', description: 'Do next', tone: 'border-primary/35 bg-primary/[0.07]' },
  { key: 'importantNotUrgent', title: 'Important + Not urgent', description: 'Make room for', tone: 'border-accent/35 bg-accent/[0.08]' },
  { key: 'notImportantUrgent', title: 'Not important + Urgent', description: 'Keep contained', tone: 'border-secondary-foreground/15 bg-secondary/40' },
  { key: 'notImportantNotUrgent', title: 'Not important + Not urgent', description: 'Later, if useful', tone: 'border-border/70 bg-card/60' },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'That change could not be saved. Try again.';
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(deadline));
}

function formatCompactDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(deadline));
}

function focusScore(task: Task) {
  return task.importance + task.urgency + task.interest - task.energyRequired;
}

function quadrantKey(task: Task): QuadrantKey {
  if (task.importance >= 3 && task.urgency >= 3) return 'importantUrgent';
  if (task.importance >= 3) return 'importantNotUrgent';
  if (task.urgency >= 3) return 'notImportantUrgent';
  return 'notImportantNotUrgent';
}

function quadrantTitle(task: Task) {
  return QUADRANTS.find((quadrant) => quadrant.key === quadrantKey(task))?.title ?? 'Task';
}

function deadlineDaysAway(deadline: string) {
  return (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

function deadlineScore(task: Task) {
  if (!task.deadline) return 0;
  const days = deadlineDaysAway(task.deadline);
  if (days < 0) return 22;
  if (days <= 1) return 18;
  if (days <= 3) return 13;
  if (days <= 7) return 8;
  return 3;
}

function timeFitScore(task: Task, availableMinutes: number) {
  const ratio = task.estimatedMinutes / Math.max(1, availableMinutes);
  if (ratio <= 1) return 16 - Math.min(4, ((1 - ratio) * 4));
  if (ratio <= 1.5) return 5;
  return -12;
}

function recommendationScore(task: Task, inputs: RecommendationInputs) {
  const priority = task.importance * 4 + task.urgency * 4;
  const energyFit = 12 - Math.abs(task.energyRequired - inputs.energy) * 3;
  return priority + deadlineScore(task) + timeFitScore(task, inputs.availableMinutes) + energyFit;
}

function deadlineReason(task: Task) {
  if (!task.deadline) return '';
  const days = deadlineDaysAway(task.deadline);
  if (days < 0) return 'Its deadline has passed';
  if (days <= 1) return 'Its deadline is close';
  if (days <= 3) return 'Its deadline is within three days';
  if (days <= 7) return 'Its deadline is within a week';
  return '';
}

function recommendationExplanation(task: Task, inputs: RecommendationInputs) {
  const reasons: string[] = [];
  if (task.importance >= 3 && task.urgency >= 3) reasons.push('High priority and urgent');
  else if (task.importance >= 4) reasons.push('It carries important work');
  else if (task.urgency >= 4) reasons.push('It is time-sensitive');

  const dueReason = deadlineReason(task);
  if (dueReason) reasons.push(dueReason);

  if (task.estimatedMinutes <= inputs.availableMinutes) {
    reasons.push(`Its ${task.estimatedMinutes}-minute estimate fits your available time`);
  } else {
    reasons.push(`It is the strongest fit despite needing ${task.estimatedMinutes} minutes`);
  }

  if (Math.abs(task.energyRequired - inputs.energy) <= 1) {
    reasons.push('Its energy need matches your current energy');
  } else if (task.energyRequired < inputs.energy) {
    reasons.push('Its energy need is manageable right now');
  }

  const selected = reasons.slice(0, 3);
  return `${selected.join('. ')}${selected.length ? '.' : 'A balanced fit across priority, time, energy, and deadline.'}`;
}

function deterministicRecommendations(tasks: Task[], inputs: RecommendationInputs) {
  return tasks
    .map((task) => ({
      task,
      score: recommendationScore(task, inputs),
      explanation: recommendationExplanation(task, inputs),
    }))
    .sort((first, second) => second.score - first.score || focusScore(second.task) - focusScore(first.task) || first.task.id - second.task.id)
    .slice(0, 3);
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeFromMinutes(minutes: number) {
  return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`;
}

function defaultScheduleStart(estimatedMinutes: number) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedMinutes = Math.ceil(currentMinutes / 15) * 15;
  const candidate = roundedMinutes < 24 * 60 ? roundedMinutes : 9 * 60;
  return candidate + estimatedMinutes < 24 * 60 ? timeFromMinutes(candidate) : '09:00';
}

function TaskRail() {
  return (
    <aside className="hidden w-[220px] shrink-0 bg-sidebar px-3 py-5 text-sidebar-foreground lg:block">
      <div>
        <Link href="/today" className="flex items-center gap-2.5 px-2" data-testid="link-tasks-brand">
          <div aria-hidden="true" className="relative flex size-8 shrink-0 items-center justify-center rounded-xl border border-sidebar-primary/40 bg-sidebar-primary/15 text-base font-semibold text-sidebar-primary">
            <span className="font-display -mt-0.5">d</span>
            <span className="absolute bottom-[5px] right-[5px] size-1.5 rounded-full bg-sidebar-primary" />
          </div>
          <div>
            <p className="font-display text-[19px] leading-none tracking-[-0.03em]">Day Tripper</p>
          </div>
        </Link>
        <nav className="mt-10" aria-label="Private space">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your space</p>
          <Link href="/today" className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-today">
            <span className="size-3.5 rounded-full border border-sidebar-primary" />
            Today
          </Link>
          <Link href="/tasks" className="mt-1 flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]" data-testid="link-tasks-tasks">
            <ListTodo className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            Tasks
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </Link>
          <Link href="/board" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-board">
            <span className="size-3.5 rounded border border-sidebar-primary" />
            Board
          </Link>
          <Link href="/retention" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-practices">
            <span className="size-3.5 rounded-full border border-sidebar-primary" />
            Practices
          </Link>
        </nav>
      </div>
    </aside>
  );
}

function TaskForm({
  task,
  pending,
  onSubmit,
  onCancel,
  compactCreate = false,
}: {
  task?: Task;
  pending: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel?: () => void;
  compactCreate?: boolean;
}) {
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? '',
      notes: task?.notes ?? '',
      importance: task?.importance ?? 3,
      urgency: task?.urgency ?? 3,
      energyRequired: task?.energyRequired ?? 3,
      interest: task?.interest ?? 3,
      estimatedMinutes: task?.estimatedMinutes ?? 30,
      deadline: task?.deadline ? task.deadline.slice(0, 16) : '',
    },
  });

  const [showDetails, setShowDetails] = useState(Boolean(task));
  const titleField = (
    <FormField control={form.control} name="title" render={({ field }) => (
      <FormItem className={compactCreate ? 'min-w-0 flex-1' : undefined}>
        <FormLabel className={compactCreate ? 'sr-only' : 'text-xs font-semibold text-foreground'}>{compactCreate ? 'Task title' : 'What do you want to work on?'}</FormLabel>
        <FormControl><input {...field} autoFocus={!task} maxLength={200} placeholder={compactCreate ? 'What needs to be done?' : 'A clear next action'} data-testid="input-task-title" className={`flex w-full border border-input bg-background/70 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15 ${compactCreate ? 'h-11 rounded-lg px-3.5' : 'h-12 rounded-xl px-4'}`} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
  const detailFields = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['importance', 'Importance', 'How much does it matter?'],
          ['urgency', 'Urgency', 'How soon does it matter?'],
          ['energyRequired', 'Energy needed', 'How demanding will it feel?'],
          ['interest', 'Interest', 'How much do you want to do it?'],
        ] as const).map(([name, label, description]) => (
          <FormField key={name} control={form.control} name={name} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">{label}</FormLabel>
              <FormControl><input {...field} type="number" min={1} max={5} step={1} inputMode="numeric" data-testid={`input-task-${name}`} className="flex h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
              {!compactCreate && <FormDescription className="text-[11px] leading-4">{description} 1–5.</FormDescription>}
              <FormMessage />
            </FormItem>
          )} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField control={form.control} name="estimatedMinutes" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs font-semibold text-foreground">Estimated minutes</FormLabel>
            <FormControl><input {...field} type="number" min={1} max={1440} step={1} inputMode="numeric" data-testid="input-task-estimated-minutes" className="flex h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="deadline" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs font-semibold text-foreground">Deadline <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
            <FormControl><input {...field} type="datetime-local" data-testid="input-task-deadline" className="flex h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <FormField control={form.control} name="notes" render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs font-semibold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
          <FormControl><textarea {...field} maxLength={2000} rows={2} placeholder="Anything that helps you start." data-testid="textarea-task-notes" className="w-full resize-none rounded-lg border border-input bg-background/70 px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </>
  );

  if (compactCreate) {
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => onSubmit({ ...values, title: values.title.trim(), notes: values.notes.trim() }))} className="space-y-3" data-testid="form-create-task">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            {titleField}
            <button type="submit" disabled={pending} data-testid="button-save-task" className="min-h-11 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
              {pending ? 'Adding…' : 'Add'}
            </button>
          </div>
          <button type="button" onClick={() => setShowDetails((open) => !open)} aria-expanded={showDetails} data-testid="button-toggle-task-details" className="text-[11px] font-semibold text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
            {showDetails ? 'Hide details' : 'More details'}
          </button>
          {showDetails && <div className="rounded-lg border border-border/60 bg-background/35 p-3">{detailFields}</div>}
          {form.formState.errors.root?.message && <p className="rounded-lg bg-destructive/[0.07] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-task-form-error">{form.formState.errors.root.message}</p>}
        </form>
      </Form>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit({ ...values, title: values.title.trim(), notes: values.notes.trim() }))} className="space-y-5" data-testid={task ? `form-edit-task-${task.id}` : 'form-create-task'}>
        {titleField}
        {detailFields}
        {form.formState.errors.root?.message && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-task-form-error">{form.formState.errors.root.message}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
          {onCancel && <button type="button" onClick={onCancel} disabled={pending} data-testid="button-cancel-task" className="min-h-11 rounded-full border border-border px-5 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/45 hover:text-foreground disabled:opacity-50">Cancel</button>}
          <button type="submit" disabled={pending} data-testid="button-save-task" className="min-h-11 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
            {pending ? 'Saving…' : task ? 'Save changes' : 'Add task'}
          </button>
        </div>
      </form>
    </Form>
  );
}

const TASK_COMPLETION_HOLD_MS = 3000;

function TaskItem({ task, onEdit, onComplete, onArchive, pending }: { task: Task; onEdit: () => void; onComplete: () => void; onArchive: () => void; pending: boolean }) {
  const holdTimerRef = useRef<number | null>(null);
  const holdAnimationRef = useRef<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const cancelHold = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (holdAnimationRef.current !== null) window.cancelAnimationFrame(holdAnimationRef.current);
    holdTimerRef.current = null;
    holdAnimationRef.current = null;
    setHoldProgress(0);
    setIsHolding(false);
  };

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (holdAnimationRef.current !== null) window.cancelAnimationFrame(holdAnimationRef.current);
  }, []);

  const startHold = () => {
    if (pending || holdTimerRef.current !== null) return;
    const startedAt = performance.now();
    setIsHolding(true);
    setHoldProgress(0);

    const updateProgress = () => {
      const progress = Math.min(100, ((performance.now() - startedAt) / TASK_COMPLETION_HOLD_MS) * 100);
      setHoldProgress(progress);
      if (progress < 100) holdAnimationRef.current = window.requestAnimationFrame(updateProgress);
    };
    holdAnimationRef.current = window.requestAnimationFrame(updateProgress);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (holdAnimationRef.current !== null) window.cancelAnimationFrame(holdAnimationRef.current);
      holdAnimationRef.current = null;
      setHoldProgress(100);
      setIsHolding(false);
      onComplete();
    }, TASK_COMPLETION_HOLD_MS);
  };

  return (
    <article className="group border-b border-border/65 py-3 first:border-t" data-testid={`card-task-${task.id}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onPointerDown={(event) => { event.preventDefault(); startHold(); }}
          onPointerUp={cancelHold}
          onPointerCancel={cancelHold}
          onPointerLeave={cancelHold}
          onClick={(event) => { event.preventDefault(); }}
          onContextMenu={(event) => event.preventDefault()}
          disabled={pending}
          aria-label={`Hold for 3 seconds to complete ${task.title}`}
          title={isHolding ? 'Keep holding to complete' : 'Hold for 3 seconds to complete'}
          data-testid={`button-complete-task-${task.id}`}
          className={`relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-transparent transition-colors disabled:opacity-40 ${isHolding ? 'border-primary bg-primary/10 text-primary' : 'border-primary/45 hover:bg-primary hover:text-primary-foreground'}`}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-primary/80" style={{ width: `${holdProgress}%` }} />
          <Check className="relative size-3" strokeWidth={2.4} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-edit-task-${task.id}`} className="min-w-0 truncate text-left text-sm font-semibold text-foreground hover:text-primary">
            <span data-testid={`text-task-title-${task.id}`}>{task.title}</span>
          </button>
          <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-hidden text-[10px] text-muted-foreground" data-testid={`meta-task-${task.id}`}>
            <span title={`Estimated ${task.estimatedMinutes} minutes`}>{task.estimatedMinutes}m</span>
            <span title={`Energy required ${task.energyRequired} out of 5`}>E{task.energyRequired}</span>
            <span title={`Interest ${task.interest} out of 5`}>I{task.interest}</span>
            <span title={`Priority ${task.importance + task.urgency} out of 10`}>P{task.importance + task.urgency}</span>
            {task.deadline && <span title={`Deadline ${formatDeadline(task.deadline)}`}>Due {formatCompactDeadline(task.deadline)}</span>}
          </div>
        </div>
        <button type="button" onClick={onArchive} disabled={pending} aria-label={`Archive ${task.title}`} title="Archive task" data-testid={`button-archive-task-${task.id}`} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
          <Archive className="size-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </article>
  );
}

function MatrixTaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="flex w-full items-center justify-between gap-3 border-b border-border/55 px-1 py-2 text-left text-xs transition-colors last:border-0 hover:text-primary" data-testid={`card-matrix-task-${task.id}`}>
      <p className="min-w-0 truncate font-medium text-foreground">{task.title}</p>
      <span className="shrink-0 text-[10px] text-muted-foreground" title={`Estimated ${task.estimatedMinutes} minutes, priority ${task.importance + task.urgency} out of 10`}>{task.estimatedMinutes}m · P{task.importance + task.urgency}</span>
    </button>
  );
}

function RecommendationCard({ rank, task, explanation, onEdit, onSchedule }: { rank: number; task: Task; explanation: string; onEdit: () => void; onSchedule: () => void }) {
  return (
    <article className="border-b border-border/55 py-2.5 last:border-0" data-testid={`card-recommendation-${task.id}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-4 shrink-0 text-sm font-semibold text-primary">{rank}</span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" data-testid={`button-edit-recommendation-${task.id}`}>
          <div className="flex min-w-0 items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{task.title}</p>
            <span className="shrink-0 text-[10px] text-muted-foreground">{task.estimatedMinutes}m · {quadrantTitle(task)}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{explanation}</p>
        </button>
        <button type="button" onClick={onSchedule} data-testid={`button-schedule-task-${task.id}`} className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="hidden sm:inline">Work on this</span>
          <span className="sm:hidden">Work</span>
        </button>
      </div>
    </article>
  );
}

function ScheduleTaskModal({ task, pending, onSchedule, onClose }: {
  task: Task;
  pending: boolean;
  onSchedule: (data: TaskScheduleInput) => Promise<void>;
  onClose: () => void;
}) {
  const [startTime, setStartTime] = useState(() => defaultScheduleStart(task.estimatedMinutes));
  const [durationMinutes, setDurationMinutes] = useState(task.estimatedMinutes);
  const [formError, setFormError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = /^\d{2}:\d{2}$/.test(startTime) && hours <= 23 && minutes <= 59
      ? hours * 60 + minutes
      : null;

    if (startMinutes === null) {
      setFormError('Choose a valid start time.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1439) {
      setFormError('Choose a duration between 1 and 1,439 minutes.');
      return;
    }
    if (startMinutes + durationMinutes >= 24 * 60) {
      setFormError('This work session needs to finish before midnight. Choose an earlier start or a shorter duration.');
      return;
    }

    setFormError('');
    try {
      await onSchedule({
        scheduledDate: localDate(),
        startTime,
        durationMinutes,
      });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  const endMinutes = /^\d{2}:\d{2}$/.test(startTime) && Number.isInteger(durationMinutes)
    ? startTime.split(':').map(Number)[0] * 60 + startTime.split(':').map(Number)[1] + durationMinutes
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="schedule-task-title" aria-describedby="schedule-task-description" className="paper-grain w-full max-w-[520px] rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7" data-testid={`dialog-schedule-task-${task.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Schedule into Today</p>
            <h2 id="schedule-task-title" className="mt-2 font-display text-[31px] leading-none tracking-[-0.04em]">Make room to begin.</h2>
            <p id="schedule-task-description" className="mt-3 text-sm leading-6 text-muted-foreground">Choose a simple work block. The task will stay active until you complete it.</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close schedule task dialog" data-testid="button-close-schedule-task" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
          <p className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-primary">Work block</p>
          <p className="mt-2 text-[15px] font-semibold leading-6 text-foreground" data-testid={`text-schedule-task-title-${task.id}`}>{task.title}</p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-foreground">
              Starts
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} disabled={pending} data-testid="input-schedule-start" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-55" />
            </label>
            <label className="text-xs font-semibold text-foreground">
              Duration
              <div className="relative mt-2">
                <input type="number" min={1} max={1439} step={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} disabled={pending} data-testid="input-schedule-duration" className="min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 pr-16 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-55" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-normal text-muted-foreground">minutes</span>
              </div>
            </label>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{endMinutes !== null && endMinutes < 24 * 60 ? `This block will end at ${timeFromMinutes(endMinutes)}.` : 'Choose a start and duration that fit within Today.'}</p>
          {formError && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-schedule-task-error">{formError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} data-testid="button-cancel-schedule-task" className="min-h-11 rounded-full border border-border px-5 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/45 hover:text-foreground disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={pending} data-testid="button-confirm-schedule-task" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
              {pending ? 'Adding to Today…' : 'Add to Today'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TaskEditModal({ task, pending, onSave, onClose }: { task: Task; pending: boolean; onSave: (values: TaskFormValues) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="edit-task-title" className="paper-grain max-h-[94dvh] w-full max-w-[620px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7" data-testid={`dialog-edit-task-${task.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Edit task</p>
            <h2 id="edit-task-title" className="mt-2 font-display text-[31px] leading-none tracking-[-0.04em]">Make it easier to start.</h2>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close task form" data-testid="button-close-task" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="mt-7"><TaskForm task={task} pending={pending} onSubmit={onSave} onCancel={onClose} /></div>
      </section>
    </div>
  );
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const list = useListTasks();
  const createTask = useCreateTask();
  const recommendTask = useRecommendTasks();
  const scheduleTask = useScheduleTask();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const archiveTask = useArchiveTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [recommendationInputs, setRecommendationInputs] = useState<RecommendationInputs>({ availableMinutes: 60, energy: 3 });
  const [recommendationRun, setRecommendationRun] = useState<RecommendationInputs | null>(null);
  const [serverRecommendations, setServerRecommendations] = useState<RecommendationResult[]>([]);
  const [recommendationSource, setRecommendationSource] = useState<'gemini' | 'deterministic'>('deterministic');

  const tasks = useMemo(() => [...(list.data ?? [])].filter((task) => task.status !== 'archived').sort((a, b) => focusScore(b) - focusScore(a) || a.id - b.id), [list.data]);
  const activeTasks = tasks.filter((task) => task.status === 'inbox' || task.status === 'active');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const matrixTasks = useMemo(() => {
    const groups: Record<QuadrantKey, Task[]> = {
      importantUrgent: [],
      importantNotUrgent: [],
      notImportantUrgent: [],
      notImportantNotUrgent: [],
    };
    activeTasks.forEach((task) => groups[quadrantKey(task)].push(task));
    return groups;
  }, [activeTasks]);
  const localRecommendations = useMemo(() => {
    if (!recommendationRun) return [];
    return deterministicRecommendations(activeTasks, recommendationRun);
  }, [activeTasks, recommendationRun]);
  const recommendations = useMemo(() => {
    if (!recommendationRun) return [];
    const tasksById = new Map(activeTasks.map((task) => [task.id, task]));
    const remoteRecommendations = serverRecommendations
      .map((recommendation) => {
        const task = tasksById.get(recommendation.taskId);
        return task ? { task, explanation: recommendation.reason } : null;
      })
      .filter((recommendation): recommendation is { task: Task; explanation: string } => recommendation !== null);
    return remoteRecommendations.length ? remoteRecommendations : localRecommendations;
  }, [activeTasks, localRecommendations, recommendationRun, serverRecommendations]);
  const showSuccess = (text: string) => {
    setNotice({ tone: 'success', text });
    window.setTimeout(() => setNotice(null), 3200);
  };
  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const create = async (values: TaskFormValues) => {
    const data: TaskInput = {
      title: values.title,
      notes: values.notes || null,
      importance: values.importance,
      urgency: values.urgency,
      energyRequired: values.energyRequired,
      interest: values.interest,
      estimatedMinutes: values.estimatedMinutes,
      deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
    };
    try {
      await createTask.mutateAsync({ data });
      await invalidateTasks();
      showSuccess('Task added.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const update = async (task: Task, values: TaskFormValues) => {
    const data: TaskUpdate = {
      title: values.title,
      notes: values.notes || null,
      importance: values.importance,
      urgency: values.urgency,
      energyRequired: values.energyRequired,
      interest: values.interest,
      estimatedMinutes: values.estimatedMinutes,
      deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
    };
    try {
      await updateTask.mutateAsync({ id: task.id, data });
      await invalidateTasks();
      setEditingTask(null);
      showSuccess('Task changes saved.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const complete = async (task: Task) => {
    try {
      await completeTask.mutateAsync({ id: task.id });
      await invalidateTasks();
      showSuccess('Task completed.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const restore = async (task: Task) => {
    try {
      await updateTask.mutateAsync({ id: task.id, data: { status: 'active' } });
      await invalidateTasks();
      showSuccess('Task restored.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const archive = async (task: Task) => {
    if (!window.confirm(`Archive “${task.title}”?`)) return;
    try {
      await archiveTask.mutateAsync({ id: task.id });
      await invalidateTasks();
      showSuccess('Task archived.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const schedule = async (task: Task, data: TaskScheduleInput) => {
    await scheduleTask.mutateAsync({ id: task.id, data });
    await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date: data.scheduledDate }) });
    setSchedulingTask(null);
    navigate('/today');
  };

  const runRecommendations = async () => {
    if (!activeTasks.length) return;
    const inputs = { ...recommendationInputs };
    setRecommendationRun(inputs);
    setServerRecommendations([]);
    setRecommendationSource('deterministic');

    try {
      const response = await recommendTask.mutateAsync({
        data: {
          availableMinutes: inputs.availableMinutes,
          currentEnergy: inputs.energy,
        },
      });
      setServerRecommendations(response.recommendations);
      setRecommendationSource(response.source);
    } catch {
      // The local ranking remains visible if the recommendation request cannot reach the server.
    }
  };

  const pending = createTask.isPending || updateTask.isPending || completeTask.isPending || archiveTask.isPending || scheduleTask.isPending;

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="relative flex min-h-[100dvh]">
        <TaskRail />
        <main className="min-w-0 flex-1 px-5 pb-12 pt-5 sm:px-8 sm:pt-7 lg:px-10 lg:pb-14 lg:pt-8">
          <header className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2"><ListTodo className="size-4 text-primary" /><span className="text-sm font-semibold text-foreground">Tasks</span></div>
            <Link href="/today" data-testid="link-tasks-back-today" className="hidden items-center rounded-full border border-border bg-card px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-primary/45 hover:text-primary sm:inline-flex">Today</Link>
          </header>
          <div className="mt-5 max-w-[920px] space-y-5">
            <section className="border-b border-border/60 pb-5" data-testid="section-add-task">
              <TaskForm compactCreate pending={createTask.isPending} onSubmit={(values) => void create(values)} />
            </section>
            <section className="rounded-xl border border-border/70 bg-card/55 p-4" data-testid="section-recommendations">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-base font-semibold text-foreground">What should I work on?</h2>
                <div className="grid grid-cols-2 gap-2 sm:w-[220px]">
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    <span className="mb-1 block">Available</span>
                    <input type="number" min={1} max={1440} value={recommendationInputs.availableMinutes} onChange={(event) => setRecommendationInputs((current) => ({ ...current, availableMinutes: Math.max(1, Number(event.target.value) || 1) }))} data-testid="input-recommendation-minutes" className="h-9 w-full rounded-lg border border-input bg-background/70 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    <span className="mb-1 block">Energy</span>
                    <input type="number" min={1} max={5} value={recommendationInputs.energy} onChange={(event) => setRecommendationInputs((current) => ({ ...current, energy: Math.min(5, Math.max(1, Number(event.target.value) || 1)) }))} data-testid="input-recommendation-energy" className="h-9 w-full rounded-lg border border-input bg-background/70 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                  </label>
                </div>
              </div>
              <button type="button" onClick={() => void runRecommendations()} disabled={!activeTasks.length || recommendTask.isPending} data-testid="button-recommend-tasks" className="mt-3 min-h-10 w-full rounded-lg bg-primary px-4 py-2 text-xs font-bold tracking-[0.04em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">{recommendTask.isPending ? 'Finding a good fit…' : 'WHAT SHOULD I WORK ON?'}</button>
              {recommendTask.isPending ? (
                <p className="mt-3 text-[11px] text-muted-foreground" role="status" data-testid="status-recommendations-loading">Comparing active tasks with your time and energy…</p>
              ) : recommendationRun ? (
                <div className="mt-3" data-testid="list-recommendations">
                  <div className="mb-1 flex items-center justify-between gap-3"><p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-primary">Next three</p><span className="text-[10px] text-muted-foreground">{recommendationSource === 'gemini' ? 'AI-assisted' : 'Local ranking'} · {recommendationRun.availableMinutes}m / E{recommendationRun.energy}</span></div>
                  {recommendations.length ? recommendations.map((recommendation, index) => <RecommendationCard key={recommendation.task.id} rank={index + 1} task={recommendation.task} explanation={recommendation.explanation} onEdit={() => setEditingTask(recommendation.task)} onSchedule={() => setSchedulingTask(recommendation.task)} />) : <p className="py-2 text-[11px] text-muted-foreground">No active task recommendations yet.</p>}
                </div>
              ) : null}
            </section>
            {list.isLoading ? (
              <div className="space-y-2" aria-label="Loading tasks" data-testid="status-tasks-loading">{[1, 2, 3].map((item) => <div key={item} className="h-11 animate-pulse rounded-lg bg-muted/70" />)}</div>
          ) : list.isError ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-6" role="alert" data-testid="status-tasks-error">
              <p className="text-sm font-semibold">Tasks are unavailable.</p><p className="mt-1 text-xs text-muted-foreground">{errorMessage(list.error)}</p>
              <button type="button" onClick={() => void list.refetch()} data-testid="button-retry-tasks" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><RotateCcw className="size-3.5" /> Try again</button>
            </div>
          ) : (
            <>
              <section data-testid="section-active-tasks">
                <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-foreground">Active tasks</h2><span className="text-[11px] text-muted-foreground">{activeTasks.length}</span></div>
                {activeTasks.length === 0 ? (
                  <div className="border-y border-dashed border-border/70 px-1 py-5 text-xs text-muted-foreground" data-testid="status-tasks-empty">No active tasks.</div>
                ) : <div>{activeTasks.map((task) => <TaskItem key={task.id} task={task} pending={pending} onEdit={() => setEditingTask(task)} onComplete={() => void complete(task)} onArchive={() => void archive(task)} />)}</div>}
              </section>
              <section className="border-t border-border/60 pt-5" data-testid="section-eisenhower">
                <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-foreground">Priority matrix</h2><span className="text-[10px] text-muted-foreground">Importance + urgency</span></div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {QUADRANTS.map((quadrant) => (
                    <div key={quadrant.key} className={`rounded-lg border p-2.5 ${quadrant.tone}`} data-testid={`quadrant-${quadrant.key}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-xs font-semibold text-foreground" title={quadrant.description}>{quadrant.title}</h3>
                        <span className="text-[10px] font-semibold text-muted-foreground">{matrixTasks[quadrant.key].length}</span>
                      </div>
                      <div className="mt-1">
                        {matrixTasks[quadrant.key].length ? matrixTasks[quadrant.key].map((task) => <MatrixTaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} />) : <p className="py-2 text-[10px] text-muted-foreground">Empty</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              {completedTasks.length > 0 && <section className="border-t border-border/60 pt-5" data-testid="section-completed-tasks"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-muted-foreground">Completed</h2><span className="text-[10px] text-muted-foreground">{completedTasks.length}</span></div><div>{completedTasks.map((task) => <div key={task.id} className="flex items-center gap-2.5 border-b border-border/55 py-2.5 last:border-0" data-testid={`row-completed-task-${task.id}`}><button type="button" onClick={() => void restore(task)} disabled={pending} aria-label={`Restore ${task.title}`} data-testid={`button-restore-task-${task.id}`} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"><Check className="size-3" /></button><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{task.title}</p><button type="button" onClick={() => void archive(task)} disabled={pending} aria-label={`Archive ${task.title}`} title="Archive task" data-testid={`button-archive-completed-task-${task.id}`} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"><Archive className="size-3.5" /></button></div>)}</div></section>}
            </>
          )}
          </div>
        </main>
      </div>
      {notice && <div className={`fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)] ${notice.tone === 'error' ? 'border-destructive/25' : 'border-primary/25'}`} role="status" data-testid="status-tasks-notice"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{notice.tone === 'error' ? <X className="size-3.5" /> : <Check className="size-3.5" />}</span><p className="min-w-0 flex-1 text-xs font-semibold text-foreground">{notice.text}</p><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss task message" data-testid="button-dismiss-tasks-notice" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button></div>}
      {editingTask && <TaskEditModal task={editingTask} pending={updateTask.isPending} onSave={(values) => void update(editingTask, values)} onClose={() => setEditingTask(null)} />}
      {schedulingTask && <ScheduleTaskModal task={schedulingTask} pending={scheduleTask.isPending} onSchedule={(data) => schedule(schedulingTask, data)} onClose={() => setSchedulingTask(null)} />}
    </div>
  );
}