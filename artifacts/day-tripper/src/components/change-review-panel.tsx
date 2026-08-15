import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Clock3, FileText, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListActivityChangesQueryKey,
  useAddActivityChangeNote,
  useListActivityChanges,
} from '@workspace/api-client-react';
import type { ActivityChange } from '@workspace/api-client-react';

type ChangeReviewPanelProps = {
  date: string;
  onClose: () => void;
};

const changeLabels: Record<ActivityChange['changeType'], string> = {
  moved: 'Moved',
  extended: 'Extended',
  shortened: 'Shortened',
  renamed: 'Renamed',
  removed: 'Removed',
  replaced: 'Replaced',
  completed_later: 'Completed later',
  review_note: 'Review note',
};

function formatChangeTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatTime(value: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const time = new Date();
  time.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(time);
}

function describeChange(change: ActivityChange) {
  if (change.changeType === 'renamed') {
    return change.previousTitle && change.nextTitle
      ? `${change.previousTitle} became ${change.nextTitle}`
      : change.activityTitle ?? 'The activity name changed';
  }
  const previousTime = formatTime(change.previousStartTime);
  const nextTime = formatTime(change.nextStartTime);
  if (change.changeType === 'moved' && previousTime && nextTime) {
    return `${previousTime} moved to ${nextTime}`;
  }
  if (change.changeType === 'extended' && nextTime) {
    return `Now runs until ${formatTime(change.nextEndTime) ?? nextTime}`;
  }
  if (change.changeType === 'shortened' && change.previousEndTime) {
    return `Ended at ${formatTime(change.nextEndTime) ?? 'an earlier time'}`;
  }
  if (change.changeType === 'removed') return 'Taken out of the schedule';
  if (change.changeType === 'completed_later') return 'Marked complete later than planned';
  if (change.changeType === 'replaced') return 'Replaced in the schedule';
  if (change.changeType === 'review_note') return 'A note was added during review';
  return change.activityTitle ? 'The schedule was adjusted' : 'A schedule change was recorded';
}

