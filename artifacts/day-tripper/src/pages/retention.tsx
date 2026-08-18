import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, useLocation, useParams } from 'wouter';
import { useUser } from '@clerk/react';
import {
  getGetRetentionPracticeQueryKey,
  getListRetentionObservationsQueryKey,
  getListRetentionPracticesQueryKey,
  useCreateRetentionObservation,
  useCreateRetentionPractice,
  useDeleteRetentionPractice,
  useGetRetentionPractice,
  useListRetentionObservations,
  useListRetentionPractices,
  useUpdateRetentionPractice,
} from '@workspace/api-client-react';
import type { RetentionObservation, RetentionPractice, RetentionPracticeInput } from '@workspace/api-client-react';
import { ArrowLeft, BookOpen, CalendarDays, Check, ChevronRight, Circle, Pencil, Plus, Trash2 } from 'lucide-react';
import { RetentionChart } from '@/components/retention/retention-chart';
import { RetentionPracticeForm } from '@/components/retention/retention-practice-form';

function localDate() {
  const value = new Date();
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, '0')}-${`${value.getDate()}`.padStart(2, '0')}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'That change could not be saved. Try once more.';
}

function BrandMark() {
  return (
    <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
      <span className="font-display -mt-0.5">d</span>
      <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
    </div>
  );
}

function RetentionRail() {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col justify-between bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <div>
        <Link href="/today" className="flex items-center gap-3 px-2" data-testid="link-retention-brand">
          <BrandMark />
          <div>
            <p className="font-display text-[22px] leading-none tracking-[-0.03em]">Day Tripper</p>
            <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">a softer daily practice</p>
          </div>
        </Link>
        <nav className="mt-16" aria-label="Private space">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">Your space</p>
          <Link href="/today" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-retention-today">
            <CalendarDays className="size-4" strokeWidth={1.8} />
            Today
          </Link>
          <Link href="/retention" className="mt-1 flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]" data-testid="link-retention-practices">
            <Circle className="size-3.5 fill-sidebar-primary text-sidebar-primary" strokeWidth={1.7} />
            Practices
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </Link>
        </nav>
        <div className="mt-14 px-3">
          <div className="mb-4 flex size-8 items-center justify-center rounded-full border border-sidebar-primary/35 bg-sidebar-primary/10 text-sidebar-primary">
            <BookOpen className="size-3.5" strokeWidth={1.8} />
          </div>
          <p className="font-display text-[20px] leading-[1.15] text-sidebar-foreground/90">Keep what you learn close.</p>
          <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/55">A quiet record of capability, not a scorecard.</p>
        </div>
      </div>
      <div className="border-t border-sidebar-border/80 px-3 pt-5">
        <p className="flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
          <span className="size-1.5 rounded-full bg-sidebar-primary" />
          Private by design
        </p>
        <p className="mt-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35">Retention / 01</p>
      </div>
    </aside>
  );
}

function RetentionHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border/60 bg-sidebar px-5 py-4 text-sidebar-foreground lg:hidden">
      <Link href="/today" className="flex items-center gap-3" data-testid="link-retention-mobile-brand">
        <BrandMark />
        <span className="font-display text-[21px] tracking-[-0.03em]">Day Tripper</span>
      </Link>
      <Link href="/today" className="rounded-full border border-sidebar-primary/35 px-3 py-2 text-[11px] font-semibold" data-testid="link-retention-mobile-today">
        Today
      </Link>
    </header>
  );
}

function PracticesLoading() {
  return (
    <div className="space-y-3" aria-label="Loading practices" data-testid="status-retention-loading">
      {[1, 2, 3].map((item) => <div key={item} className="h-[92px] animate-pulse rounded-[20px] border border-border/60 bg-card/60" />)}
    </div>
  );
}

