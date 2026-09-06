import type { BoardCard, BoardCardInput, BoardCardUpdate } from '@workspace/api-client-react';
import {
  getListBoardCardsQueryKey,
  getListActivitiesQueryKey,
  useArchiveBoardCard,
  useCreateActivity,
  useCreateBoardCard,
  useListBoardCards,
  useUpdateBoardCard,
} from '@workspace/api-client-react';
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowDown, ArrowUp, Archive, BookOpen, CalendarClock, Check, ChevronDown, Circle, Clock3, Flag, Home, LayoutGrid, ListTodo, Pencil, Plus, RotateCcw, ShieldCheck, Users, BriefcaseBusiness, X } from 'lucide-react';
import { Link } from 'wouter';
import { BoardCardForm, BOARD_CATEGORIES, type BoardCategory, type BoardCardFormValues } from '@/components/board-card-form';
import { useQueryClient } from '@tanstack/react-query';

const categoryLabels: Record<BoardCategory, string> = {
  work: 'Work',
  recovery: 'Recovery',
  managing: 'Managing',
  social: 'Social',
  fun: 'Fun',
};

const categoryDescriptions: Record<BoardCategory, string> = {
  work: 'Loose threads and good ideas for work.',
  recovery: 'Rest, restoration, and room to recover.',
  managing: 'Small tasks that keep life moving.',
  social: 'People, plans, and things to come back to.',
  fun: 'Pleasures and play worth making room for.',
};

const categoryIcons: Record<BoardCategory, typeof Home> = {
  work: BriefcaseBusiness,
  recovery: RotateCcw,
  managing: Home,
  social: Users,
  fun: BookOpen,
};

const categoryColors: Record<BoardCategory, { ink: string; wash: string; rule: string }> = {
  work: { ink: 'hsl(176 31% 37%)', wash: 'hsl(176 32% 87% / 0.7)', rule: 'hsl(176 31% 37% / 0.25)' },
  recovery: { ink: 'hsl(196 45% 39%)', wash: 'hsl(196 48% 87% / 0.72)', rule: 'hsl(196 45% 39% / 0.23)' },
  managing: { ink: 'hsl(13 52% 45%)', wash: 'hsl(18 65% 90% / 0.58)', rule: 'hsl(13 52% 45% / 0.25)' },
  social: { ink: 'hsl(274 29% 48%)', wash: 'hsl(274 39% 91% / 0.75)', rule: 'hsl(274 29% 48% / 0.23)' },
  fun: { ink: 'hsl(38 67% 39%)', wash: 'hsl(41 70% 87% / 0.78)', rule: 'hsl(38 67% 39% / 0.23)' },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'That change could not be saved. Try again.';
}

function formatDeadline(deadline: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(deadline));
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function endTimeFromDuration(startTime: string, duration: number) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const total = hours * 60 + minutes + duration;
  if (total > 23 * 60 + 59) return null;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

function BoardBrand() {
  return (
    <Link href="/board" className="flex items-center gap-3 px-2" data-testid="link-board-brand">
      <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
        <span className="font-display -mt-0.5">d</span>
        <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
      </div>
      <div>
        <p className="font-display text-[22px] leading-none tracking-[-0.03em]">Day Tripper</p>
        <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">a softer daily practice</p>
      </div>
    </Link>
  );
}

function BoardRail() {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col justify-between bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <div>
        <BoardBrand />
        <nav className="mt-16" aria-label="Private space">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your space</p>
          <Link href="/tasks" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-board-tasks">
            <ListTodo className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            Tasks
          </Link>
          <Link href="/today" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-board-today">
            <Circle className="size-3.5 text-sidebar-primary" strokeWidth={1.8} />
            Today
          </Link>
          <Link href="/board" className="mt-1 flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]" data-testid="link-board-board">
            <LayoutGrid className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            Board
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </Link>
          <Link href="/retention" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-board-practices">
            <Circle className="size-3.5 text-sidebar-primary" strokeWidth={1.8} />
            Practices
          </Link>
        </nav>
        <div className="mt-14 px-3">
          <div className="mb-4 flex size-8 items-center justify-center rounded-full border border-sidebar-primary/35 bg-sidebar-primary/10 text-sidebar-primary">
            <LayoutGrid className="size-3.5" strokeWidth={1.8} />
          </div>
          <p className="font-display text-[20px] leading-[1.15] text-sidebar-foreground/90">A place for later.</p>
          <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/55">Keep the reusable things here. They do not have to become today.</p>
        </div>
      </div>
      <div className="border-t border-sidebar-border/80 px-3 pt-5">
        <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
          <ShieldCheck className="size-3.5 text-sidebar-primary/80" strokeWidth={1.8} />
          <span>Private by design</span>
        </div>
        <p className="mt-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35">Board / 01</p>
      </div>
    </aside>
  );
}

