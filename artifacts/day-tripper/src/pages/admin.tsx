import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  getGetAdminOverviewQueryKey,
  useGetAdminOverview,
  useResetAdminAccountData,
  type AdminAccountMetric,
  type AdminOverview,
} from '@workspace/api-client-react';
import { Link, Redirect } from 'wouter';
import { useUser } from '@clerk/react';

const ACCOUNT_RESET_PHRASE = 'RESET ACCOUNT DATA';

function BrandMark() {
  return (
    <div
      aria-hidden="true"
      className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-sidebar-primary/40 bg-sidebar-primary/15 text-lg font-semibold text-sidebar-primary"
    >
      <span className="font-display -mt-0.5">d</span>
      <span className="absolute bottom-[7px] right-[7px] size-1.5 rounded-full bg-sidebar-primary" />
    </div>
  );
}

function numberLabel(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function dateLabel(value: string | null) {
  if (!value) return 'No saved timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently recorded';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function actionLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isForbidden(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    && Number((error as { status?: unknown }).status) === 403;
}

function accountLabel(account: Pick<AdminAccountMetric, 'email' | 'displayName'>) {
  return account.email || account.displayName || 'Account contact unavailable';
}

function recordCount(account: AdminAccountMetric) {
  return account.activityCount + account.journalEntryCount + account.changeCount;
}

function AdminSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading account support console" data-testid="status-admin-loading">
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-[22px] border border-border/70 bg-card/70" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="h-[500px] animate-pulse rounded-[26px] border border-border/70 bg-card/70" />
        <div className="h-[500px] animate-pulse rounded-[26px] border border-border/70 bg-card/70" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
  tone: 'teal' | 'peach' | 'sand';
}) {
  const tones = {
    teal: 'bg-primary/[0.07] text-primary',
    peach: 'bg-accent/[0.12] text-accent-foreground',
    sand: 'bg-secondary/70 text-secondary-foreground',
  };

  return (
    <article
      className="rounded-[22px] border border-border/75 bg-card/75 p-4 transition-transform duration-300 hover:-translate-y-0.5 sm:p-5"
      data-testid={`card-admin-stat-${label.toLowerCase().replaceAll(' ', '-')}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span className="font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground">support view</span>
      </div>
      <p className="mt-6 font-display text-[34px] leading-none tracking-[-0.05em]" data-testid={`text-admin-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{note}</p>
    </article>
  );
}

function AdminDenied() {
  return (
    <main className="paper-grain flex min-h-[100dvh] items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-[600px] rounded-[30px] border border-border/75 bg-card/75 p-7 shadow-[0_24px_80px_hsl(205_32%_20%/0.08)] sm:p-10" role="alert" data-testid="status-admin-denied">
        <div className="flex items-center justify-between gap-4">
          <BrandMark />
          <ShieldAlert className="size-5 text-accent" strokeWidth={1.7} />
        </div>
        <p className="mt-14 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-destructive">Access held at the door</p>
        <h1 className="mt-4 font-display text-[clamp(2.8rem,7vw,5.1rem)] leading-[0.92] tracking-[-0.065em]">This room is private.</h1>
        <p className="mt-6 max-w-[470px] text-sm leading-7 text-muted-foreground">Your signed-in account does not have owner access to support operations. Nothing about your planner was changed.</p>
        <Link href="/today" data-testid="link-denied-back-to-day" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5">
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          Return to your day
        </Link>
      </section>
    </main>
  );
}

function AdminError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-[26px] border border-destructive/25 bg-destructive/[0.05] p-7" role="alert" data-testid="status-admin-error">
      <ShieldAlert className="size-5 text-destructive" strokeWidth={1.7} />
      <h2 className="mt-4 font-display text-[28px] tracking-[-0.04em]">The support room did not answer.</h2>
      <p className="mt-2 max-w-[490px] text-sm leading-6 text-muted-foreground">Account records could not be loaded. No planner data was changed.</p>
      <button type="button" onClick={onRetry} data-testid="button-retry-admin-overview" className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-primary/40">
        <RefreshCw className="size-3.5" strokeWidth={1.8} />
        Try again
      </button>
    </div>
  );
}