function PracticeList({
  practices,
  onNew,
}: {
  practices: RetentionPractice[];
  onNew: () => void;
}) {
  const [, setLocation] = useLocation();
  if (!practices.length) {
    return (
      <div className="rounded-[26px] border border-dashed border-primary/30 bg-primary/[0.045] px-6 py-14 text-center sm:px-12" data-testid="status-retention-empty">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><Circle className="size-5" strokeWidth={1.6} /></div>
        <h2 className="mt-5 font-display text-[29px] leading-tight tracking-[-0.03em]">A place for something you are learning.</h2>
        <p className="mx-auto mt-3 max-w-[400px] text-sm leading-6 text-muted-foreground">Add one capability and record the moments when it feels available. No target to hit.</p>
        <button type="button" onClick={onNew} data-testid="button-empty-add-practice" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5"><Plus className="size-3.5" strokeWidth={2.2} /> Add a practice</button>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="list-retention-practices">
      {practices.map((practice) => (
        <button type="button" key={practice.id} onClick={() => setLocation(`/retention/${practice.id}`)} data-testid={`card-retention-practice-${practice.id}`} className="group flex w-full items-center justify-between gap-5 rounded-[20px] border border-border/75 bg-card/75 px-5 py-5 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/40 sm:px-6">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[24px] leading-none tracking-[-0.035em] text-foreground">{practice.name}</span>
              <span className="rounded-full bg-secondary px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-secondary-foreground">{practice.retentionSpeed}</span>
            </span>
            <span className="mt-2 block text-xs text-muted-foreground">Measured in {practice.unit} · Higher is better</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" strokeWidth={1.6} />
        </button>
      ))}
    </div>
  );
}

function PracticeDetail({
  practiceId,
  onEdit,
  onDelete,
}: {
  practiceId: number;
  onEdit: (practice: RetentionPractice) => void;
  onDelete: () => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const practiceQuery = useGetRetentionPractice(practiceId, { query: { queryKey: getGetRetentionPracticeQueryKey(practiceId) } });
  const observationsQuery = useListRetentionObservations(practiceId, { query: { queryKey: getListRetentionObservationsQueryKey(practiceId) } });
  const createObservation = useCreateRetentionObservation();
  const [date, setDate] = useState(localDate());
  const [value, setValue] = useState('');
  const [context, setContext] = useState('');
  const [formError, setFormError] = useState('');
  const practice = practiceQuery.data;
  const observations = useMemo(
    () => [...(observationsQuery.data ?? [])].sort((a, b) => b.recordedDate.localeCompare(a.recordedDate)),
    [observationsQuery.data],
  );

  function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericValue = Number(value);
    if (!date || !value || !Number.isFinite(numericValue) || numericValue < 0) {
      setFormError('Add a date and a number at or above zero.');
      return;
    }
    setFormError('');
    createObservation.mutate({ practiceId, data: { recordedDate: date, value: numericValue, context: context.trim() || null } }, {
      onSuccess: () => {
        setValue('');
        setContext('');
        void queryClient.invalidateQueries({ queryKey: getListRetentionObservationsQueryKey(practiceId) });
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  }

  if (practiceQuery.isLoading || observationsQuery.isLoading) {
    return <div className="space-y-5" aria-label="Loading practice" data-testid="status-retention-detail-loading"><div className="h-24 animate-pulse rounded-[22px] bg-card/65" /><div className="h-[320px] animate-pulse rounded-[22px] bg-card/65" /></div>;
  }
  if (practiceQuery.isError || !practice) {
    return <div className="rounded-[22px] border border-destructive/25 bg-destructive/[0.06] p-6 text-sm text-destructive" role="alert" data-testid="status-retention-detail-error">This practice is not available right now. <button type="button" onClick={() => void practiceQuery.refetch()} className="font-semibold underline underline-offset-4" data-testid="button-retry-retention-detail">Try again</button></div>;
  }
  if (observationsQuery.isError) {
    return <div className="rounded-[22px] border border-destructive/25 bg-destructive/[0.06] p-6 text-sm text-destructive" role="alert" data-testid="status-retention-observations-error">Your practice is here, but its results could not be loaded. <button type="button" onClick={() => void observationsQuery.refetch()} className="font-semibold underline underline-offset-4" data-testid="button-retry-retention-observations">Try again</button></div>;
  }

  return (
    <div className="space-y-7">
      <button type="button" onClick={() => setLocation('/retention')} data-testid="button-back-to-practices" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" strokeWidth={1.8} /> All practices</button>
      <div className="flex flex-col gap-5 border-b border-border/60 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">A record of practice</p>
          <h1 className="mt-3 font-display text-[clamp(2.8rem,7vw,5.6rem)] leading-[0.9] tracking-[-0.065em]" data-testid={`text-retention-practice-name-${practice.id}`}>{practice.name}</h1>
          <p className="mt-4 text-sm text-muted-foreground">Results in <span className="font-semibold text-foreground">{practice.unit}</span> · Higher is better</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onEdit(practice)} data-testid={`button-edit-retention-practice-${practice.id}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-primary/45 hover:text-primary"><Pencil className="size-3.5" strokeWidth={1.8} /> Edit</button>
          <button type="button" onClick={onDelete} data-testid={`button-delete-retention-practice-${practice.id}`} className="inline-flex items-center gap-2 rounded-full border border-destructive/25 px-4 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/[0.06]"><Trash2 className="size-3.5" strokeWidth={1.8} /> Delete</button>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <section aria-labelledby="retention-curve-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="retention-curve-title" className="font-display text-[28px] tracking-[-0.04em]">What you have noticed</h2>
              <p className="mt-1 text-xs text-muted-foreground">Recorded results stay at the center. The lighter line is only an estimate.</p>
            </div>
            {observations.length > 0 && <p className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-primary" data-testid="text-retention-observation-count">{observations.length} {observations.length === 1 ? 'observation' : 'observations'}</p>}
          </div>
          <RetentionChart observations={observations} unit={practice.unit} speed={practice.retentionSpeed} />
          {observations.length > 0 && <p className="mt-3 text-[11px] leading-5 text-muted-foreground/75" data-testid="text-retention-estimate-note">The dashed line is an estimate based on your selected {practice.retentionSpeed.toLowerCase()} retention speed. It is not another result.</p>}
        </section>
        <section className="h-fit rounded-[22px] border border-border/75 bg-card/70 p-5 sm:p-6" aria-labelledby="record-result-title">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Keep a note</p>
          <h2 id="record-result-title" className="mt-2 font-display text-[27px] leading-none tracking-[-0.04em]">Record a result</h2>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">What did you notice today? Context is optional.</p>
          <form onSubmit={record} className="mt-5 space-y-4">
            <div>
              <label htmlFor="observation-date" className="text-[11px] font-semibold">Date</label>
              <input id="observation-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} data-testid="input-observation-date" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div>
              <label htmlFor="observation-value" className="text-[11px] font-semibold">Result <span className="font-normal text-muted-foreground">({practice.unit})</span></label>
              <input id="observation-value" type="number" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0" data-testid="input-observation-value" className="mt-1.5 h-14 w-full rounded-xl border border-input bg-background px-3 font-mono-ui text-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            <div>
              <label htmlFor="observation-context" className="text-[11px] font-semibold">Context <span className="font-normal text-muted-foreground">optional</span></label>
              <textarea id="observation-context" value={context} onChange={(event) => setContext(event.target.value)} maxLength={500} placeholder="Where or how it felt available" data-testid="input-observation-context" className="mt-1.5 min-h-[82px] w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-xs leading-5 outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            </div>
            {formError && <p className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-record-result-error">{formError}</p>}
            <button type="submit" disabled={createObservation.isPending} data-testid="button-record-result" className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55">
              {createObservation.isPending ? 'Recording…' : <><Check className="size-3.5" strokeWidth={2.2} /> Record result</>}
            </button>
          </form>
        </section>
      </div>
      <section aria-labelledby="observation-list-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="observation-list-title" className="font-display text-[28px] tracking-[-0.04em]">The record</h2>
            <p className="mt-1 text-xs text-muted-foreground">A clear, chronological view of what you have actually observed.</p>
          </div>
        </div>
        {observations.length ? (
          <div className="divide-y divide-border/60 rounded-[22px] border border-border/75 bg-card/60 px-5 sm:px-6" data-testid="list-retention-observations">
            {observations.map((observation) => <ObservationRow key={observation.id} observation={observation} unit={practice.unit} />)}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border bg-card/45 px-6 py-8 text-center text-xs text-muted-foreground" data-testid="status-retention-observations-empty">No results recorded yet. The first one can be small.</div>
        )}
      </section>
    </div>
  );
}

function ObservationRow({ observation, unit }: { observation: RetentionObservation; unit: string }) {
  return (
    <article className="flex flex-wrap items-start justify-between gap-4 py-4" data-testid={`row-retention-observation-${observation.id}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
        <div className="min-w-0">
          <p className="font-mono-ui text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{formatDate(observation.recordedDate)}</p>
          {observation.context && <p className="mt-1.5 text-sm leading-5 text-foreground">{observation.context}</p>}
        </div>
      </div>
      <p className="shrink-0 font-display text-[30px] leading-none tracking-[-0.04em] text-primary" data-testid={`text-observation-value-${observation.id}`}>{observation.value} <span className="font-sans text-xs font-semibold tracking-normal text-muted-foreground">{unit}</span></p>
    </article>
  );
}

export default function RetentionPage() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground" data-testid="status-retention-auth-loading">Preparing your private space…</div>;
  if (!isSignedIn) return <Redirect to="/" />;
  return <RetentionWorkspace />;
}

function RetentionWorkspace() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const list = useListRetentionPractices();
  const createPractice = useCreateRetentionPractice();
  const updatePractice = useUpdateRetentionPractice();
  const deletePractice = useDeleteRetentionPractice();
  const [formOpen, setFormOpen] = useState(params.id === 'new');
  const [editing, setEditing] = useState<RetentionPractice | null>(null);
  const [mutationError, setMutationError] = useState('');
  const practices = list.data ?? [];
  const selectedId = params.id && params.id !== 'new' ? Number(params.id) : null;
  const selectedPractice = selectedId ? practices.find((practice) => practice.id === selectedId) : null;

  function openCreate() {
    setMutationError('');
    setEditing(null);
    setFormOpen(true);
    setLocation('/retention/new');
  }

  function openEdit(practice: RetentionPractice) {
    setMutationError('');
    setEditing(practice);
    setFormOpen(true);
  }

  function savePractice(data: RetentionPracticeInput) {
    setMutationError('');
    if (editing) {
      updatePractice.mutate({ practiceId: editing.id, data }, {
        onSuccess: () => {
          setFormOpen(false);
          setEditing(null);
          void queryClient.invalidateQueries({ queryKey: getListRetentionPracticesQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetRetentionPracticeQueryKey(editing.id) });
        },
        onError: (error) => setMutationError(errorMessage(error)),
      });
    } else {
      createPractice.mutate({ data }, {
        onSuccess: (practice) => {
          setFormOpen(false);
          void queryClient.invalidateQueries({ queryKey: getListRetentionPracticesQueryKey() });
          setLocation(`/retention/${practice.id}`);
        },
        onError: (error) => setMutationError(errorMessage(error)),
      });
    }
  }

  function deleteSelected() {
    if (!selectedPractice || !window.confirm(`Delete “${selectedPractice.name}” and its recorded results?`)) return;
    deletePractice.mutate({ practiceId: selectedPractice.id }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListRetentionPracticesQueryKey() });
        setLocation('/retention');
      },
      onError: (error) => setMutationError(errorMessage(error)),
    });
  }

  const pageTitle = selectedPractice ? selectedPractice.name : 'Practices';
  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="relative flex min-h-[100dvh]">
        <RetentionRail />
        <div className="min-w-0 flex-1">
          <RetentionHeader />
          <main className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
            <header className="flex items-center justify-between border-b border-border/60 pb-5">
              <div className="flex items-center gap-2"><Circle className="size-2.5 fill-accent text-accent" strokeWidth={0} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A private record of capability</span></div>
              <Link href="/today" className="hidden text-xs font-semibold text-muted-foreground hover:text-primary sm:inline-flex" data-testid="link-retention-return-today">Back to today</Link>
            </header>
            {!selectedId && params.id !== 'new' ? (
              <>
                <div className="mt-10 flex flex-col gap-5 border-b border-border/60 pb-8 sm:mt-12 sm:flex-row sm:items-end sm:justify-between">
                  <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Retention</p><h1 className="mt-3 font-display text-[clamp(3.2rem,7vw,6rem)] leading-[0.88] tracking-[-0.07em]" data-testid="text-retention-title">Practices</h1><p className="mt-5 max-w-[500px] text-[15px] leading-7 text-muted-foreground">Keep a clear record of what you can do, and notice how it remains available over time.</p></div>
                  <button type="button" onClick={openCreate} data-testid="button-add-retention-practice" className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 sm:self-auto"><Plus className="size-3.5" strokeWidth={2.2} /> Add a practice</button>
                </div>
                <section className="mt-8 max-w-[760px]" aria-labelledby="practice-list-title"><div className="mb-4 flex items-center justify-between"><h2 id="practice-list-title" className="font-display text-[28px] tracking-[-0.04em]">Your practices</h2>{list.isError ? <button type="button" onClick={() => void list.refetch()} className="text-xs font-semibold text-primary underline underline-offset-4" data-testid="button-retry-retention-list">Try again</button> : null}</div>{list.isLoading ? <PracticesLoading /> : list.isError ? <p className="rounded-[20px] border border-destructive/25 bg-destructive/[0.06] p-5 text-sm text-destructive" role="alert" data-testid="status-retention-list-error">Your practices could not be loaded.</p> : <PracticeList practices={practices} onNew={openCreate} />}</section>
              </>
            ) : selectedId && selectedPractice ? (
              <div className="mt-9 sm:mt-12"><PracticeDetail practiceId={selectedId} onEdit={openEdit} onDelete={deleteSelected} /></div>
            ) : (
              <div className="mt-9 sm:mt-12"><p className="text-xs text-muted-foreground">Starting a new practice…</p></div>
            )}
            <footer className="mt-12 border-t border-border/60 pt-5 text-[11px] text-muted-foreground/75"><p>{pageTitle === 'Practices' ? 'No scores, streaks, or performance signals here.' : 'Your observations stay grounded in what you actually noticed.'}</p></footer>
          </main>
        </div>
      </div>
      {formOpen && <RetentionPracticeForm practice={editing} pending={createPractice.isPending || updatePractice.isPending} error={mutationError} onClose={() => { setFormOpen(false); setEditing(null); setMutationError(''); setLocation(editing ? `/retention/${editing.id}` : '/retention'); }} onSubmit={savePractice} />}
      {deletePractice.isPending && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold shadow-lg" role="status" data-testid="status-retention-delete">Removing practice…</div>}
      {mutationError && !formOpen && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-destructive/25 bg-card px-4 py-3 text-xs text-destructive shadow-lg" role="alert" data-testid="status-retention-mutation-error"><span>{mutationError}</span><button type="button" onClick={() => setMutationError('')} className="font-semibold underline underline-offset-4" data-testid="button-dismiss-retention-error">Dismiss</button></div>}
    </div>
  );
}