function ChangeRow({ change }: { change: ActivityChange }) {
  const title = change.activityTitle ?? change.nextTitle ?? change.previousTitle ?? 'Untitled activity';
  const sourceLabel = change.source === 'manual' ? 'Manual edit' : 'Approved planning change';

  return (
    <li className="relative pl-8" data-testid={`row-activity-change-${change.id}`}>
      <span className="absolute left-0 top-1.5 flex size-5 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] text-primary" aria-hidden="true">
        {change.changeType === 'review_note' ? <FileText className="size-2.5" strokeWidth={2} /> : <Clock3 className="size-2.5" strokeWidth={1.8} />}
      </span>
      <div className="border-b border-border/55 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{describeChange(change)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-secondary/70 px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.1em] text-secondary-foreground">
            {changeLabels[change.changeType]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground/75">
          <time dateTime={change.changedAt}>{formatChangeTime(change.changedAt)}</time>
          <span aria-hidden="true">/</span>
          <span>{sourceLabel}</span>
        </div>
        {change.note && <p className="mt-3 rounded-lg bg-background/70 px-3 py-2 text-[11px] leading-5 text-muted-foreground" data-testid={`text-activity-change-note-${change.id}`}>{change.note}</p>}
      </div>
    </li>
  );
}

export function ChangeReviewPanel({ date, onClose }: ChangeReviewPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const params = { date };
  const queryKey = getListActivityChangesQueryKey(params);
  const changes = useListActivityChanges(params, { query: { queryKey } });
  const addNote = useAddActivityChangeNote();
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!addNote.isPending) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [addNote.isPending, onClose]);

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setFormError('Add a few words first, or continue without a note.');
      noteInputRef.current?.focus();
      return;
    }
    setFormError('');
    setSavedMessage('');
    try {
      await addNote.mutateAsync({ data: { scheduledDate: date, note: trimmed } });
      await queryClient.invalidateQueries({ queryKey });
      setNote('');
      setSavedMessage('Your note is part of this day’s history.');
    } catch {
      setFormError('That note could not be saved yet. Your schedule is unchanged.');
    }
  }

  const items = changes.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !addNote.isPending) onClose(); }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-review-title"
        aria-describedby="change-review-description"
        className="paper-grain max-h-[94dvh] w-full max-w-[620px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] outline-none sm:max-h-[90dvh] sm:rounded-[28px] sm:p-7"
        data-testid="dialog-change-review"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">
              <Clock3 className="size-3.5" strokeWidth={1.8} />
              Optional review
            </p>
            <h2 id="change-review-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">What changed today?</h2>
            <p id="change-review-description" className="mt-2 max-w-[470px] text-sm leading-6 text-muted-foreground">A private look back at edits to {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}. Your current schedule stays exactly as it is.</p>
          </div>
          <button type="button" onClick={onClose} disabled={addNote.isPending} aria-label="Close change review" data-testid="button-close-change-review" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-7 rounded-[20px] border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="size-4" strokeWidth={1.7} />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">Nothing to fix here</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">This is simply a record of what you chose. No suggestions are waiting, and opening this review does not replan anything.</p>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Change history</p>
              <h3 className="mt-2 font-display text-[24px] leading-tight tracking-[-0.03em]">The day, in motion.</h3>
            </div>
            {items.length > 0 && <span className="rounded-full border border-border bg-card px-2.5 py-1.5 font-mono-ui text-[10px] text-muted-foreground" data-testid="text-change-history-count">{items.length} {items.length === 1 ? 'entry' : 'entries'}</span>}
          </div>

          {changes.isLoading ? (
            <div className="mt-5 space-y-4" aria-label="Loading change history" data-testid="status-change-history-loading">
              {[1, 2, 3].map((item) => <div key={item} className="flex gap-3 pl-8"><span className="size-5 animate-pulse rounded-full bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-2/5 animate-pulse rounded-full bg-muted" /><div className="h-3 w-3/5 animate-pulse rounded-full bg-muted/70" /></div></div>)}
            </div>
          ) : changes.isError ? (
            <div className="mt-5 rounded-[18px] border border-destructive/20 bg-destructive/[0.05] p-4" role="alert" data-testid="status-change-history-error">
              <p className="text-xs font-semibold">The history took a pause.</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Your saved schedule is still available. Try again when you are ready.</p>
              <button type="button" onClick={() => void changes.refetch()} disabled={changes.isFetching} data-testid="button-retry-change-history" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-[11px] font-semibold hover:border-primary/40 disabled:opacity-50">
                <RotateCcw className={`size-3.5 ${changes.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.8} />
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-5 rounded-[18px] border border-dashed border-primary/25 bg-card/50 px-5 py-8 text-center" data-testid="status-change-history-empty">
              <p className="text-xs font-semibold text-foreground">No recorded changes for this day.</p>
              <p className="mx-auto mt-2 max-w-[340px] text-[11px] leading-5 text-muted-foreground">If you edit the schedule later, the record will appear here. You can close this and keep going.</p>
            </div>
          ) : (
            <ol className="mt-5 space-y-4" aria-label="Schedule change history" data-testid="list-change-history">
              {items.map((change) => <ChangeRow key={change.id} change={change} />)}
            </ol>
          )}
        </div>

        <form onSubmit={(event) => void saveNote(event)} className="mt-7 border-t border-border/65 pt-6" data-testid="form-change-review-note">
          <label htmlFor="change-review-note" className="text-xs font-semibold text-foreground">Add a note <span className="font-normal text-muted-foreground">(optional)</span></label>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">A short explanation can help future-you remember what the day needed.</p>
          <textarea ref={noteInputRef} id="change-review-note" value={note} onChange={(event) => { setNote(event.target.value); setFormError(''); setSavedMessage(''); }} maxLength={1000} rows={3} placeholder="Today needed more breathing room." data-testid="input-change-review-note" className="mt-3 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground/75">
            <span>{note.length}/1000</span>
            {savedMessage && <span className="inline-flex items-center gap-1.5 text-primary" role="status" data-testid="status-change-review-note-saved"><Check className="size-3" strokeWidth={2.4} />{savedMessage}</span>}
          </div>
          {formError && <p className="mt-3 rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-change-review-note-error">{formError}</p>}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-5 text-muted-foreground">You can leave this blank and return to your schedule.</p>
            <button type="submit" disabled={addNote.isPending || !note.trim()} data-testid="button-save-change-review-note" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              {addNote.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              {addNote.isPending ? 'Saving note…' : 'Save note'}
            </button>
          </div>
        </form>

        <div className="mt-6 flex justify-end border-t border-border/65 pt-5">
          <button type="button" onClick={onClose} disabled={addNote.isPending} data-testid="button-continue-current-schedule" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            Continue with this schedule
          </button>
        </div>
      </section>
    </div>
  );
}