function AccountList({
  accounts,
  selectedId,
  search,
  onSearchChange,
  onSelect,
}: {
  accounts: AdminAccountMetric[];
  selectedId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (account: AdminAccountMetric) => void;
}) {
  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts
      .filter((account) => !needle || `${account.email ?? ''} ${account.displayName ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => recordCount(b) - recordCount(a));
  }, [accounts, search]);

  return (
    <section className="rounded-[26px] border border-border/75 bg-card/70 p-5 sm:p-6" data-testid="section-admin-accounts">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Account index</p>
          <h2 className="mt-2 font-display text-[29px] leading-tight tracking-[-0.04em]">Find a saved day</h2>
          <p className="mt-2 max-w-[480px] text-xs leading-5 text-muted-foreground">Search by support email or display name. Select one account to inspect its record counts before making a reset.</p>
        </div>
        <Users className="size-5 shrink-0 text-accent" strokeWidth={1.7} />
      </div>

      <label className="relative mt-6 block">
        <span className="sr-only">Search accounts</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search email or display name"
          data-testid="input-admin-account-search"
          className="min-h-11 w-full rounded-xl border border-input bg-background/70 pl-10 pr-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>

      <div className="mt-4 space-y-2" role="list" aria-label="Accounts with saved records">
        {filteredAccounts.length ? filteredAccounts.map((account) => {
          const isSelected = selectedId === account.accountId;
          return (
            <button
              key={account.accountId}
              type="button"
              onClick={() => onSelect(account)}
              data-testid={`button-select-account-${account.accountId}`}
              className={`group flex min-h-[74px] w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? 'border-primary/55 bg-primary/[0.08]' : 'border-border/65 bg-background/45 hover:border-primary/35 hover:bg-primary/[0.04]'}`}
              role="listitem"
              aria-pressed={isSelected}
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}>
                <UserRound className="size-4" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{account.email || 'Account contact unavailable'}</span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{account.displayName || 'No display name'} <span className="px-1 text-border">·</span> {numberLabel(recordCount(account))} saved records</span>
              </span>
              <ChevronRight className={`size-4 shrink-0 transition-transform ${isSelected ? 'translate-x-0.5 text-primary' : 'text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary'}`} strokeWidth={1.7} />
            </button>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] p-5" data-testid="status-admin-accounts-empty">
            <p className="text-sm font-semibold">{accounts.length ? 'No account matches that search.' : 'No saved accounts yet.'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{accounts.length ? 'Try a different email or display name.' : 'When a planner record is saved, it will appear here for support.'}</p>
          </div>
        )}
      </div>
      <p className="mt-5 border-t border-border/60 pt-4 text-[11px] text-muted-foreground" data-testid="text-admin-account-list-count">
        Showing {numberLabel(filteredAccounts.length)} of {numberLabel(accounts.length)} accounts with saved records
      </p>
    </section>
  );
}

function AccountDetail({
  account,
  onResetSuccess,
}: {
  account: AdminAccountMetric | null;
  onResetSuccess: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const resetMutation = useResetAdminAccountData();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');

  if (!account) {
    return (
      <section className="flex min-h-[430px] flex-col justify-between rounded-[26px] border border-dashed border-primary/25 bg-primary/[0.035] p-6 sm:p-7" data-testid="status-admin-account-unselected">
        <div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary"><Wrench className="size-4" strokeWidth={1.7} /></span>
          <p className="mt-12 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Selected account</p>
          <h2 className="mt-3 font-display text-[34px] leading-[0.98] tracking-[-0.05em]">Choose a record to begin.</h2>
          <p className="mt-4 max-w-[370px] text-sm leading-6 text-muted-foreground">Support details stay intentionally narrow here: contact identity, aggregate record counts, and the one account-level maintenance action.</p>
        </div>
        <p className="flex items-center gap-2 border-t border-border/60 pt-4 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" strokeWidth={1.8} /> No authored planner content is shown.</p>
      </section>
    );
  }

  const selectedAccount = account;

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== ACCOUNT_RESET_PHRASE) return;
    setError('');
    try {
      const result = await resetMutation.mutateAsync({
        accountId: selectedAccount.accountId,
        data: { confirmation },
      });
      await queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      setConfirmation('');
      setIsConfirming(false);
      onResetSuccess(`${accountLabel(selectedAccount)} cleared · ${numberLabel(result.deletedRows)} rows removed.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The account reset did not complete. Nothing was changed.';
      setError(message.replace(/^HTTP \d+ [^:]+:\s*/, ''));
    }
  }

  function closeConfirmation() {
    if (resetMutation.isPending) return;
    setIsConfirming(false);
    setConfirmation('');
    setError('');
  }

  return (
    <section className="rounded-[26px] border border-border/75 bg-card/70 p-5 sm:p-7" data-testid="section-admin-account-detail">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Account selected</p>
          <h2 className="mt-2 truncate font-display text-[29px] leading-tight tracking-[-0.04em]" data-testid="text-admin-selected-account">{account.email || 'Account contact unavailable'}</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{account.displayName || 'No display name on file'}</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.1] text-primary"><Mail className="size-4" strokeWidth={1.7} /></span>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-2.5" data-testid="section-admin-selected-counts">
        <div className="rounded-2xl border border-border/65 bg-background/50 p-3">
          <p className="font-mono-ui text-[22px] leading-none" data-testid="text-admin-selected-activities">{numberLabel(account.activityCount)}</p>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">saved activities</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/50 p-3">
          <p className="font-mono-ui text-[22px] leading-none" data-testid="text-admin-selected-journal">{numberLabel(account.journalEntryCount)}</p>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">journal records</p>
        </div>
        <div className="rounded-2xl border border-border/65 bg-background/50 p-3">
          <p className="font-mono-ui text-[22px] leading-none" data-testid="text-admin-selected-changes">{numberLabel(account.changeCount)}</p>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">change records</p>
        </div>
      </div>

      <dl className="mt-6 space-y-3 border-t border-border/60 pt-5 text-xs">
        <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">First saved</dt><dd className="text-right font-medium" data-testid="text-admin-selected-first-seen">{dateLabel(account.firstActivityAt)}</dd></div>
        <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">Last saved</dt><dd className="text-right font-medium" data-testid="text-admin-selected-last-seen">{dateLabel(account.lastActivityAt)}</dd></div>
      </dl>

      {!isConfirming ? (
        <div className="mt-7 rounded-2xl border border-destructive/25 bg-destructive/[0.045] p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.8} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Clear this account&apos;s planner records</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">This affects only the selected account. The action cannot be undone.</p>
            </div>
          </div>
          <button type="button" onClick={() => { setIsConfirming(true); setError(''); }} data-testid="button-reset-selected-account" className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RotateCcw className="size-3.5" strokeWidth={1.8} />
            Reset selected account
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submitReset(event)} className="mt-7 rounded-2xl border border-destructive/35 bg-destructive/[0.06] p-4" role="dialog" aria-modal="true" aria-labelledby="reset-account-title" data-testid="dialog-admin-account-reset">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id="reset-account-title" className="text-sm font-semibold">Confirm account reset</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Only <span className="font-semibold text-foreground">{account.email || 'this account'}</span> will be affected.</p>
            </div>
            <button type="button" onClick={closeConfirmation} disabled={resetMutation.isPending} aria-label="Close account reset confirmation" data-testid="button-close-account-reset" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40">
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>
          <label htmlFor="account-reset-confirmation" className="mt-5 block text-xs font-semibold">Type <span className="font-mono-ui text-destructive">{ACCOUNT_RESET_PHRASE}</span> exactly.</label>
          <input
            id="account-reset-confirmation"
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={ACCOUNT_RESET_PHRASE}
            data-testid="input-account-reset-confirmation"
            className="mt-2 min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-3 font-mono-ui text-sm uppercase tracking-[0.07em] outline-none placeholder:text-muted-foreground/45 focus:border-destructive focus:ring-2 focus:ring-destructive/15"
          />
          {error && <p className="mt-3 text-xs leading-5 text-destructive" role="alert" data-testid="status-admin-account-reset-error">{error}</p>}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeConfirmation} disabled={resetMutation.isPending} data-testid="button-cancel-account-reset" className="min-h-10 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold hover:border-primary/40 disabled:opacity-45">Keep records</button>
            <button type="submit" disabled={resetMutation.isPending || confirmation !== ACCOUNT_RESET_PHRASE} data-testid="button-confirm-account-reset" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-xs font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-45">
              {resetMutation.isPending && <RefreshCw className="size-3.5 animate-spin" strokeWidth={1.8} />}
              {resetMutation.isPending ? 'Resetting…' : 'Confirm reset'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function RecentAdminActions({ overview }: { overview: AdminOverview }) {
  return (
    <section className="rounded-[26px] border border-border/75 bg-card/70 p-5 sm:p-6" data-testid="section-admin-recent-actions">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">Maintenance ledger</p>
          <h2 className="mt-2 font-display text-[28px] leading-tight tracking-[-0.04em]">Recent owner actions</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">A short, auditable list of account maintenance actions. Contact emails identify the target; raw owner IDs stay out of view.</p>
        </div>
        <Clock3 className="size-5 shrink-0 text-accent" strokeWidth={1.7} />
      </div>
      {overview.recentAdminActions.length ? (
        <div className="mt-6 space-y-2" role="list" aria-label="Recent owner actions">
          {overview.recentAdminActions.map((action) => (
            <div key={action.id} className="flex items-start gap-3 rounded-2xl border border-border/65 bg-background/45 p-3.5" role="listitem" data-testid={`row-admin-action-${action.id}`}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Check className="size-3.5" strokeWidth={2} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{actionLabel(action.actionType)}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{action.targetEmail || 'Account contact unavailable'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono-ui text-[10px] text-foreground">{numberLabel(action.deletedRows)} rows</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{dateLabel(action.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] p-5" data-testid="status-admin-actions-empty">
          <p className="text-sm font-semibold">No maintenance actions yet.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Completed account resets will appear here with their target email and row count.</p>
        </div>
      )}
    </section>
  );
}

function AdminOverviewPage() {
  const overviewQuery = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey() } });
  const overview = overviewQuery.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState('');

  const accounts = useMemo(() => overview?.accountActivity.filter((account) => recordCount(account) > 0) ?? [], [overview?.accountActivity]);
  const selectedAccount = accounts.find((account) => account.accountId === selectedId) ?? null;
  const totals = useMemo(() => accounts.reduce((sum, account) => ({
    activities: sum.activities + account.activityCount,
    journal: sum.journal + account.journalEntryCount,
    changes: sum.changes + account.changeCount,
  }), { activities: 0, journal: 0, changes: 0 }), [accounts]);

  function handleSelect(account: AdminAccountMetric) {
    setSelectedId(account.accountId);
    setResult('');
  }

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-32 size-[440px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-160px] left-[22%] size-[420px] rounded-full bg-primary/10 blur-3xl" />
      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[1220px] px-5 pb-14 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-border/65 py-5">
          <Link href="/today" data-testid="link-admin-back" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark />
            <span className="hidden sm:block"><span className="block font-display text-[21px] leading-none tracking-[-0.03em]">Day Tripper</span><span className="mt-1 block font-mono-ui text-[9px] uppercase tracking-[0.18em] text-muted-foreground">owner support room</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:flex"><span className="size-1.5 animate-breathe rounded-full bg-primary" />owner view</span>
            <Link href="/today" data-testid="link-admin-return" className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary">
              <ArrowLeft className="size-3.5" strokeWidth={1.8} />
              Back to day
            </Link>
          </div>
        </header>

        <main className="pt-10 sm:pt-14">
          <div className="animate-rise max-w-[760px]">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" strokeWidth={1.7} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">A calm maintenance room</span></div>
            <h1 className="mt-5 font-display text-[clamp(3.3rem,8vw,6.8rem)] leading-[0.86] tracking-[-0.075em]">Keep the <span className="text-primary">day kind.</span></h1>
            <p className="mt-7 max-w-[640px] text-[15px] leading-7 text-muted-foreground">Find an account, understand the saved record footprint, and make one careful maintenance change at a time. This room shows support identifiers and counts, never authored planner content.</p>
          </div>

          <div className="mt-8 flex flex-col gap-3 rounded-[22px] border border-accent/30 bg-accent/[0.08] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5" data-testid="status-admin-privacy-boundary">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-foreground" strokeWidth={1.8} /><div><p className="text-xs font-semibold text-foreground">Support stays at the surface.</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Emails and display names help identify an account. Counts show saved records. Private writing and activity details never enter this console.</p></div></div>
            <span className="shrink-0 rounded-full border border-accent/30 bg-background/50 px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.13em] text-accent-foreground">narrow access</span>
          </div>

          <div className="mt-9">
            {overviewQuery.isLoading ? <AdminSkeleton /> : overviewQuery.isError ? (isForbidden(overviewQuery.error) ? <AdminDenied /> : <AdminError onRetry={() => void overviewQuery.refetch()} />) : overview ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard icon={Users} label="Accounts with saved records" value={numberLabel(accounts.length)} note="Distinct accounts available for support" tone="teal" />
                  <StatCard icon={Wrench} label="Saved planner records" value={numberLabel(totals.activities + totals.journal + totals.changes)} note={`${numberLabel(totals.activities)} activities · ${numberLabel(totals.changes)} changes`} tone="peach" />
                  <StatCard icon={Clock3} label="Recent owner actions" value={numberLabel(overview.recentAdminActions.length)} note="Visible maintenance history in the overview" tone="sand" />
                </div>

                {result && <div className="mt-5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 py-3 text-xs font-semibold text-primary" role="status" data-testid="status-admin-account-reset-success"><Check className="size-4" strokeWidth={2.3} />{result}</div>}

                {accounts.length === 0 && (
                  <div className="mt-5 flex items-start gap-3 rounded-[22px] border border-dashed border-primary/30 bg-primary/[0.045] p-5" data-testid="status-admin-empty">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Users className="size-4" strokeWidth={1.7} /></span>
                    <div><p className="text-sm font-semibold">A quiet account index.</p><p className="mt-1 text-xs leading-5 text-muted-foreground">No saved planner records are present yet. There is nothing to reset or review.</p></div>
                  </div>
                )}

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
                  <AccountList accounts={accounts} selectedId={selectedId} search={search} onSearchChange={setSearch} onSelect={handleSelect} />
                  <AccountDetail account={selectedAccount} onResetSuccess={setResult} />
                </div>
                <div className="mt-5"><RecentAdminActions overview={overview} /></div>
                <footer className="mt-9 flex flex-col gap-2 border-t border-border/60 pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>Private support diagnostics · aggregate counts only</span><span className="font-mono-ui uppercase tracking-[0.14em]">Day Tripper / owner</span></footer>
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
  if (!isLoaded) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background"><div className="size-3 animate-breathe rounded-full bg-primary" aria-label="Checking access" data-testid="status-admin-auth-loading" /></div>;
  }
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <AdminOverviewPage />;
}