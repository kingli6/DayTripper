import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  Check,
  Database,
  Gauge,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  getGetAdminOverviewQueryKey,
  useGetAdminOverview,
  useResetAdminData,
  type AdminOverview,
} from '@workspace/api-client-react';
import { Link, Redirect } from 'wouter';
import { useUser } from '@clerk/react';

type ResetScope = 'my_account' | 'all_planner_data';

const RESET_COPY: Record<ResetScope, { phrase: string; title: string; label: string; description: string }> = {
  my_account: {
    phrase: 'RESET MY DATA',
    title: 'Reset my planner data',
    label: 'my signed-in account',
    description: 'Remove the activities, journal entries, and change records owned by the signed-in account.',
  },
  all_planner_data: {
    phrase: 'RESET ALL DATA',
    title: 'Reset all planner data',
    label: 'every account',
    description: 'Remove planner records for every account. This does not undo itself and cannot be recovered.',
  },
};

function BrandMark() {
  return (
    <div aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary">
      <span className="font-display -mt-0.5">d</span>
      <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
    </div>
  );
}

function numberLabel(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function dateLabel(value: string | null) {
  if (!value) return 'No saved activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function isForbidden(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && Number((error as { status?: unknown }).status) === 403;
}

function AdminSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading operations overview" data-testid="status-admin-loading">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-[24px] border border-border/70 bg-card/70" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="h-80 animate-pulse rounded-[26px] border border-border/70 bg-card/70" />
        <div className="h-80 animate-pulse rounded-[26px] border border-border/70 bg-card/70" />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, accent }: { icon: typeof Users; label: string; value: string; note: string; accent: string }) {
  return (
    <article className={`group relative overflow-hidden rounded-[24px] border border-border/75 bg-card/75 p-5 transition-transform duration-300 hover:-translate-y-1 ${accent}`} data-testid={`card-admin-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-background/65 text-primary"><Icon className="size-4" strokeWidth={1.7} /></span>
        <span className="font-mono-ui text-[9px] uppercase tracking-[0.15em] text-muted-foreground">aggregate</span>
      </div>
      <p className="mt-7 font-display text-[38px] leading-none tracking-[-0.05em]" data-testid={`text-admin-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</p>
      <p className="mt-2 text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{note}</p>
    </article>
  );
}

function StorageCard({ overview }: { overview: AdminOverview }) {
  const { database } = overview;
  const percent = database.percentUsed === null ? null : Math.min(Math.max(database.percentUsed, 0), 100);
  return (
    <section className="rounded-[26px] border border-primary/20 bg-primary p-6 text-primary-foreground shadow-[0_22px_55px_hsl(177_28%_39%/0.16)]" data-testid="card-admin-storage">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65">Database breath</p>
          <h2 className="mt-2 font-display text-[28px] leading-tight tracking-[-0.04em]">How much room is left?</h2>
        </div>
        <Database className="size-5 text-secondary" strokeWidth={1.6} />
      </div>
      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[30px] leading-none" data-testid="text-admin-storage-used">{database.usedLabel}</p>
          <p className="mt-2 text-xs text-primary-foreground/65">used by the database</p>
        </div>
        {percent !== null && <p className="font-mono-ui text-sm text-secondary" data-testid="text-admin-storage-percent">{percent}% used</p>}
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-primary-foreground/15" aria-label={percent === null ? 'Storage usage unavailable' : `${percent}% of storage used`}>
        <div className="h-full rounded-full bg-secondary transition-transform duration-700" style={{ width: `${percent ?? 0}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-primary-foreground/65">
        <span>{database.capacityLabel ? `${database.capacityLabel} capacity` : 'Capacity unavailable'}</span>
        <span>{database.remainingLabel ? `${database.remainingLabel} remaining` : 'Remaining unavailable'}</span>
      </div>
      <p className="mt-6 border-t border-primary-foreground/15 pt-4 text-[11px] leading-5 text-primary-foreground/60">{overview.access.capacitySource}</p>
    </section>
  );
}

function TableLedger({ overview }: { overview: AdminOverview }) {
  const largestBytes = Math.max(...overview.tables.map((table) => table.sizeBytes), 1);
  return (
    <section className="rounded-[26px] border border-border/75 bg-card/70 p-5 sm:p-6" data-testid="section-admin-tables">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">The shelves</p>
          <h2 className="mt-2 font-display text-[28px] leading-tight tracking-[-0.04em]">What the tables contain</h2>
          <p className="mt-2 max-w-[430px] text-xs leading-5 text-muted-foreground">Names, row counts, and storage only. Authored titles, journal content, and owner IDs never enter this view.</p>
        </div>
        <Table2 className="size-5 shrink-0 text-accent" strokeWidth={1.7} />
      </div>
      {overview.tables.length ? (
        <div className="mt-7 space-y-5" role="list" aria-label="Database table metrics">
          {overview.tables.map((table) => (
            <div key={table.tableName} role="listitem" data-testid={`row-admin-table-${table.tableName}`}>
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono-ui text-xs text-foreground">{table.tableName}</span>
                <span className="shrink-0 text-right font-mono-ui text-[10px] text-muted-foreground">{numberLabel(table.rowCount)} rows · {table.sizeLabel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-accent transition-transform duration-700" style={{ width: `${Math.max((table.sizeBytes / largestBytes) * 100, table.sizeBytes ? 3 : 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] p-5" data-testid="status-admin-tables-empty">
          <p className="font-semibold">The shelves are empty.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">No table metrics were returned yet. Refresh when the database is ready.</p>
        </div>
      )}
    </section>
  );
}

function AccountRollup({ overview }: { overview: AdminOverview }) {
  const rollup = useMemo(() => overview.accountActivity.reduce((sum, account) => ({
    activity: sum.activity + account.activityCount,
    journal: sum.journal + account.journalEntryCount,
    changes: sum.changes + account.changeCount,
    active: sum.active + Number(account.activityCount + account.journalEntryCount + account.changeCount > 0),
  }), { activity: 0, journal: 0, changes: 0, active: 0 }), [overview.accountActivity]);

  return (
    <section className="rounded-[26px] border border-border/75 bg-card/70 p-5 sm:p-6" data-testid="section-admin-account-rollup">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">The people, abstracted</p>
          <h2 className="mt-2 font-display text-[28px] leading-tight tracking-[-0.04em]">Accounts without a dossier</h2>
        </div>
        <Users className="size-5 shrink-0 text-accent" strokeWidth={1.7} />
      </div>
      <p className="mt-3 max-w-[470px] text-xs leading-5 text-muted-foreground">This room shows only totals. No authored activity title, journal entry, or raw owner identifier is displayed.</p>
      <div className="mt-7 grid grid-cols-2 gap-3">
        {[
          ['accounts with records', numberLabel(rollup.active), 'text-admin-active-accounts'],
          ['saved activities', numberLabel(rollup.activity), 'text-admin-activity-count'],
          ['journal entries', numberLabel(rollup.journal), 'text-admin-journal-count'],
          ['change records', numberLabel(rollup.changes), 'text-admin-change-count'],
        ].map(([label, value, testId]) => (
          <div key={label} className="rounded-2xl border border-border/65 bg-background/55 p-4">
            <p className="font-mono-ui text-[22px] leading-none text-foreground" data-testid={testId}>{value}</p>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground"><Gauge className="size-3.5 text-primary" strokeWidth={1.8} /> Most recent saved activity: {dateLabel(overview.recentActivityAt)}</p>
    </section>
  );
}

function ResetPanel() {
  const queryClient = useQueryClient();
  const reset = useResetAdminData();
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const selected = scope ? RESET_COPY[scope] : null;

  function openReset(nextScope: ResetScope) {
    setScope(nextScope);
    setConfirmation('');
    setResult('');
    setError('');
  }

  function closeReset() {
    if (reset.isPending) return;
    setScope(null);
    setConfirmation('');
    setError('');
  }

  async function submitReset() {
    if (!scope || !selected || confirmation !== selected.phrase) return;
    setError('');
    try {
      const response = await reset.mutateAsync({ data: { scope, confirmation } });
      await queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      setResult(`${response.message} ${numberLabel(response.deletedRows)} rows removed.`);
      setScope(null);
      setConfirmation('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The reset did not complete. Nothing was changed.';
      setError(message.replace(/^HTTP \d+ [^:]+:\s*/, ''));
    }
  }

  return (
    <section className="rounded-[26px] border border-destructive/25 bg-destructive/[0.045] p-5 sm:p-6" data-testid="section-admin-reset">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><ShieldAlert className="size-4" strokeWidth={1.7} /></span>
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-destructive">The red lever</p>
          <h2 className="mt-2 font-display text-[28px] leading-tight tracking-[-0.04em]">Reset, only when you mean it.</h2>
          <p className="mt-2 max-w-[630px] text-xs leading-5 text-muted-foreground">Both resets require an exact typed phrase. Resetting all planner data cannot be undone. These controls affect saved planner records only.</p>
        </div>
      </div>
      <div className="mt-7 grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => openReset('my_account')} data-testid="button-reset-my-account" className="flex min-h-[104px] items-center justify-between gap-4 rounded-2xl border border-border/75 bg-card/75 p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span><span className="block text-sm font-semibold">Reset my planner data</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Only the signed-in account</span></span>
          <RotateCcw className="size-4 shrink-0 text-destructive" strokeWidth={1.7} />
        </button>
        <button type="button" onClick={() => openReset('all_planner_data')} data-testid="button-reset-all-data" className="flex min-h-[104px] items-center justify-between gap-4 rounded-2xl border border-destructive/35 bg-destructive/[0.07] p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-destructive/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span><span className="block text-sm font-semibold text-destructive">Reset all planner data</span><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">Every account · cannot be undone</span></span>
          <Trash2 className="size-4 shrink-0 text-destructive" strokeWidth={1.7} />
        </button>
      </div>
      {result && <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 py-3 text-xs font-semibold text-primary" role="status" data-testid="status-admin-reset-success"><Check className="size-4" strokeWidth={2.3} />{result}</div>}
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] px-3 py-3 text-xs leading-5 text-destructive" role="alert" data-testid="status-admin-reset-error"><ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />{error}</div>}
      {selected && (
        <div className="mt-5 rounded-2xl border border-destructive/30 bg-background/75 p-4" role="dialog" aria-modal="true" aria-labelledby="reset-title" data-testid="dialog-admin-reset">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id="reset-title" className="text-sm font-semibold">{selected.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.description}</p>
            </div>
            <button type="button" onClick={closeReset} disabled={reset.isPending} aria-label="Close reset confirmation" data-testid="button-close-reset" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><X className="size-4" strokeWidth={1.8} /></button>
          </div>
          <label htmlFor="reset-confirmation" className="mt-5 block text-xs font-semibold">Type <span className="font-mono-ui text-destructive">{selected.phrase}</span> to confirm {selected.label}.</label>
          <input id="reset-confirmation" autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={selected.phrase} data-testid="input-reset-confirmation" className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 font-mono-ui text-sm uppercase tracking-[0.08em] outline-none placeholder:text-muted-foreground/45 focus:border-destructive focus:ring-2 focus:ring-destructive/15" />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeReset} disabled={reset.isPending} data-testid="button-cancel-reset" className="min-h-10 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-45">Keep everything</button>
            <button type="button" onClick={() => void submitReset()} disabled={reset.isPending || confirmation !== selected.phrase} data-testid="button-confirm-reset" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-45">{reset.isPending && <RefreshCw className="size-3.5 animate-spin" strokeWidth={1.8} />}{reset.isPending ? 'Resetting…' : 'Confirm reset'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function AdminDenied() {
  return (
    <main className="paper-grain flex min-h-[100dvh] items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-[600px] rounded-[30px] border border-border/75 bg-card/75 p-7 shadow-[0_24px_80px_hsl(205_32%_20%/0.08)] sm:p-10" role="alert" data-testid="status-admin-denied">
        <div className="flex items-center justify-between gap-4"><BrandMark /><LockKeyhole className="size-5 text-accent" strokeWidth={1.7} /></div>
        <p className="mt-14 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-destructive">Access held at the door</p>
        <h1 className="mt-4 font-display text-[clamp(2.8rem,7vw,5.1rem)] leading-[0.92] tracking-[-0.065em]">This room is private.</h1>
        <p className="mt-6 max-w-[470px] text-sm leading-7 text-muted-foreground">Your signed-in account does not have owner access to operations. Nothing about your planner or this database was changed.</p>
        <Link href="/today" data-testid="link-denied-back-to-day" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"><ArrowLeft className="size-3.5" strokeWidth={1.8} />Return to your day</Link>
      </section>
    </main>
  );
}

function AdminError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[26px] border border-destructive/25 bg-destructive/[0.05] p-7" role="alert" data-testid="status-admin-error">
      <ShieldAlert className="size-5 text-destructive" strokeWidth={1.7} />
      <h2 className="mt-4 font-display text-[28px] tracking-[-0.04em]">The room did not answer.</h2>
      <p className="mt-2 max-w-[490px] text-sm leading-6 text-muted-foreground">The overview could not be loaded. No planner data was changed.</p>
      <button type="button" onClick={onRetry} data-testid="button-retry-admin-overview" className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-primary/40"><RefreshCw className="size-3.5" strokeWidth={1.8} />Try again</button>
    </div>
  );
}

function AdminOverviewPage() {
  const overviewQuery = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey() } });
  const overview = overviewQuery.data;

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-32 size-[440px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-160px] left-[22%] size-[420px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[1220px] px-5 pb-14 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-border/65 py-5">
          <Link href="/today" data-testid="link-admin-back" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark />
            <span className="hidden sm:block"><span className="block font-display text-[21px] leading-none tracking-[-0.03em]">Day Tripper</span><span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[0.18em] text-muted-foreground">operations room</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:flex"><span className="size-1.5 animate-breathe rounded-full bg-primary" />owner view</span>
            <Link href="/today" data-testid="link-admin-return" className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary"><ArrowLeft className="size-3.5" strokeWidth={1.8} />Back to day</Link>
          </div>
        </header>
        <main className="pt-10 sm:pt-14">
          <div className="animate-rise max-w-[760px]">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" strokeWidth={1.7} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">A private operations room</span></div>
            <h1 className="mt-5 font-display text-[clamp(3.3rem,8vw,6.8rem)] leading-[0.86] tracking-[-0.075em]">Is the day <span className="text-primary">really saved?</span></h1>
            <p className="mt-7 max-w-[640px] text-[15px] leading-7 text-muted-foreground">A calm read on account reach, saved records, table shape, and database capacity. This is a diagnostic surface, not a window into anyone&apos;s private writing.</p>
          </div>
          <div className="mt-8 flex flex-col gap-3 rounded-[22px] border border-accent/30 bg-accent/[0.08] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5" data-testid="status-ai-save-boundary">
            <div className="flex items-start gap-3"><BarChart3 className="mt-0.5 size-4 shrink-0 text-accent-foreground" strokeWidth={1.8} /><div><p className="text-xs font-semibold text-foreground">AI proposals stay proposals.</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Planning suggestions are not saved to the database until the owner reviews and approves them. The overview counts saved records, not unsaved proposals.</p></div></div>
            <span className="shrink-0 rounded-full border border-accent/30 bg-background/50 px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.13em] text-accent-foreground">approval gate intact</span>
          </div>
          <div className="mt-9">
            {overviewQuery.isLoading ? <AdminSkeleton /> : overviewQuery.isError ? (isForbidden(overviewQuery.error) ? <AdminDenied /> : <AdminError onRetry={() => void overviewQuery.refetch()} />) : overview ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard icon={Users} label="Accounts using the database" value={numberLabel(overview.accounts)} note="Distinct owners with saved planner records" accent="animate-rise delay-1" />
                  <StatCard icon={Table2} label="Saved rows" value={numberLabel(overview.totalRows)} note={`${numberLabel(overview.tables.length)} tracked tables across the planner`} accent="animate-rise delay-2" />
                  <StatCard icon={Database} label="Storage used" value={overview.database.usedLabel} note={`${overview.access.environment} environment · measured directly`} accent="animate-rise delay-3" />
                </div>
                {overview.totalRows === 0 && (
                  <div className="mt-6 flex items-start gap-3 rounded-[22px] border border-dashed border-primary/30 bg-primary/[0.045] p-5" data-testid="status-admin-empty">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Database className="size-4" strokeWidth={1.7} /></span>
                    <div><p className="text-sm font-semibold">A quiet database is still a healthy signal.</p><p className="mt-1 text-xs leading-5 text-muted-foreground">No saved planner rows are present yet. Once an approved activity or private journal entry is saved, the aggregate view will reflect it.</p></div>
                  </div>
                )}
                <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><TableLedger overview={overview} /><StorageCard overview={overview} /></div>
                <div className="mt-6"><AccountRollup overview={overview} /></div>
                <div className="mt-6"><ResetPanel /></div>
                <footer className="mt-9 flex flex-col gap-2 border-t border-border/60 pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Private diagnostics · aggregate counts only</span><span className="font-mono-ui uppercase tracking-[0.14em]">Day Tripper / owner</span></footer>
              </>
            ) : <AdminError onRetry={() => void overviewQuery.refetch()} />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <div className="flex min-h-[100dvh] items-center justify-center bg-background"><div className="size-3 animate-breathe rounded-full bg-primary" aria-label="Checking access" data-testid="status-admin-auth-loading" /></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <AdminOverviewPage />;
}