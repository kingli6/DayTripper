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
import { Check, Clock3, Flag, Gauge, ListTodo, Pencil, Plus, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
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
    <aside className="hidden w-[264px] shrink-0 flex-col justify-between bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <div>
        <Link href="/today" className="flex items-center gap-3 px-2" data-testid="link-tasks-brand">
          <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
            <span className="font-display -mt-0.5">d</span>
            <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
          </div>
          <div>
            <p className="font-display text-[22px] leading-none tracking-[-0.03em]">Day Tripper</p>
            <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">a softer daily practice</p>
          </div>
        </Link>
        <nav className="mt-16" aria-label="Private space">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your space</p>
          <Link href="/today" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-today">
            <span className="size-3.5 rounded-full border border-sidebar-primary" />
            Today
          </Link>
          <Link href="/tasks" className="mt-1 flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]" data-testid="link-tasks-tasks">
            <ListTodo className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            Tasks
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </Link>
          <Link href="/board" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-board">
            <span className="size-3.5 rounded border border-sidebar-primary" />
            Board
          </Link>
          <Link href="/retention" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-tasks-practices">
            <span className="size-3.5 rounded-full border border-sidebar-primary" />
            Practices
          </Link>
        </nav>
        <div className="mt-14 px-3">
          <div className="mb-4 flex size-8 items-center justify-center rounded-full border border-sidebar-primary/35 bg-sidebar-primary/10 text-sidebar-primary">
            <Sparkles className="size-3.5" strokeWidth={1.7} />
          </div>
          <p className="font-display text-[20px] leading-[1.15] text-sidebar-foreground/90">Choose what fits now.</p>
          <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/55">Use the signals as a guide, not a rule.</p>
        </div>
      </div>
      <div className="border-t border-sidebar-border/80 px-3 pt-5">
        <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
          <ShieldCheck className="size-3.5 text-sidebar-primary/80" strokeWidth={1.8} />
          <span>Private by design</span>
        </div>
        <p className="mt-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35">Tasks / MVP</p>
      </div>
    </aside>
  );
}

