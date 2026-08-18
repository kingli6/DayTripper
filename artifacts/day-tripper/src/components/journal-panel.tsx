import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/react';
import { BookOpen, Check, Clipboard, Clock3, Hash, LockKeyhole, RotateCcw, Trash2, X } from 'lucide-react';
import {
  getListJournalEntriesQueryKey,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useListJournalEntries,
  useUpdateJournalEntry,
} from '@workspace/api-client-react';
import type { Activity, JournalEntry } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

type JournalFilter = 'all' | 'private' | 'planning';
type JournalPrivacy = 'private' | 'planning';

function journalTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function journalDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function JournalSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading journal entries" data-testid="status-journal-loading">
      {[1, 2].map((item) => (
        <div key={item} className="rounded-[20px] border border-border/60 bg-card/55 p-4">
          <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
          <div className="mt-4 h-4 w-4/5 animate-pulse rounded-full bg-muted" />
          <div className="mt-2 h-3 w-2/5 animate-pulse rounded-full bg-muted/70" />
        </div>
      ))}
    </div>
  );
}

function JournalEntryCard({
  entry,
  activityTitle,
  onCopy,
  copied,
  confirmingDelete,
  deleting,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onTogglePrivacy,
  updatingPrivacy,
}: {
  entry: JournalEntry;
  activityTitle?: string;
  onCopy: (entry: JournalEntry) => void;
  copied: boolean;
  confirmingDelete: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onTogglePrivacy: () => void;
  updatingPrivacy: boolean;
}) {
  const isPlanning = entry.privacy === 'planning';

  return (
    <article className="group rounded-[20px] border border-border/75 bg-card/70 p-4 sm:p-5" data-testid={`card-journal-entry-${entry.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
          <Clock3 className="size-3.5 shrink-0 text-primary" strokeWidth={1.8} />
          <time dateTime={entry.recordedAt} data-testid={`text-journal-recorded-at-${entry.id}`}>{journalTime(entry.recordedAt)}</time>
          <span aria-hidden="true" className="text-border">/</span>
          <button
            type="button"
            onClick={onTogglePrivacy}
            disabled={updatingPrivacy}
            aria-label={isPlanning ? 'Make journal entry private' : 'Make journal entry available for planning'}
            title={isPlanning ? 'Make private' : 'Make available for planning'}
            data-testid={`button-toggle-journal-privacy-${entry.id}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${isPlanning ? 'bg-accent/70 text-accent-foreground hover:bg-accent' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            {updatingPrivacy ? <RotateCcw className="size-3 animate-spin" strokeWidth={1.8} /> : isPlanning ? <BookOpen className="size-3" strokeWidth={1.8} /> : <LockKeyhole className="size-3" strokeWidth={1.8} />}
            <span data-testid={`text-journal-privacy-${entry.id}`}>{isPlanning ? 'Available for planning' : 'Private'}</span>
          </button>
        </div>
        {!confirmingDelete && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onCopy(entry)}
              aria-label={`Copy journal entry from ${journalDateTime(entry.recordedAt)}`}
              data-testid={`button-copy-journal-entry-${entry.id}`}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? <Check className="size-3.5 text-primary" strokeWidth={2.2} /> : <Clipboard className="size-3.5" strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              onClick={onAskDelete}
              aria-label={`Remove journal entry from ${journalDateTime(entry.recordedAt)}`}
              data-testid={`button-delete-journal-entry-${entry.id}`}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/[0.08] hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground" data-testid={`text-journal-content-${entry.id}`}>{entry.content}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/55 pt-3">
        {entry.topic && <span className="rounded-full bg-secondary px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-secondary-foreground" data-testid={`text-journal-topic-${entry.id}`}>{entry.topic}</span>}
        {entry.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.055] px-2.5 py-1 text-[10px] text-primary" data-testid={`text-journal-tag-${entry.id}-${tag}`}><Hash className="size-2.5" strokeWidth={2} />{tag}</span>)}
        {activityTitle && <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[10px] text-primary" data-testid={`text-journal-activity-${entry.id}`}><BookOpen className="size-3" strokeWidth={1.8} />{activityTitle}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground/70" data-testid={`text-journal-date-${entry.id}`}>{journalDateTime(entry.recordedAt)}</span>
      </div>
      {confirmingDelete && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] px-3 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert" data-testid={`status-confirm-delete-journal-entry-${entry.id}`}>
          <p className="text-xs leading-5 text-destructive">Remove this entry? This cannot be undone.</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onCancelDelete} disabled={deleting} data-testid={`button-cancel-delete-journal-entry-${entry.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><X className="size-3" strokeWidth={1.8} /> Keep</button>
            <button type="button" onClick={onDelete} disabled={deleting} data-testid={`button-confirm-delete-journal-entry-${entry.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-destructive px-3 py-2 text-[11px] font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50">{deleting ? <RotateCcw className="size-3 animate-spin" /> : <Trash2 className="size-3" strokeWidth={1.8} />}{deleting ? 'Removing' : 'Remove'}</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function JournalPanel({ date, activities }: { date: string; activities: Activity[] }) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const list = useListJournalEntries({ date }, { query: { queryKey: getListJournalEntriesQueryKey({ date }) } });
  const createJournalEntry = useCreateJournalEntry();
  const updateJournalEntry = useUpdateJournalEntry();
  const deleteJournalEntry = useDeleteJournalEntry();
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [tags, setTags] = useState('');
  const [activityId, setActivityId] = useState('');
  const [privacy, setPrivacy] = useState<JournalPrivacy>('private');
  const [filter, setFilter] = useState<JournalFilter>('all');
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const entries = list.data ?? [];
  const privacyStorageKey = user ? `day-tripper:journal-privacy:${user.id}` : null;

  useEffect(() => {
    if (!privacyStorageKey) return;
    try {
      const saved = window.localStorage.getItem(privacyStorageKey);
      if (saved === 'private' || saved === 'planning') setPrivacy(saved);
    } catch {
      // The default remains available when local storage is unavailable.
    }
  }, [privacyStorageKey]);

  function rememberPrivacy(value: JournalPrivacy) {
    setPrivacy(value);
    if (!privacyStorageKey) return;
    try {
      window.localStorage.setItem(privacyStorageKey, value);
    } catch {
      // The selected value still applies to the current entry.
    }
  }

  const visibleEntries = useMemo(
    () => entries.filter((entry) => filter === 'all' || entry.privacy === filter).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [entries, filter],
  );

  const activityNames = useMemo(() => new Map(activities.map((activity) => [activity.id, activity.title])), [activities]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setFormError('Write a sentence or two before saving.');
      return;
    }
    setFormError('');
    setActionError('');
    try {
      await createJournalEntry.mutateAsync({
        data: {
          recordedDate: date,
          content: trimmedContent,
          activityId: activityId ? Number(activityId) : null,
          topic: topic.trim() || null,
            tags: Array.from(new Set(tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 5),
          privacy,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey({ date }) });
      setContent('');
      setTopic('');
      setTags('');
      setActivityId('');
      rememberPrivacy(privacy);
    } catch {
      setFormError('That entry could not be saved. Check the connection and try again.');
    }
  }

  async function copyEntry(entry: JournalEntry) {
    setActionError('');
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId((current) => current === entry.id ? null : current), 1800);
    } catch {
      setActionError('Copy is not available in this browser. Select the text to copy it instead.');
    }
  }

  async function removeEntry(id: number) {
    setActionError('');
    try {
      await deleteJournalEntry.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey({ date }) });
      setConfirmingDeleteId(null);
    } catch {
      setActionError('That entry could not be removed. It is still here.');
    }
  }

  async function togglePrivacy(entry: JournalEntry) {
    const nextPrivacy: JournalPrivacy = entry.privacy === 'private' ? 'planning' : 'private';
    setActionError('');
    try {
      await updateJournalEntry.mutateAsync({
        id: entry.id,
        data: { privacy: nextPrivacy },
      });
      await queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey({ date }) });
      rememberPrivacy(nextPrivacy);
    } catch {
      setActionError('That entry’s visibility could not be changed. Check the connection and try again.');
    }
  }

  return (
    <section aria-labelledby="journal-title" className="rounded-[26px] border border-primary/20 bg-primary/[0.045] p-5 sm:p-7" data-testid="section-journal">
      <div className="flex flex-col gap-5 border-b border-primary/15 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary"><BookOpen className="size-3.5" strokeWidth={1.8} /> Fast journaling</p>
          <h2 id="journal-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.04em]">What was actually here?</h2>
          <p className="mt-2 max-w-[560px] text-sm leading-6 text-muted-foreground">A small place for the parts of the day that do not belong on the timeline.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground" data-testid="status-journal-count">
          <LockKeyhole className="size-3.5 text-primary" strokeWidth={1.8} />
          <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} · visibility is adjustable</span>
        </div>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-6 rounded-[20px] border border-border/70 bg-card/75 p-4 sm:p-5" data-testid="form-create-journal-entry">
        <label htmlFor="journal-content" className="text-xs font-semibold text-foreground">Capture a moment</label>
        <textarea
          id="journal-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="The train was late, but the light on the platform was beautiful."
          rows={3}
          maxLength={5000}
          data-testid="input-journal-content"
          className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-[1.15fr_1fr_1fr]">
          <div>
            <label htmlFor="journal-activity" className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Link to an activity <span className="normal-case tracking-normal">(optional)</span></label>
            <select id="journal-activity" value={activityId} onChange={(event) => setActivityId(event.target.value)} data-testid="select-journal-activity" className="mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="">No activity</option>
              {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="journal-topic" className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Topic <span className="normal-case tracking-normal">(optional)</span></label>
            <input id="journal-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="A small detail" data-testid="input-journal-topic" className="mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div>
            <label htmlFor="journal-privacy" className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Visibility</label>
           <select id="journal-privacy" value={privacy} onChange={(event) => rememberPrivacy(event.target.value as JournalPrivacy)} data-testid="select-journal-privacy" className="mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              <option value="private">Private</option>
              <option value="planning">Available for planning</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="journal-tags" className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><Hash className="size-3" strokeWidth={2} /> Tags <span className="normal-case tracking-normal">(optional, up to 5)</span></label>
          <input id="journal-tags" value={tags} onChange={(event) => setTags(event.target.value)} maxLength={220} placeholder="energy, people, outside" data-testid="input-journal-tags" className="mt-1.5 min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-primary/15" />
          <p className="mt-1 text-[10px] text-muted-foreground/70">Separate tags with commas. They help narrow the planning handoff later.</p>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-border/55 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[11px] leading-5 text-muted-foreground"><Clock3 className="size-3.5 text-primary" strokeWidth={1.8} /> Saved with the current time</p>
          <button type="submit" disabled={createJournalEntry.isPending} data-testid="button-submit-journal-entry" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55">
            {createJournalEntry.isPending ? <RotateCcw className="size-3.5 animate-spin" /> : <Check className="size-3.5" strokeWidth={2.2} />}
            {createJournalEntry.isPending ? 'Saving' : 'Save entry'}
          </button>
        </div>
        {formError && <p className="mt-3 rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-journal-form-error">{formError}</p>}
      </form>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">The stream</p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="text-journal-visible-count">{visibleEntries.length} shown for {filter === 'all' ? 'all entries' : filter === 'private' ? 'private notes' : 'planning context'}</p>
        </div>
        <div className="flex rounded-full border border-border/75 bg-card/65 p-1" role="group" aria-label="Filter journal entries">
          {(['all', 'private', 'planning'] as const).map((option) => {
            const label = option === 'all' ? 'All' : option === 'private' ? 'Private' : 'Available for planning';
            return (
              <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option} data-testid={`button-filter-journal-${option}`} className={`min-h-9 rounded-full px-3 py-2 text-[10px] font-semibold ${filter === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {actionError && <div className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="status-journal-action-error"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Dismiss journal error" data-testid="button-dismiss-journal-error" className="shrink-0 text-destructive hover:opacity-70"><X className="size-3.5" strokeWidth={1.8} /></button></div>}

      <div className="mt-4 space-y-3">
        {list.isLoading ? <JournalSkeleton /> : list.isError ? (
          <div className="rounded-[20px] border border-destructive/20 bg-destructive/[0.05] p-5" role="alert" data-testid="status-journal-error">
            <p className="text-sm font-semibold">The journal is taking a pause.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Your saved entries are still safe. We could not load this stream right now.</p>
            <button type="button" onClick={() => void list.refetch()} disabled={list.isFetching} data-testid="button-retry-journal" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-primary/40 disabled:opacity-50"><RotateCcw className={`size-3.5 ${list.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.8} /> Try again</button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-primary/25 bg-background/35 px-5 py-10 text-center" data-testid="status-journal-empty">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><BookOpen className="size-4" strokeWidth={1.7} /></div>
            <p className="mt-4 font-display text-[23px] tracking-[-0.03em]">{filter === 'all' ? 'Nothing written down yet.' : 'Nothing in this view.'}</p>
            <p className="mx-auto mt-2 max-w-[360px] text-xs leading-5 text-muted-foreground">{filter === 'all' ? 'A sentence is enough. You can come back to the day without needing to explain it.' : 'Try another filter, or leave this space quiet.'}</p>
          </div>
        ) : visibleEntries.map((entry) => (
          <JournalEntryCard
            key={entry.id}
            entry={entry}
            activityTitle={entry.activityId ? activityNames.get(entry.activityId) : undefined}
            onCopy={(item) => void copyEntry(item)}
            copied={copiedId === entry.id}
            confirmingDelete={confirmingDeleteId === entry.id}
            deleting={deleteJournalEntry.isPending && confirmingDeleteId === entry.id}
            onAskDelete={() => setConfirmingDeleteId(entry.id)}
            onCancelDelete={() => setConfirmingDeleteId(null)}
            onDelete={() => void removeEntry(entry.id)}
            onTogglePrivacy={() => void togglePrivacy(entry)}
            updatingPrivacy={updateJournalEntry.isPending}
          />
        ))}
      </div>
    </section>
  );
}