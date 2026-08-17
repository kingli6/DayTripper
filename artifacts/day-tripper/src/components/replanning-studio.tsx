import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Clock3, LockKeyhole, RotateCcw, Sparkles, X } from 'lucide-react';
import { useApplyReplanningProposal, useCreateReplanningProposal } from '@workspace/api-client-react';
import type { Activity, ReplanningChange, ReplanningProposal } from '@workspace/api-client-react';

type ReplanningStudioProps = {
  date: string;
  activities: Activity[];
  onClose: () => void;
  onApplied: (count: number) => Promise<void> | void;
};

type ReviewChange = ReplanningChange & {
  selected: boolean;
  removed: boolean;
  error?: string;
};

const categories = ['work', 'recovery', 'managing', 'social', 'fun'] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
  work: 'Work',
  recovery: 'Recovery',
  managing: 'Managing',
  social: 'Social',
  fun: 'Fun',
};

function minutes(value: string | null) {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function validTime(value: string | null): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value) && minutes(value) !== null);
}

function labelTime(value: string | null) {
  if (!value) return 'No time set';
  const parsed = minutes(value);
  if (parsed === null) return value;
  const formatted = new Date();
  formatted.setHours(Math.floor(parsed / 60), parsed % 60, 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(formatted);
}

function labelDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function actionLabel(action: ReplanningChange['action']) {
  return {
    keep: 'Stays',
    move: 'Moves',
    shorten: 'Shortens',
    remove: 'Removes',
    add: 'Adds',
  }[action];
}

function actionTone(action: ReplanningChange['action']) {
  return {
    keep: 'border-border bg-muted/70 text-muted-foreground',
    move: 'border-primary/25 bg-primary/10 text-primary',
    shorten: 'border-accent/30 bg-accent/10 text-accent-foreground',
    remove: 'border-destructive/25 bg-destructive/10 text-destructive',
    add: 'border-secondary bg-secondary text-secondary-foreground',
  }[action];
}

function errorMessage(error: unknown) {
  const data = (error as { data?: unknown })?.data;
  return data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : null;
}

function toReviewChange(change: ReplanningChange): ReviewChange {
  return { ...change, selected: change.action !== 'keep', removed: false };
}

function ProposalSkeleton() {
  return (
    <div className="space-y-3" aria-label="Preparing a review" data-testid="status-replanning-loading">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-[18px] border border-border/60 bg-card/55 p-4">
          <div className="flex gap-3">
            <span className="size-5 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-2/5 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-muted/70" />
              <div className="h-3 w-3/5 animate-pulse rounded-full bg-muted/55" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeCard({ change, index, onToggle, onRestore, onUpdate, onRemove }: {
  change: ReviewChange;
  index: number;
  onToggle: () => void;
  onRestore: () => void;
  onUpdate: (updates: Partial<Pick<ReviewChange, 'title' | 'proposedStartTime' | 'proposedEndTime' | 'proposedDate' | 'category'>>) => void;
  onRemove: () => void;
}) {
  if (change.removed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-dashed border-border/80 bg-background/35 px-4 py-3" data-testid={`status-replanning-removed-${index}`}>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted-foreground line-through">{change.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/75">Left out of this review. Nothing has changed.</p>
        </div>
        <button type="button" onClick={onRestore} data-testid={`button-restore-replanning-${index}`} className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Keep in review</button>
      </div>
    );
  }

  const hasProposedTime = change.proposedStartTime || change.proposedEndTime;
  const isKeep = change.action === 'keep';

  return (
    <article className={`rounded-[19px] border bg-background/65 p-4 transition-colors ${change.error ? 'border-destructive/45' : change.selected ? 'border-primary/35' : 'border-border/75'}`} data-testid={`card-replanning-change-${index}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} disabled={isKeep} aria-pressed={change.selected} aria-label={`${change.selected ? 'Do not accept' : 'Accept'} ${change.title}`} data-testid={`button-toggle-replanning-${index}`} className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isKeep ? 'cursor-default border-border bg-muted text-muted-foreground' : change.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-transparent'}`}>
          <Check className="size-3" strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] ${actionTone(change.action)}`}>{actionLabel(change.action)}</span>
                {change.activityId && isKeep && <span className="font-mono-ui text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Protected</span>}
              </div>
              {change.action !== 'remove' && !isKeep ? (
                <input value={change.title} onChange={(event) => onUpdate({ title: event.target.value })} aria-label={`Title for proposed activity ${index + 1}`} data-testid={`input-replanning-title-${index}`} className="mt-3 min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              ) : (
                <h3 className="mt-3 text-sm font-semibold leading-5 text-foreground" data-testid={`text-replanning-title-${index}`}>{change.title}</h3>
              )}
            </div>
            {!isKeep && <button type="button" onClick={onRemove} aria-label={`Remove ${change.title} from this review`} data-testid={`button-remove-replanning-${index}`} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="size-4" strokeWidth={1.8} /></button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-muted-foreground">
            {change.action === 'remove' ? (
              <><span>{labelDate(change.currentDate ?? change.proposedDate)}</span><ArrowRight className="size-3 text-destructive" /><span>Not carried forward</span></>
            ) : (
              <><span className={change.action === 'add' ? 'text-primary' : ''}>{labelDate(change.proposedDate)}</span>{hasProposedTime && <><span aria-hidden="true">·</span><span>{labelTime(change.proposedStartTime)}{change.proposedEndTime ? ` – ${labelTime(change.proposedEndTime)}` : ''}</span></>}</>
            )}
          </div>
          {change.action !== 'remove' && !isKeep && (
            <div className="mt-4 grid gap-3 border-t border-border/55 pt-3 sm:grid-cols-3">
              <label className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Date
                <input type="date" value={change.proposedDate} onChange={(event) => onUpdate({ proposedDate: event.target.value })} data-testid={`input-replanning-date-${index}`} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs normal-case tracking-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>
              <label className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Time
                <span className="mt-1 grid grid-cols-2 gap-1.5">
                  <input type="time" value={change.proposedStartTime ?? ''} onChange={(event) => onUpdate({ proposedStartTime: event.target.value || null })} aria-label={`Start time for ${change.title}`} data-testid={`input-replanning-start-${index}`} className="min-h-10 w-full rounded-lg border border-input bg-card px-2 py-2 text-xs normal-case tracking-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                  <input type="time" value={change.proposedEndTime ?? ''} onChange={(event) => onUpdate({ proposedEndTime: event.target.value || null })} aria-label={`End time for ${change.title}`} data-testid={`input-replanning-end-${index}`} className="min-h-10 w-full rounded-lg border border-input bg-card px-2 py-2 text-xs normal-case tracking-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </span>
              </label>
              <label className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Category
                <select value={change.category ?? ''} onChange={(event) => onUpdate({ category: (event.target.value || null) as ReviewChange['category'] })} data-testid={`select-replanning-category-${index}`} className="mt-1 min-h-10 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs normal-case tracking-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                  <option value="">Uncategorized</option>
                  {categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
                </select>
              </label>
            </div>
          )}
          {change.note && <p className="mt-3 border-t border-border/55 pt-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Note:</span> {change.note}</p>}
          <p className="mt-3 rounded-lg bg-muted/55 px-3 py-2 text-[11px] leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Why:</span> {change.reason}</p>
          {change.error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive" role="alert" data-testid={`status-replanning-change-error-${index}`}>{change.error}</p>}
        </div>
      </div>
    </article>
  );
}

export function ReplanningStudio({ date, activities, onClose, onApplied }: ReplanningStudioProps) {
  const createProposal = useCreateReplanningProposal();
  const applyProposal = useApplyReplanningProposal();
  const dialogRef = useRef<HTMLElement>(null);
  const intentionRef = useRef<HTMLTextAreaElement>(null);
  const [proposal, setProposal] = useState<ReplanningProposal | null>(null);
  const [changes, setChanges] = useState<ReviewChange[]>([]);
  const [intention, setIntention] = useState('');
  const [currentTimeValue, setCurrentTimeValue] = useState(currentTime());
  const [openUntil, setOpenUntil] = useState('22:00');
  const [planningStyle, setPlanningStyle] = useState<'lighter' | 'balanced' | 'fuller'>('balanced');
  const [fixedCommitments, setFixedCommitments] = useState('');
  const [formError, setFormError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const lockedActivities = useMemo(() => activities.filter((activity) => activity.locked), [activities]);
  const openChangeCount = changes.filter((change) => !change.removed && change.action !== 'keep').length;
  const selectedCount = changes.filter((change) => change.selected && !change.removed && change.action !== 'keep').length;
  const pending = createProposal.isPending || applyProposal.isPending;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (proposal) dialogRef.current?.focus();
      else intentionRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [proposal]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [onClose, pending]);

  async function create() {
    if (!intention.trim()) {
      setFormError('A short intention helps keep the version workable.');
      return;
    }
    if (!validTime(currentTimeValue) || !validTime(openUntil) || (minutes(openUntil) ?? 0) <= (minutes(currentTimeValue) ?? 0)) {
      setFormError('Choose an open window that starts now and ends later.');
      return;
    }
    setFormError('');
    setSuccessMessage('');
    try {
      const result = await createProposal.mutateAsync({
        data: {
          currentDate: date,
          currentTime: currentTimeValue,
          availableTime: [{ startTime: currentTimeValue, endTime: openUntil }],
          intention: intention.trim(),
          fixedCommitments: fixedCommitments.trim() || lockedActivities.map((activity) => `${activity.title} at ${activity.startTime}`).join(', ') || null,
          planningStyle,
        },
      });
      setProposal(result);
      setChanges(result.changes.map(toReviewChange));
      setReviewError('');
    } catch (error) {
      setFormError(errorMessage(error) ?? 'The remaining day could not be prepared. Nothing has changed.');
    }
  }

  function updateChange(id: string, updates: Partial<Pick<ReviewChange, 'title' | 'proposedStartTime' | 'proposedEndTime' | 'proposedDate' | 'category'>>) {
    setChanges((current) => current.map((change) => change.id === id ? { ...change, ...updates, error: undefined } : change));
    setReviewError('');
  }

  function selectedChanges(mode: 'selected' | 'all') {
    return changes.filter((change) => !change.removed && change.action !== 'keep' && (mode === 'all' || change.selected));
  }

  async function apply(mode: 'selected' | 'all') {
    const candidates = selectedChanges(mode);
    if (!candidates.length) {
      setReviewError(mode === 'selected' ? 'Select at least one change to accept.' : 'There are no changes left to accept.');
      return;
    }
    const invalid = candidates.filter((change) => !change.title.trim() || !change.proposedDate || (change.proposedStartTime && !validTime(change.proposedStartTime)) || (change.proposedStartTime && change.proposedEndTime && (minutes(change.proposedEndTime) ?? 0) <= (minutes(change.proposedStartTime) ?? 0)));
    if (invalid.length) {
      setChanges((current) => current.map((change) => invalid.some((item) => item.id === change.id) ? { ...change, error: 'Check the title and proposed time before accepting.' } : change));
      setReviewError('A few changes need a small correction before they can be accepted.');
      return;
    }
    if (!proposal) return;
    setReviewError('');
    try {
      const result = await applyProposal.mutateAsync({
        data: {
          currentDate: date,
          snapshot: proposal.snapshotActivities.map((activity) => ({ id: activity.id, updatedAt: activity.updatedAt })),
          changes: candidates.map((change) => ({
            id: change.id,
            activityId: change.activityId,
            action: change.action,
            title: change.title.trim(),
            proposedDate: change.proposedDate,
            proposedStartTime: change.proposedStartTime,
            proposedEndTime: change.proposedEndTime,
            category: change.category,
            note: change.note,
          })),
        },
      });
      const appliedCount = result.updatedActivities.length + result.addedActivities.length + result.removedActivityIds.length;
      setSuccessMessage(`${appliedCount} approved ${appliedCount === 1 ? 'change is' : 'changes are'} now part of your day.`);
      setChanges((current) => current.map((change) => candidates.some((item) => item.id === change.id) ? { ...change, removed: true, selected: false } : change));
      await onApplied(appliedCount);
    } catch (error) {
      setReviewError(errorMessage(error) ?? 'The schedule changed while this review was open. Refresh the day and review this version again; nothing was partially applied.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="replanning-title" aria-describedby="replanning-description" className="paper-grain max-h-[95dvh] w-full max-w-[760px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] outline-none sm:max-h-[92dvh] sm:rounded-[28px] sm:p-7" data-testid="dialog-replanning-studio">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary"><Sparkles className="size-3.5" strokeWidth={1.8} /> Remaining day review</p>
            <h2 id="replanning-title" className="mt-2 font-display text-[31px] leading-tight tracking-[-0.04em]">{proposal ? 'Look over the rest of today.' : 'Re-plan the rest of today.'}</h2>
            <p id="replanning-description" className="mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">{proposal ? 'Here is one workable version. You decide what moves, what stays, and what is not worth carrying forward.' : 'Ask for one gentle, workable version of what comes next. Your saved day stays untouched until you approve changes.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close remaining day review" data-testid="button-close-replanning" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><X className="size-4" strokeWidth={1.8} /></button>
        </div>

        {!proposal && !createProposal.isPending && (
          <div className="mt-7 rounded-[20px] border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Clock3 className="size-4" strokeWidth={1.7} /></span>
              <div><p className="text-xs font-semibold text-foreground">A review, not a rewrite</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Manual edits remain authoritative. Locked activities are included as protected context. Nothing is saved by asking.</p></div>
            </div>
          </div>
        )}

        {createProposal.isPending ? (
          <div className="mt-7"><ProposalSkeleton /></div>
        ) : !proposal ? (
          <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="mt-6 space-y-5" data-testid="form-replanning">
            <div>
              <label htmlFor="replanning-intention" className="text-xs font-semibold text-foreground">What changed, and what would help now?</label>
              <textarea ref={intentionRef} id="replanning-intention" value={intention} onChange={(event) => setIntention(event.target.value)} rows={4} maxLength={2000} placeholder="The morning ran long. I still want to finish the report, eat, and have a little room before dinner." data-testid="input-replanning-intention" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label htmlFor="replanning-current-time" className="text-xs font-semibold text-foreground">It is now
                <input id="replanning-current-time" type="time" value={currentTimeValue} onChange={(event) => setCurrentTimeValue(event.target.value)} data-testid="input-replanning-current-time" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>
              <label htmlFor="replanning-open-until" className="text-xs font-semibold text-foreground sm:col-span-2">Consider time until
                <input id="replanning-open-until" type="time" value={openUntil} onChange={(event) => setOpenUntil(event.target.value)} data-testid="input-replanning-open-until" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </label>
            </div>
            <div>
              <label htmlFor="replanning-style" className="text-xs font-semibold text-foreground">How much should this version hold?</label>
              <select id="replanning-style" value={planningStyle} onChange={(event) => setPlanningStyle(event.target.value as typeof planningStyle)} data-testid="select-replanning-style" className="mt-2 min-h-11 w-full appearance-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                <option value="lighter">Lighter — leave more room</option>
                <option value="balanced">Balanced — keep it workable</option>
                <option value="fuller">Fuller — fit a little more in</option>
              </select>
            </div>
            <div>
              <label htmlFor="replanning-commitments" className="text-xs font-semibold text-foreground">Anything else that must stay put? <span className="font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="replanning-commitments" value={fixedCommitments} onChange={(event) => setFixedCommitments(event.target.value)} rows={2} placeholder="A pickup at 5, or something you cannot move." data-testid="input-replanning-commitments" className="mt-2 w-full resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div className="rounded-[18px] border border-border/75 bg-card/55 p-4">
              <div className="flex items-start gap-3">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.8} />
                <div><p className="text-xs font-semibold text-foreground">{lockedActivities.length ? `${lockedActivities.length} protected ${lockedActivities.length === 1 ? 'activity' : 'activities'} will stay in place` : 'Locked activities stay protected'}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{lockedActivities.length ? lockedActivities.map((activity) => `${activity.title} at ${labelTime(activity.startTime)}`).join(' · ') : 'Lock an activity before asking if it cannot move.'}</p></div>
              </div>
            </div>
            {formError && <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-replanning-form-error">{formError}</p>}
            <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[350px] text-[11px] leading-5 text-muted-foreground">The current schedule is only read as context. Approval is the moment anything can change.</p>
              <button type="submit" disabled={createProposal.isPending} data-testid="button-create-replanning-proposal" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55"><Sparkles className="size-3.5" strokeWidth={1.8} />Ask for one workable version</button>
            </div>
          </form>
        ) : (
          <div className="mt-7 space-y-5" data-testid="status-replanning-proposal-ready">
            <div className="rounded-[22px] border border-primary/20 bg-primary/[0.06] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">One version to review</p><h3 className="mt-2 font-display text-[27px] leading-tight tracking-[-0.03em]">The day can bend here.</h3></div>
                <span className="rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 font-mono-ui text-[10px] text-primary" data-testid="text-replanning-count">{selectedCount} selected</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Changes below are still only suggestions. Adjust the details, leave something out, or accept the version when it feels like yours.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{openChangeCount}</p><p className="mt-1 text-[11px] text-muted-foreground">changes to consider</p></div>
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{changes.filter((change) => !change.removed && change.action === 'keep').length}</p><p className="mt-1 text-[11px] text-muted-foreground">stays protected</p></div>
                <div className="rounded-xl bg-background/70 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{proposal.openTime.length}</p><p className="mt-1 text-[11px] text-muted-foreground">open stretches left</p></div>
              </div>
            </div>

            <div className="rounded-[22px] border border-border/75 bg-card/55 p-4 sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Read each change</p><h3 className="mt-2 font-display text-[23px] leading-tight tracking-[-0.03em]">What would be different?</h3></div><p className="text-[11px] text-muted-foreground">Nothing saved yet.</p></div>
              <div className="mt-5 space-y-3">
                {changes.map((change, index) => <ChangeCard key={change.id} change={change} index={index} onToggle={() => setChanges((current) => current.map((item) => item.id === change.id ? { ...item, selected: !item.selected } : item))} onRestore={() => setChanges((current) => current.map((item) => item.id === change.id ? { ...item, removed: false } : item))} onRemove={() => setChanges((current) => current.map((item) => item.id === change.id ? { ...item, removed: true, selected: false } : item))} onUpdate={(updates) => updateChange(change.id, updates)} />)}
                {changes.length === 0 && <div className="rounded-xl border border-dashed border-primary/25 bg-background/50 px-4 py-8 text-center"><p className="text-xs font-semibold text-foreground">No changes were needed.</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">The rest of today can stay as it is. Open time is still a valid plan.</p></div>}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <details className="rounded-[20px] border border-border/75 bg-card/55 p-4" open><summary className="cursor-pointer list-none text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">What the version assumes</summary><ul className="mt-4 space-y-2 border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">{proposal.assumptions.length ? proposal.assumptions.map((item, index) => <li key={`${item}-${index}`} data-testid={`text-replanning-assumption-${index}`}>{item}</li>) : <li>No extra assumptions were needed.</li>}</ul></details>
              <details className="rounded-[20px] border border-border/75 bg-card/55 p-4" open><summary className="cursor-pointer list-none text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">Tensions to notice</summary><div className="mt-4 border-t border-border/60 pt-4">{proposal.conflicts.length ? <ul className="space-y-3 text-xs leading-5 text-muted-foreground">{proposal.conflicts.map((item, index) => <li key={`${item.description}-${index}`} data-testid={`text-replanning-conflict-${index}`}><span className="font-medium text-foreground">{item.description}</span>{item.relatedActivityTitles.length > 0 && <span className="mt-1 block">Related: {item.relatedActivityTitles.join(', ')}</span>}</li>)}</ul> : <p className="text-xs leading-5 text-muted-foreground">No conflicts were listed for this version.</p>}</div></details>
            </div>

            {successMessage && <div className="flex items-start gap-3 rounded-[18px] border border-primary/25 bg-primary/10 px-4 py-3" role="status" data-testid="status-replanning-success"><Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.2} /><p className="text-xs font-semibold text-foreground">{successMessage}</p></div>}
            {reviewError && <div className="flex items-start gap-3 rounded-[18px] border border-destructive/25 bg-destructive/10 px-4 py-3" role="alert" data-testid="status-replanning-review-error"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.8} /><p className="text-xs leading-5 text-destructive">{reviewError}</p></div>}
            <div className="flex flex-col gap-3 border-t border-border/65 pt-5">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => { setProposal(null); setChanges([]); setReviewError(''); setSuccessMessage(''); window.requestAnimationFrame(() => intentionRef.current?.focus()); }} disabled={pending} data-testid="button-replan-again" className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"><RotateCcw className="size-3.5" strokeWidth={1.8} /> Try another version</button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={() => void apply('selected')} disabled={pending || selectedCount === 0} data-testid="button-accept-selected-replanning" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary/35 bg-primary/[0.06] px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">{applyProposal.isPending && <span className="size-3.5 animate-pulse rounded-full bg-primary" />}Accept selected</button>
                  <button type="button" onClick={() => void apply('all')} disabled={pending || openChangeCount === 0} data-testid="button-accept-all-replanning" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">{applyProposal.isPending && <span className="size-3.5 animate-pulse rounded-full bg-primary-foreground/70" />}Accept all changes</button>
                </div>
              </div>
              <p className="text-right text-[11px] leading-5 text-muted-foreground">Approval applies only the changes you choose. Manual edits and protected activities remain authoritative.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}