function TaskForm({
  task,
  pending,
  onSubmit,
  onCancel,
}: {
  task?: Task;
  pending: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel?: () => void;
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit({ ...values, title: values.title.trim(), notes: values.notes.trim() }))} className="space-y-5" data-testid={task ? `form-edit-task-${task.id}` : 'form-create-task'}>
        <FormField control={form.control} name="title" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs font-semibold text-foreground">What do you want to work on?</FormLabel>
            <FormControl><input {...field} autoFocus={!task} maxLength={200} placeholder="A clear next action" data-testid="input-task-title" className="flex h-12 w-full rounded-xl border border-input bg-background/70 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['importance', 'Importance', 'How much does it matter?'],
            ['urgency', 'Urgency', 'How soon does it matter?'],
            ['energyRequired', 'Energy needed', 'How demanding will it feel?'],
            ['interest', 'Interest', 'How much do you want to do it?'],
          ] as const).map(([name, label, description]) => (
            <FormField key={name} control={form.control} name={name} render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-foreground">{label}</FormLabel>
                <FormControl><input {...field} type="number" min={1} max={5} step={1} inputMode="numeric" data-testid={`input-task-${name}`} className="flex h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
                <FormDescription className="text-[11px] leading-4">{description} 1–5.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="estimatedMinutes" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">Estimated minutes</FormLabel>
              <FormControl><input {...field} type="number" min={1} max={1440} step={1} inputMode="numeric" data-testid="input-task-estimated-minutes" className="flex h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="deadline" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold text-foreground">Deadline <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
              <FormControl><input {...field} type="datetime-local" data-testid="input-task-deadline" className="flex h-11 w-full rounded-xl border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs font-semibold text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
            <FormControl><textarea {...field} maxLength={2000} rows={3} placeholder="Anything that helps you start." data-testid="textarea-task-notes" className="w-full resize-none rounded-xl border border-input bg-background/70 px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
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
    <article className="group rounded-[20px] border border-border/70 bg-card/75 p-4 transition-transform hover:-translate-y-0.5 hover:border-primary/35" data-testid={`card-task-${task.id}`}>
      <div className="flex items-start gap-3">
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
          className={`relative mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-transparent transition-colors disabled:opacity-40 ${isHolding ? 'border-primary bg-primary/10 text-primary' : 'border-primary/45 hover:bg-primary hover:text-primary-foreground'}`}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-primary/80" style={{ width: `${holdProgress}%` }} />
          <Check className="relative size-3.5" strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-semibold leading-5 text-foreground" data-testid={`text-task-title-${task.id}`}>{task.title}</h3>
            <button type="button" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-edit-task-${task.id}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
              <Pencil className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
          {task.notes && <p className="mt-1.5 text-xs leading-5 text-muted-foreground" data-testid={`text-task-notes-${task.id}`}>{task.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground" data-testid={`meta-task-${task.id}`}>
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/75"><Flag className="size-3.5 text-primary" strokeWidth={1.8} />{task.importance + task.urgency}/10 priority</span>
            <span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" strokeWidth={1.8} />Energy {task.energyRequired}/5</span>
            <span>Interest {task.interest}/5</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" strokeWidth={1.8} />{task.estimatedMinutes} min</span>
            {task.deadline && <span>Due {formatDeadline(task.deadline)}</span>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t border-border/55 pt-3">
        <button type="button" onClick={onArchive} disabled={pending} data-testid={`button-archive-task-${task.id}`} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">Archive</button>
      </div>
    </article>
  );
}

function MatrixTaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="w-full rounded-2xl border border-border/65 bg-background/60 p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/45" data-testid={`card-matrix-task-${task.id}`}>
      <p className="truncate text-[13px] font-semibold text-foreground">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
        <span>{task.estimatedMinutes} min</span>
        <span>Energy {task.energyRequired}/5</span>
        <span>Interest {task.interest}/5</span>
        {task.deadline && <span>Due {formatDeadline(task.deadline)}</span>}
      </div>
    </button>
  );
}

function RecommendationCard({ rank, task, explanation, onEdit, onSchedule }: { rank: number; task: Task; explanation: string; onEdit: () => void; onSchedule: () => void }) {
  return (
    <article className="w-full rounded-2xl border border-primary/20 bg-background/70 p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/45" data-testid={`card-recommendation-${task.id}`}>
      <button type="button" onClick={onEdit} className="w-full text-left" data-testid={`button-edit-recommendation-${task.id}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{rank}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
              <span>{task.estimatedMinutes} min</span>
              <span>{quadrantTitle(task)}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{explanation}</p>
          </div>
        </div>
      </button>
      <div className="mt-4 flex justify-end border-t border-border/55 pt-3">
        <button type="button" onClick={onSchedule} data-testid={`button-schedule-task-${task.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[11px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Clock3 className="size-3.5" strokeWidth={1.9} />
          Work on this
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
      <div className="pointer-events-none absolute -right-24 -top-28 size-[430px] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex min-h-[100dvh]">
        <TaskRail />
        <main className="min-w-0 flex-1 px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
          <header className="animate-rise flex items-center justify-between border-b border-border/60 pb-5">
            <div className="flex items-center gap-2"><ListTodo className="size-3.5 text-primary" /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A short list for right now</span></div>
            <Link href="/today" data-testid="link-tasks-back-today" className="hidden items-center rounded-full border border-border bg-card px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-primary/45 hover:text-primary sm:inline-flex">Today</Link>
          </header>
          <div className="mt-9 max-w-[980px]">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Tasks</p>
            <h1 className="mt-3 max-w-[680px] font-display text-[clamp(2.7rem,6vw,5.4rem)] leading-[0.91] tracking-[-0.06em]">Choose what fits your energy.</h1>
            <p className="mt-5 max-w-[620px] text-[15px] leading-7 text-muted-foreground">Keep the important things visible, then use interest and energy to choose a next step that feels possible.</p>
          </div>
          <div className="mt-8 grid max-w-[980px] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[26px] border border-primary/20 bg-primary/[0.045] p-5 sm:p-7" data-testid="section-add-task">
              <div className="mb-6 flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plus className="size-4" /></span>
                <div><h2 className="font-display text-[26px] leading-none tracking-[-0.035em]">Add a task</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">A few quick signals are enough for the first pass.</p></div>
              </div>
              <TaskForm pending={createTask.isPending} onSubmit={(values) => void create(values)} />
            </section>
            <aside className="rounded-[26px] border border-border/70 bg-card/70 p-5 sm:p-6" data-testid="section-recommendations">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">A little direction</p></div>
              <p className="mt-4 font-display text-[25px] leading-tight tracking-[-0.035em]">What should I work on?</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Tell the list what fits right now. Gemini can help weigh the tradeoffs without changing your tasks.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <label className="text-[10px] font-semibold text-muted-foreground">
                  <span className="mb-1.5 block">Minutes</span>
                  <input type="number" min={1} max={1440} value={recommendationInputs.availableMinutes} onChange={(event) => setRecommendationInputs((current) => ({ ...current, availableMinutes: Math.max(1, Number(event.target.value) || 1) }))} data-testid="input-recommendation-minutes" className="h-10 w-full rounded-xl border border-input bg-background/70 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="text-[10px] font-semibold text-muted-foreground">
                  <span className="mb-1.5 block">Energy</span>
                  <input type="number" min={1} max={5} value={recommendationInputs.energy} onChange={(event) => setRecommendationInputs((current) => ({ ...current, energy: Math.min(5, Math.max(1, Number(event.target.value) || 1)) }))} data-testid="input-recommendation-energy" className="h-10 w-full rounded-xl border border-input bg-background/70 px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
              </div>
              <button type="button" onClick={() => void runRecommendations()} disabled={!activeTasks.length || recommendTask.isPending} data-testid="button-recommend-tasks" className="mt-4 min-h-11 w-full rounded-full bg-primary px-4 py-2 text-xs font-bold tracking-[0.04em] text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{recommendTask.isPending ? 'Finding a good fit…' : 'WHAT SHOULD I WORK ON?'}</button>
              {recommendTask.isPending ? (
                 <p className="mt-4 rounded-2xl bg-secondary/65 px-4 py-4 text-xs leading-5 text-muted-foreground" role="status" data-testid="status-recommendations-loading">Comparing your active tasks with the time and energy you have right now…</p>
              ) : recommendationRun ? (
                <div className="mt-5 space-y-2" data-testid="list-recommendations">
                   <div className="flex items-center justify-between gap-3"><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">Your next three</p><span className="text-[10px] text-muted-foreground">{recommendationSource === 'gemini' ? 'AI-assisted' : 'Local ranking'} · {recommendationRun.availableMinutes} min / energy {recommendationRun.energy}</span></div>
                   {recommendations.length ? recommendations.map((recommendation, index) => <RecommendationCard key={recommendation.task.id} rank={index + 1} task={recommendation.task} explanation={recommendation.explanation} onEdit={() => setEditingTask(recommendation.task)} onSchedule={() => setSchedulingTask(recommendation.task)} />) : <p className="rounded-2xl bg-secondary/65 px-4 py-4 text-xs leading-5 text-muted-foreground">Add an active task and I’ll help you choose a next step.</p>}
                </div>
              ) : (
                 <p className="mt-4 text-[11px] leading-5 text-muted-foreground">The top three will balance priority with time, energy, and deadline proximity.</p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl bg-secondary/65 px-3 py-3"><p className="font-display text-2xl">{activeTasks.length}</p><p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-muted-foreground">to choose from</p></div>
                <div className="rounded-2xl bg-secondary/65 px-3 py-3"><p className="font-display text-2xl">{completedTasks.length}</p><p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-muted-foreground">completed</p></div>
              </div>
            </aside>
          </div>
          {list.isLoading ? (
            <div className="mt-10 max-w-[980px] space-y-3" aria-label="Loading tasks" data-testid="status-tasks-loading">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-[20px] bg-muted/70" />)}</div>
          ) : list.isError ? (
            <div className="mt-10 max-w-[980px] rounded-[24px] border border-destructive/25 bg-destructive/[0.06] px-6 py-12 text-center" role="alert" data-testid="status-tasks-error">
              <p className="font-display text-[28px]">Tasks are tucked away.</p><p className="mt-2 text-sm text-muted-foreground">{errorMessage(list.error)}</p>
              <button type="button" onClick={() => void list.refetch()} data-testid="button-retry-tasks" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-destructive/30 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><RotateCcw className="size-3.5" /> Try again</button>
            </div>
          ) : (
            <div className="mt-10 max-w-[980px]">
              <section data-testid="section-eisenhower">
                <div className="mb-4 flex items-end justify-between gap-3"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">See the shape of your list</p><h2 className="mt-2 font-display text-[30px] leading-none tracking-[-0.04em]">Eisenhower matrix</h2></div><span className="text-xs text-muted-foreground">Importance and urgency, 1–5</span></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {QUADRANTS.map((quadrant) => (
                    <div key={quadrant.key} className={`rounded-[22px] border p-4 ${quadrant.tone}`} data-testid={`quadrant-${quadrant.key}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div><h3 className="text-sm font-semibold text-foreground">{quadrant.title}</h3><p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{quadrant.description}</p></div>
                        <span className="flex size-7 items-center justify-center rounded-full bg-background/75 text-xs font-semibold text-foreground">{matrixTasks[quadrant.key].length}</span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {matrixTasks[quadrant.key].length ? matrixTasks[quadrant.key].map((task) => <MatrixTaskCard key={task.id} task={task} onEdit={() => setEditingTask(task)} />) : <p className="rounded-2xl border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">No active tasks here yet.</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="mb-4 mt-12 flex items-end justify-between gap-3"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Active and inbox</p><h2 className="mt-2 font-display text-[30px] leading-none tracking-[-0.04em]">{activeTasks.length ? 'What could fit next?' : 'Your list is clear.'}</h2></div><span className="text-xs text-muted-foreground">{activeTasks.length} {activeTasks.length === 1 ? 'task' : 'tasks'}</span></div>
              {activeTasks.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-14 text-center" data-testid="status-tasks-empty"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-6" /></div><p className="mt-5 font-display text-[29px]">Nothing asking for you yet.</p><p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">Add one task above, or let this be enough for now.</p></div>
              ) : <div className="space-y-3">{activeTasks.map((task) => <TaskItem key={task.id} task={task} pending={pending} onEdit={() => setEditingTask(task)} onComplete={() => void complete(task)} onArchive={() => void archive(task)} />)}</div>}
              {completedTasks.length > 0 && <div className="mt-10 border-t border-border/60 pt-7"><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Completed</p><div className="mt-3 space-y-2">{completedTasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/50 px-4 py-3" data-testid={`row-completed-task-${task.id}`}><button type="button" onClick={() => void restore(task)} disabled={pending} aria-label={`Restore ${task.title}`} data-testid={`button-restore-task-${task.id}`} className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"><Check className="size-3.5" /></button><p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{task.title}</p><button type="button" onClick={() => void archive(task)} disabled={pending} data-testid={`button-archive-completed-task-${task.id}`} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40">Archive</button></div>)}</div></div>}
            </div>
          )}
        </main>
      </div>
      {notice && <div className={`fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)] ${notice.tone === 'error' ? 'border-destructive/25' : 'border-primary/25'}`} role="status" data-testid="status-tasks-notice"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{notice.tone === 'error' ? <X className="size-3.5" /> : <Check className="size-3.5" />}</span><p className="min-w-0 flex-1 text-xs font-semibold text-foreground">{notice.text}</p><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss task message" data-testid="button-dismiss-tasks-notice" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button></div>}
      {editingTask && <TaskEditModal task={editingTask} pending={updateTask.isPending} onSave={(values) => void update(editingTask, values)} onClose={() => setEditingTask(null)} />}
      {schedulingTask && <ScheduleTaskModal task={schedulingTask} pending={scheduleTask.isPending} onSchedule={(data) => schedule(schedulingTask, data)} onClose={() => setSchedulingTask(null)} />}
    </div>
  );
}