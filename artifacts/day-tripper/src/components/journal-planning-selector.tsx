import { useMemo, useState } from 'react';
import { BookOpen, Check, Hash, LockKeyhole, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  getListPlanningJournalCandidatesQueryKey,
  useListPlanningJournalCandidates,
} from '@workspace/api-client-react';
import type { JournalEntry } from '@workspace/api-client-react';

type SessionState = 'include' | 'consider' | 'leave-out';

type JournalPlanningSelectorProps = {
  date: string;
  onContinue: (includeIds: number[], considerIds: number[]) => void;
  onClose: () => void;
};

const stateMeta: Record<SessionState, { label: string; detail: string; className: string }> = {
  include: {
    label: 'Include',
    detail: 'Required context',
    className: 'border-primary/35 bg-primary/10 text-primary',
  },
  consider: {
    label: 'Consider',
    detail: 'Optional context',
    className: 'border-accent/35 bg-accent/10 text-accent-foreground',
  },
  'leave-out': {
    label: 'Leave out',
    detail: 'Not sent',
    className: 'border-border bg-muted/55 text-muted-foreground',
  },
};

function JournalCandidateSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading planning-available notes" data-testid="status-planning-journal-loading">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-[19px] border border-border/60 bg-card/55 p-4">
          <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
          <div className="mt-4 h-4 w-11/12 animate-pulse rounded-full bg-muted" />
          <div className="mt-2 h-3 w-3/5 animate-pulse rounded-full bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function noteDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function CandidateCard({
  entry,
  state,
  onStateChange,
}: {
  entry: JournalEntry;
  state: SessionState;
  onStateChange: (state: SessionState) => void;
}) {
  return (
    <article className={`rounded-[19px] border p-4 transition-colors sm:p-5 ${state === 'leave-out' ? 'border-border/70 bg-card/45' : 'border-primary/25 bg-card/80'}`} data-testid={`card-planning-journal-${entry.id}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${state === 'include' ? 'bg-primary text-primary-foreground' : state === 'consider' ? 'bg-accent/25 text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
          {state === 'include' ? <Check className="size-4" strokeWidth={2.4} /> : state === 'consider' ? <Sparkles className="size-3.5" strokeWidth={1.8} /> : <X className="size-3.5" strokeWidth={1.8} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono-ui text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              <BookOpen className="size-3 text-primary" strokeWidth={1.8} />
              {noteDate(entry.recordedAt)}
            </p>
            <span className={`rounded-full border px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.1em] ${stateMeta[state].className}`} data-testid={`text-planning-journal-state-${entry.id}`}>
              {stateMeta[state].label}
            </span>
          </div>
          <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${state === 'leave-out' ? 'text-muted-foreground' : 'text-foreground'}`} data-testid={`text-planning-journal-content-${entry.id}`}>{entry.content}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entry.topic && <span className="rounded-full bg-secondary px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.1em] text-secondary-foreground">{entry.topic}</span>}
            {entry.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.055] px-2 py-1 text-[10px] text-primary"><Hash className="size-2.5" strokeWidth={2} />{tag}</span>)}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-1.5 border-t border-border/55 pt-3" role="group" aria-label={`Choose how to use journal note ${entry.id}`}>
            {(Object.keys(stateMeta) as SessionState[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onStateChange(option)}
                aria-pressed={state === option}
                data-testid={`button-planning-journal-${option}-${entry.id}`}
                className={`min-h-10 rounded-lg border px-2 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state === option ? stateMeta[option].className : 'border-border/70 bg-background/45 text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}
              >
                <span className="block">{stateMeta[option].label}</span>
                <span className="mt-0.5 block text-[9px] font-normal opacity-75">{stateMeta[option].detail}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function JournalPlanningSelector({ date, onContinue, onClose }: JournalPlanningSelectorProps) {
  const candidatesQuery = useListPlanningJournalCandidates(
    { currentDate: date },
    { query: { queryKey: getListPlanningJournalCandidatesQueryKey({ currentDate: date }) } },
  );
  const candidates = candidatesQuery.data ?? [];
  const [states, setStates] = useState<Record<number, SessionState>>({});
  const [selectedTag, setSelectedTag] = useState('all');
  const [error, setError] = useState('');

  const tags = useMemo(
    () => Array.from(new Set(candidates.flatMap((entry) => entry.tags))).sort((a, b) => a.localeCompare(b)),
    [candidates],
  );
  const visibleCandidates = useMemo(
    () => selectedTag === 'all' ? candidates : candidates.filter((entry) => entry.tags.includes(selectedTag)),
    [candidates, selectedTag],
  );
  const includeCount = candidates.filter((entry) => states[entry.id] === 'include').length;
  const considerCount = candidates.filter((entry) => states[entry.id] === 'consider').length;

  function continueToDetails() {
    setError('');
    onContinue(
      candidates.filter((entry) => states[entry.id] === 'include').map((entry) => entry.id),
      candidates.filter((entry) => states[entry.id] === 'consider').map((entry) => entry.id),
    );
  }

  return (
    <div className="mt-7 space-y-5" data-testid="section-planning-journal-selection">
      <div className="rounded-[22px] border border-primary/20 bg-primary/[0.055] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><BookOpen className="size-4" strokeWidth={1.8} /></span>
          <div className="min-w-0">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">Before the details</p>
            <h3 className="mt-2 font-display text-[27px] leading-tight tracking-[-0.035em]">What deserves attention now?</h3>
            <p className="mt-2 max-w-[590px] text-sm leading-6 text-muted-foreground">Only notes you marked available for planning appear here. Choose the weight each one should have in this session. Nothing becomes an activity from this step.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-background/65 px-3 py-3"><p className="font-mono-ui text-lg text-primary">{includeCount}</p><p className="mt-1 text-[11px] text-muted-foreground">required context</p></div>
          <div className="rounded-xl bg-background/65 px-3 py-3"><p className="font-mono-ui text-lg text-accent-foreground">{considerCount}</p><p className="mt-1 text-[11px] text-muted-foreground">optional context</p></div>
          <div className="rounded-xl bg-background/65 px-3 py-3"><p className="font-mono-ui text-lg text-muted-foreground">{Math.max(0, candidates.length - includeCount - considerCount)}</p><p className="mt-1 text-[11px] text-muted-foreground">left out</p></div>
        </div>
      </div>

      {candidatesQuery.isLoading ? <JournalCandidateSkeleton /> : candidatesQuery.isError ? (
        <div className="rounded-[20px] border border-destructive/20 bg-destructive/[0.05] p-5" role="alert" data-testid="status-planning-journal-error">
          <p className="text-sm font-semibold">Planning notes are taking a pause.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">We could not load the planning-available stream. Nothing will be sent until you choose it here.</p>
          <button type="button" onClick={() => void candidatesQuery.refetch()} disabled={candidatesQuery.isFetching} data-testid="button-retry-planning-journal" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-primary/40 disabled:opacity-50"><RotateCcw className={`size-3.5 ${candidatesQuery.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.8} /> Try again</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-primary/25 bg-background/35 px-5 py-10 text-center" data-testid="status-planning-journal-empty">
          <LockKeyhole className="mx-auto size-5 text-primary" strokeWidth={1.7} />
          <p className="mt-4 font-display text-[23px] tracking-[-0.03em]">No planning notes here.</p>
          <p className="mx-auto mt-2 max-w-[390px] text-xs leading-5 text-muted-foreground">Your private notes stay private. You can continue with time, commitments, and an optional intention instead.</p>
        </div>
      ) : (
        <>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Narrow planning notes by tag">
              <span className="mr-1 font-mono-ui text-[9px] uppercase tracking-[0.13em] text-muted-foreground">Focus</span>
              <button type="button" onClick={() => setSelectedTag('all')} aria-pressed={selectedTag === 'all'} data-testid="button-planning-tag-all" className={`rounded-full border px-3 py-2 text-[10px] font-semibold ${selectedTag === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground'}`}>All notes</button>
              {tags.map((tag) => <button key={tag} type="button" onClick={() => setSelectedTag(tag)} aria-pressed={selectedTag === tag} data-testid={`button-planning-tag-${tag}`} className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-[10px] font-semibold ${selectedTag === tag ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground'}`}><Hash className="size-2.5" strokeWidth={2} />{tag}</button>)}
            </div>
          )}
          {visibleCandidates.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-border bg-card/45 px-5 py-8 text-center" data-testid="status-planning-journal-filter-empty"><p className="text-xs font-semibold">No notes carry that tag.</p><button type="button" onClick={() => setSelectedTag('all')} data-testid="button-clear-planning-tag" className="mt-3 text-xs font-semibold text-primary hover:underline">Show all notes</button></div>
          ) : (
            <div className="space-y-3">
              {visibleCandidates.map((entry) => <CandidateCard key={entry.id} entry={entry} state={states[entry.id] ?? 'leave-out'} onStateChange={(state) => setStates((current) => ({ ...current, [entry.id]: state }))} />)}
            </div>
          )}
        </>
      )}

      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-planning-selection-error">{error}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-border/65 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={1.8} /><span>Leave out means the note is not sent. You can change these choices before asking.</span></div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onClose} data-testid="button-cancel-planning-selection" className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button>
          <button type="button" onClick={continueToDetails} disabled={candidatesQuery.isLoading || candidatesQuery.isError} data-testid="button-continue-planning-selection" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">Continue to details <Sparkles className="size-3.5" strokeWidth={1.8} /></button>
        </div>
      </div>
    </div>
  );
}