function BoardModal({
  card,
  defaultCategory,
  pending,
  onSave,
  onClose,
}: {
  card?: BoardCard;
  defaultCategory: BoardCategory;
  pending: boolean;
  onSave: (values: BoardCardFormValues) => void;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const requestClose = () => {
    if (!dirty || window.confirm('Discard these unsaved changes?')) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) requestClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="board-card-dialog-title" className="paper-grain max-h-[94dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7" data-testid={card ? `dialog-edit-board-card-${card.id}` : 'dialog-create-board-card'}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">{card ? 'Edit card' : 'New card'}</p>
            <h2 id="board-card-dialog-title" className="mt-2 font-display text-[32px] leading-none tracking-[-0.04em]">{card ? 'Keep it useful.' : 'Put it somewhere.'}</h2>
            <p className="mt-3 max-w-[410px] text-sm leading-6 text-muted-foreground">{card ? 'Change the words or move this card to a better shelf.' : 'The Board is for reusable possibilities, not a second schedule.'}</p>
          </div>
          <button type="button" onClick={requestClose} disabled={pending} aria-label="Close board card form" data-testid="button-close-board-card" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="mt-7" onChange={() => setDirty(true)}>
          <BoardCardForm card={card} defaultCategory={defaultCategory} pending={pending} onSubmit={onSave} onCancel={requestClose} />
        </div>
      </section>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Loading Board" data-testid="status-board-loading">
      {BOARD_CATEGORIES.map((category) => (
        <div key={category} className="min-h-[220px] rounded-[24px] border border-border/60 bg-card/55 p-4">
          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted/70" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardCardItem({
  card,
  index,
  count,
  pending,
  onSchedule,
  onEdit,
  onArchive,
  onMove,
}: {
  card: BoardCard;
  index: number;
  count: number;
  pending: boolean;
  onSchedule: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onMove: (direction: 'up' | 'down') => void;
}) {
  return (
    <article className="group rounded-[18px] border border-border/70 bg-card/75 p-4 transition-transform hover:-translate-y-0.5 hover:border-primary/35" data-testid={`card-board-${card.id}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[14px] font-semibold leading-5 text-foreground" data-testid={`text-board-card-title-${card.id}`}>{card.title}</h3>
        <button type="button" onClick={onEdit} aria-label={`Edit ${card.title}`} data-testid={`button-edit-board-card-${card.id}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-100 transition-colors hover:bg-secondary hover:text-primary sm:opacity-0 sm:group-hover:opacity-100">
          <Pencil className="size-3.5" strokeWidth={1.8} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground" data-testid={`meta-board-card-${card.id}`}>
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/75" title={`Priority ${card.priority}`}>
          <Flag className="size-3.5 text-primary" strokeWidth={1.8} />
          {card.priority}/5
        </span>
        {card.estimatedDurationMinutes !== null && (
          <span className="inline-flex items-center gap-1.5" data-testid={`text-board-card-duration-${card.id}`}>
            <Clock3 className="size-3.5" strokeWidth={1.8} />
            {card.estimatedDurationMinutes} min
          </span>
        )}
        {card.deadline && (
          <span className="inline-flex items-center gap-1.5" data-testid={`text-board-card-deadline-${card.id}`}>
            <CalendarClock className="size-3.5" strokeWidth={1.8} />
            {formatDeadline(card.deadline)}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/55 pt-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove('up')} disabled={pending || index === 0} aria-label={`Move ${card.title} up`} data-testid={`button-move-board-card-up-${card.id}`} className="flex size-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-25">
            <ArrowUp className="size-3.5" strokeWidth={1.8} />
          </button>
          <button type="button" onClick={() => onMove('down')} disabled={pending || index === count - 1} aria-label={`Move ${card.title} down`} data-testid={`button-move-board-card-down-${card.id}`} className="flex size-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-25">
            <ArrowDown className="size-3.5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onSchedule} disabled={pending} data-testid={`button-schedule-board-card-${card.id}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-40">
            <CalendarClock className="size-3.5" strokeWidth={1.8} />
            Schedule
          </button>
          <button type="button" onClick={onArchive} disabled={pending} data-testid={`button-archive-board-card-${card.id}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
            <Archive className="size-3.5" strokeWidth={1.8} />
            Archive
          </button>
        </div>
      </div>
    </article>
  );
}

function BoardColumn({
  category,
  cards,
  pending,
  onAdd,
  onSchedule,
  onEdit,
  onArchive,
  onMove,
}: {
  category: BoardCategory;
  cards: BoardCard[];
  pending: boolean;
  onAdd: () => void;
  onSchedule: (card: BoardCard) => void;
  onEdit: (card: BoardCard) => void;
  onArchive: (card: BoardCard) => void;
  onMove: (card: BoardCard, direction: 'up' | 'down') => void;
}) {
  const Icon = categoryIcons[category];
  const color = categoryColors[category];
  return (
    <section className="flex min-w-0 flex-col rounded-[24px] border bg-background/40 p-3.5" style={{ borderColor: color.rule }} data-testid={`column-board-${category}`}>
      <div className="rounded-[18px] px-2.5 py-2.5" style={{ backgroundColor: color.wash }}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-background/60" style={{ color: color.ink }}>
            <Icon className="size-4" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-none tracking-[-0.03em]" style={{ color: color.ink }}>{categoryLabels[category]}</h2>
            <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{cards.length} {cards.length === 1 ? 'card' : 'cards'}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{categoryDescriptions[category]}</p>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2.5">
        {cards.length === 0 ? (
          <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center rounded-[18px] border border-dashed border-border/80 px-4 py-6 text-center" data-testid={`status-board-empty-${category}`}>
            <p className="text-xs font-semibold text-foreground/75">Nothing here yet.</p>
            <p className="mt-1 max-w-[150px] text-[11px] leading-4 text-muted-foreground">Keep a possibility close for later.</p>
            <button type="button" onClick={onAdd} data-testid={`button-add-board-card-${category}`} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 px-3 py-2 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10">
              <Plus className="size-3.5" strokeWidth={2} /> Add card
            </button>
          </div>
        ) : cards.map((card, index) => (
          <BoardCardItem key={card.id} card={card} index={index} count={cards.length} pending={pending} onSchedule={() => onSchedule(card)} onEdit={() => onEdit(card)} onArchive={() => onArchive(card)} onMove={(direction) => onMove(card, direction)} />
        ))}
      </div>
      {cards.length > 0 && <button type="button" onClick={onAdd} data-testid={`button-add-board-card-${category}`} className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary">
        <Plus className="size-3.5" strokeWidth={2} /> Add card
      </button>}
    </section>
  );
}

const scheduleSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a valid start time.'),
  durationMinutes: z.preprocess((value) => value === '' ? undefined : Number(value), z.number().int().min(1).max(1440).optional()),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time.').optional(),
}).superRefine((values, context) => {
  if (!values.durationMinutes && !values.endTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['durationMinutes'], message: 'Add a duration or end time.' });
  }
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

function ScheduleModal({ card, onClose, onScheduled }: { card: BoardCard; onClose: () => void; onScheduled: (date: string) => Promise<void> }) {
  const createActivity = useCreateActivity();
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      scheduledDate: localDate(),
      startTime: '09:00',
      durationMinutes: card.estimatedDurationMinutes ?? undefined,
      endTime: '',
    },
  });

  async function submit(values: ScheduleFormValues) {
    const endTime = values.durationMinutes ? endTimeFromDuration(values.startTime, values.durationMinutes) : values.endTime;
    if (!endTime) {
      form.setError('durationMinutes', { message: 'That duration runs past midnight. Choose an end time or a shorter duration.' });
      return;
    }
    if (!values.durationMinutes && endTime <= values.startTime) {
      form.setError('endTime', { message: 'The end time needs to be after the start time.' });
      return;
    }
    try {
      await createActivity.mutateAsync({
        data: {
          title: card.title,
          scheduledDate: values.scheduledDate,
          startTime: values.startTime,
          endTime,
          category: card.category,
          completed: false,
          locked: false,
          pinned: false,
          note: null,
          boardCardId: card.id,
        },
      });
      await onScheduled(values.scheduledDate);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createActivity.isPending) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="schedule-board-card-title" className="paper-grain w-full max-w-[520px] rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7" data-testid={`dialog-schedule-board-card-${card.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Schedule a possibility</p>
            <h2 id="schedule-board-card-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">Make room for “{card.title}”.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This creates a new activity occurrence. The Board card stays here for another day.</p>
          </div>
          <button type="button" onClick={onClose} disabled={createActivity.isPending} aria-label="Close schedule form" data-testid="button-close-schedule-board-card" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => void submit(values))} className="mt-7 space-y-5" data-testid={`form-schedule-board-card-${card.id}`}>
            <FormField control={form.control} name="scheduledDate" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-foreground">Date</FormLabel>
                <FormControl><input {...field} type="date" data-testid={`input-schedule-date-${card.id}`} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="startTime" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-foreground">Starts</FormLabel>
                  <FormControl><input {...field} type="time" data-testid={`input-schedule-start-${card.id}`} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="durationMinutes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-foreground">Duration <span className="font-normal text-muted-foreground">(optional if using end)</span></FormLabel>
                  <FormControl><input {...field} value={field.value ?? ''} type="number" min={1} max={1440} step={1} placeholder="Minutes" data-testid={`input-schedule-duration-${card.id}`} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="endTime" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-foreground">End time <span className="font-normal text-muted-foreground">(use instead of duration)</span></FormLabel>
                <FormControl><input {...field} value={field.value ?? ''} type="time" data-testid={`input-schedule-end-${card.id}`} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {form.formState.errors.root?.message && <p className="rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid={`status-schedule-error-${card.id}`}>{form.formState.errors.root.message}</p>}
            <div className="flex justify-end gap-2 border-t border-border/65 pt-5">
              <button type="button" onClick={onClose} disabled={createActivity.isPending} data-testid={`button-cancel-schedule-${card.id}`} className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-40">Cancel</button>
              <button type="submit" disabled={createActivity.isPending} data-testid={`button-confirm-schedule-${card.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-55">
                {createActivity.isPending ? 'Scheduling…' : 'Schedule occurrence'}
              </button>
            </div>
          </form>
        </Form>
      </section>
    </div>
  );
}

export default function BoardPage() {
  const queryClient = useQueryClient();
  const list = useListBoardCards();
  const createCard = useCreateBoardCard();
  const updateCard = useUpdateBoardCard();
  const archiveCard = useArchiveBoardCard();
  const [modal, setModal] = useState<{ card?: BoardCard; category: BoardCategory } | null>(null);
  const [scheduleCard, setScheduleCard] = useState<BoardCard | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [ordering, setOrdering] = useState(false);

  const cards = useMemo(() => [...(list.data ?? [])].filter((card) => !card.archivedAt).sort((a, b) => a.category.localeCompare(b.category) || a.position - b.position || a.id - b.id), [list.data]);
  const grouped = useMemo(() => Object.fromEntries(BOARD_CATEGORIES.map((category) => [category, cards.filter((card) => card.category === category)])) as Record<BoardCategory, BoardCard[]>, [cards]);
  const total = cards.length;

  const showSuccess = (text: string) => {
    setNotice({ tone: 'success', text });
    window.setTimeout(() => setNotice(null), 3600);
  };

  const saveOrder = async (nextCards: BoardCard[], previousCards: BoardCard[]) => {
    setOrdering(true);
    queryClient.setQueryData<BoardCard[]>(getListBoardCardsQueryKey(), nextCards);
    try {
      const changed = nextCards.filter((card, index) => card.position !== index || card.category !== previousCards.find((item) => item.id === card.id)?.category);
      await Promise.all(changed.map((card) => updateCard.mutateAsync({ id: card.id, data: { position: card.position, category: card.category, expectedUpdatedAt: card.updatedAt } })));
      await queryClient.invalidateQueries({ queryKey: getListBoardCardsQueryKey() });
      showSuccess('Board order saved.');
    } catch (error) {
      queryClient.setQueryData(getListBoardCardsQueryKey(), previousCards);
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setOrdering(false);
    }
  };

  const moveCard = (card: BoardCard, direction: 'up' | 'down') => {
    const column = grouped[card.category];
    const index = column.findIndex((item) => item.id === card.id);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= column.length) return;
    const reorderedColumn = [...column];
    [reorderedColumn[index], reorderedColumn[nextIndex]] = [reorderedColumn[nextIndex], reorderedColumn[index]];
    const nextCards = cards.map((item) => {
      const inColumn = reorderedColumn.find((candidate) => candidate.id === item.id);
      return inColumn ? { ...inColumn, position: reorderedColumn.findIndex((candidate) => candidate.id === item.id) } : item;
    });
    void saveOrder(nextCards, cards);
  };

  const changeCategory = (card: BoardCard, category: BoardCategory) => {
    if (category === card.category) return;
    const source = grouped[card.category].filter((item) => item.id !== card.id);
    const target = [...grouped[category], { ...card, category, position: grouped[category].length }];
    const nextCards = cards.map((item) => {
      const sourceItem = source.find((candidate) => candidate.id === item.id);
      const targetItem = target.find((candidate) => candidate.id === item.id);
      return sourceItem ? { ...sourceItem, position: source.indexOf(sourceItem) } : targetItem ? { ...targetItem, position: target.indexOf(targetItem) } : item;
    });
    void saveOrder(nextCards, cards);
  };

  const handleCreate = async (values: BoardCardFormValues) => {
    const data: BoardCardInput = { title: values.title, category: values.category, note: values.note || null, priority: values.priority, estimatedDurationMinutes: values.estimatedDurationMinutes ?? null, deadline: values.deadline ? new Date(values.deadline).toISOString() : null, position: grouped[values.category].length };
    try {
      await createCard.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getListBoardCardsQueryKey() });
      setModal(null);
      showSuccess('Card added to your Board.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const handleUpdate = async (card: BoardCard, values: BoardCardFormValues) => {
    const data: BoardCardUpdate = { title: values.title, category: values.category, note: values.note || null, priority: values.priority, estimatedDurationMinutes: values.estimatedDurationMinutes ?? null, deadline: values.deadline ? new Date(values.deadline).toISOString() : null, expectedUpdatedAt: card.updatedAt };
    try {
      await updateCard.mutateAsync({ id: card.id, data });
      await queryClient.invalidateQueries({ queryKey: getListBoardCardsQueryKey() });
      setModal(null);
      showSuccess('Card changes saved.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const handleArchive = async (card: BoardCard) => {
    if (!window.confirm(`Archive “${card.title}”?`)) return;
    try {
      await archiveCard.mutateAsync({ id: card.id });
      await queryClient.invalidateQueries({ queryKey: getListBoardCardsQueryKey() });
      showSuccess('Card archived.');
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  };

  const handleScheduled = async (date: string) => {
    await queryClient.invalidateQueries({ queryKey: getListActivitiesQueryKey({ date }) });
    setScheduleCard(null);
    showSuccess('A new occurrence was added to your schedule.');
  };

  if (list.isLoading) {
    return <div className="paper-grain min-h-[100dvh] bg-background text-foreground"><div className="flex min-h-[100dvh]"><BoardRail /><main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-14 lg:py-10"><BoardHeader total={0} onAdd={() => setModal({ category: 'work' })} /><div className="mt-8"><BoardSkeleton /></div></main></div></div>;
  }

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-28 size-[430px] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex min-h-[100dvh]">
        <BoardRail />
        <main className="min-w-0 flex-1 px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
          <BoardHeader total={total} onAdd={() => setModal({ category: 'work' })} />
          {list.isError ? (
            <div className="mt-8 rounded-[24px] border border-destructive/25 bg-destructive/[0.06] px-6 py-12 text-center" role="alert" data-testid="status-board-error">
              <p className="font-display text-[28px] tracking-[-0.03em]">The Board is tucked away.</p>
              <p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-muted-foreground">{errorMessage(list.error)}</p>
              <button type="button" onClick={() => void list.refetch()} data-testid="button-retry-board" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-destructive/30 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"><RotateCcw className="size-3.5" /> Try again</button>
            </div>
          ) : (
            <>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/[0.045] px-4 py-3 text-xs text-muted-foreground" role="status" data-testid="status-board-guidance">
                <span className="flex items-center gap-2"><LayoutGrid className="size-3.5 text-primary" /> A quiet collection of things you may want to do.</span>
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-primary/75">Separate from Today</span>
              </div>
              {total === 0 ? (
                <div className="mt-8 rounded-[26px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-16 text-center" data-testid="status-board-empty">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary"><LayoutGrid className="size-6" strokeWidth={1.6} /></div>
                  <h2 className="mt-5 font-display text-[31px] leading-tight tracking-[-0.035em]">Start with one small possibility.</h2>
                  <p className="mx-auto mt-3 max-w-[390px] text-sm leading-6 text-muted-foreground">The Board holds reusable ideas, errands, and rituals until you decide they belong in a particular day.</p>
                  <button type="button" onClick={() => setModal({ category: 'work' })} data-testid="button-empty-board-add" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"><Plus className="size-4" /> Add your first card</button>
                </div>
              ) : (
                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                   {BOARD_CATEGORIES.map((category) => <BoardColumn key={category} category={category} cards={grouped[category]} pending={ordering || updateCard.isPending || archiveCard.isPending} onAdd={() => setModal({ category })} onSchedule={setScheduleCard} onEdit={(card) => setModal({ card, category: card.category })} onArchive={handleArchive} onMove={moveCard} />)}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {notice && <div className={`fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_18px_50px_hsl(205_32%_20%/0.18)] ${notice.tone === 'error' ? 'border-destructive/25' : 'border-primary/25'}`} role="status" data-testid="status-board-notice">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{notice.tone === 'error' ? <X className="size-3.5" /> : <Check className="size-3.5" />}</span>
        <p className="min-w-0 flex-1 text-xs font-semibold text-foreground">{notice.text}</p>
        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss Board message" data-testid="button-dismiss-board-notice" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button>
      </div>}
      {modal && <BoardModal card={modal.card} defaultCategory={modal.category} pending={createCard.isPending || updateCard.isPending} onSave={(values) => void (modal.card ? handleUpdate(modal.card, values) : handleCreate(values))} onClose={() => setModal(null)} />}
      {scheduleCard && <ScheduleModal card={scheduleCard} onClose={() => setScheduleCard(null)} onScheduled={handleScheduled} />}
    </div>
  );
}

function BoardHeader({ total, onAdd }: { total: number; onAdd: () => void }) {
  return (
    <>
      <nav className="mb-4 flex items-center gap-4 overflow-x-auto border-b border-border/60 pb-3 text-[11px] font-semibold lg:hidden" aria-label="Primary navigation">
        <Link href="/tasks" data-testid="link-mobile-board-tasks" className="text-muted-foreground">Tasks</Link>
        <Link href="/today" data-testid="link-mobile-board-today" className="text-muted-foreground">Today</Link>
        <Link href="/board" data-testid="link-mobile-board-current" className="text-primary">Board</Link>
        <Link href="/retention" data-testid="link-mobile-board-practices" className="text-muted-foreground">Practices</Link>
      </nav>
      <header className="animate-rise flex items-center justify-between border-b border-border/60 pb-5">
        <div className="flex items-center gap-2"><Circle className="size-2.5 fill-accent text-accent" strokeWidth={0} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A private collection</span></div>
        <div className="flex items-center gap-3"><Link href="/today" data-testid="link-board-back-today" className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/45 hover:text-primary sm:inline-flex"><ChevronDown className="size-3.5 rotate-90" /> Today</Link><span className="hidden text-xs text-muted-foreground/75 md:block">{total} {total === 1 ? 'active card' : 'active cards'}</span></div>
      </header>
      <div className="mt-9 flex flex-col gap-6 border-b border-border/60 pb-8 sm:mt-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-rise min-w-0">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">The Board</p>
          <h1 className="mt-3 font-display text-[clamp(3.2rem,8vw,6.4rem)] leading-[0.84] tracking-[-0.07em]" data-testid="text-board-title">Keep it<br /><span className="text-primary">close.</span></h1>
          <p className="mt-6 max-w-[500px] text-[15px] leading-7 text-muted-foreground">Reusable things someone may want to do, held gently until the right day finds them.</p>
        </div>
        <div className="animate-rise delay-1 flex shrink-0 items-center gap-3">
          <span className="hidden font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:block">No schedule pressure</span>
          <button type="button" onClick={onAdd} data-testid="button-add-board-card" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"><Plus className="size-4" strokeWidth={2.2} /> New card</button>
        </div>
      </div>
    </>
  );
}