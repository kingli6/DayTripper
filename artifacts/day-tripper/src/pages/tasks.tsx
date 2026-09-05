import { zodResolver } from '@hookform/resolvers/zod';
import {
  getListTasksQueryKey,
  useArchiveTask,
  useCompleteTask,
  useCreateTask,
  useListTasks,
  useUpdateTask,
} from '@workspace/api-client-react';
import type { Task, TaskInput, TaskUpdate } from '@workspace/api-client-react';
import { Check, Clock3, Flag, Gauge, ListTodo, Pencil, Plus, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'wouter';
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'That change could not be saved. Try again.';
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(deadline));
}

function focusScore(task: Task) {
  return task.importance + task.urgency + task.interest - task.energyRequired;
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

function TaskItem({ task, onEdit, onComplete, onArchive, pending }: { task: Task; onEdit: () => void; onComplete: () => void; onArchive: () => void; pending: boolean }) {
  return (
    <article className="group rounded-[20px] border border-border/70 bg-card/75 p-4 transition-transform hover:-translate-y-0.5 hover:border-primary/35" data-testid={`card-task-${task.id}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onComplete} disabled={pending} aria-label={`Complete ${task.title}`} data-testid={`button-complete-task-${task.id}`} className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary/45 text-transparent transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
          <Check className="size-3.5" strokeWidth={2.4} />
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
  const queryClient = useQueryClient();
  const list = useListTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const archiveTask = useArchiveTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const tasks = useMemo(() => [...(list.data ?? [])].filter((task) => task.status !== 'archived').sort((a, b) => focusScore(b) - focusScore(a) || a.id - b.id), [list.data]);
  const activeTasks = tasks.filter((task) => task.status === 'inbox' || task.status === 'active');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
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

  const pending = createTask.isPending || updateTask.isPending || completeTask.isPending || archiveTask.isPending;

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
            <aside className="rounded-[26px] border border-border/70 bg-card/70 p-5 sm:p-6">
              <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">A gentle order</p></div>
              <p className="mt-4 font-display text-[25px] leading-tight tracking-[-0.035em]">Start with the highest signal, not the loudest feeling.</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">The list favors importance, urgency, and interest, while making high-energy tasks more visible as a choice.</p>
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
              <div className="mb-4 flex items-end justify-between gap-3"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Active and inbox</p><h2 className="mt-2 font-display text-[30px] leading-none tracking-[-0.04em]">{activeTasks.length ? 'What could fit next?' : 'Your list is clear.'}</h2></div><span className="text-xs text-muted-foreground">{activeTasks.length} {activeTasks.length === 1 ? 'task' : 'tasks'}</span></div>
              {activeTasks.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-14 text-center" data-testid="status-tasks-empty"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><Check className="size-6" /></div><p className="mt-5 font-display text-[29px]">Nothing asking for you yet.</p><p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">Add one task above, or let this be enough for now.</p></div>
              ) : <div className="space-y-3">{activeTasks.map((task) => <TaskItem key={task.id} task={task} pending={pending} onEdit={() => setEditingTask(task)} onComplete={() => void complete(task)} onArchive={() => void archive(task)} />)}</div>}
              {completedTasks.length > 0 && <div className="mt-10 border-t border-border/60 pt-7"><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Completed</p><div className="mt-3 space-y-2">{completedTasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/50 px-4 py-3" data-testid={`row-completed-task-${task.id}`}><span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="size-3.5" /></span><p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{task.title}</p><button type="button" onClick={() => void archive(task)} disabled={pending} data-testid={`button-archive-completed-task-${task.id}`} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40">Archive</button></div>)}</div></div>}
            </div>
          )}
        </main>
      </div>
      {notice && <div className={`fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)] ${notice.tone === 'error' ? 'border-destructive/25' : 'border-primary/25'}`} role="status" data-testid="status-tasks-notice"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{notice.tone === 'error' ? <X className="size-3.5" /> : <Check className="size-3.5" />}</span><p className="min-w-0 flex-1 text-xs font-semibold text-foreground">{notice.text}</p><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss task message" data-testid="button-dismiss-tasks-notice" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button></div>}
      {editingTask && <TaskEditModal task={editingTask} pending={updateTask.isPending} onSave={(values) => void update(editingTask, values)} onClose={() => setEditingTask(null)} />}
    </div>
  );
}