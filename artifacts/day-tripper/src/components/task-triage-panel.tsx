import { Copy, RotateCcw, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTriageTasks, type TaskTriageItem } from '@workspace/api-client-react';

type TaskTriagePanelProps = {
  onConfirm: (items: TaskTriageItem[]) => Promise<void>;
};

const QUADRANT_OPTIONS: Array<{
  value: TaskTriageItem['quadrant'];
  label: string;
}> = [
  { value: 'importantUrgent', label: 'Important + Urgent' },
  { value: 'importantNotUrgent', label: 'Important + Not urgent' },
  { value: 'notImportantUrgent', label: 'Not important + Urgent' },
  { value: 'notImportantNotUrgent', label: 'Not important + Not urgent' },
  { value: 'unsorted', label: 'Unsorted / Needs your decision' },
];

const QUADRANT_LABEL = new Map(QUADRANT_OPTIONS.map((option) => [option.value, option.label]));

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The list could not be sorted. Try again.';
}

function isUnsorted(item: TaskTriageItem) {
  return item.quadrant === 'unsorted';
}

export function TaskTriagePanel({ onConfirm }: TaskTriagePanelProps) {
  const triage = useTriageTasks();
  const [input, setInput] = useState('');
  const [items, setItems] = useState<TaskTriageItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const unsortedItems = useMemo(
    () => (items ?? []).filter(isUnsorted),
    [items],
  );
  const selectedItems = useMemo(
    () => (items ?? []).filter((item) => selectedIds.has(item.id) && !isUnsorted(item)),
    [items, selectedIds],
  );

  const sortList = async () => {
    setNotice(null);
    try {
      const response = await triage.mutateAsync({ data: { input } });
      setItems(response.items);
      setSelectedIds(new Set(response.items.filter((item) => !isUnsorted(item)).map((item) => item.id)));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const updateItem = (id: string, patch: Partial<TaskTriageItem>) => {
    setItems((current) => current?.map((item) => item.id === id ? { ...item, ...patch } : item) ?? null);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyUnsorted = async () => {
    try {
      await navigator.clipboard.writeText(unsortedItems.map((item) => item.text).join('\n'));
      setNotice('Unsorted items copied. Clean them up and paste them into the sorter again.');
    } catch {
      setNotice('Copying was blocked by the browser. Select the unsorted text and copy it manually.');
    }
  };

  const confirmSelection = async () => {
    if (!selectedItems.length) return;
    if (selectedItems.some((item) => !item.text.trim())) {
      setNotice('Give each selected item a title, or uncheck it before adding tasks.');
      return;
    }
    setNotice(null);
    setAdding(true);
    try {
      await onConfirm(selectedItems);
      setItems(null);
      setSelectedIds(new Set());
      setInput('');
    } catch {
      // The parent shows the save error and keeps the review available.
    } finally {
      setAdding(false);
    }
  };

  const startOver = () => {
    setItems(null);
    setSelectedIds(new Set());
    setNotice(null);
  };

  if (items) {
    return (
      <section className="rounded-md border border-primary/25 bg-primary/[0.035] p-3.5" data-testid="section-task-triage-review">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Review your priority matrix</h2>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Edit the wording, move anything that feels wrong, and uncheck items you do not want to add.</p>
          </div>
          <button type="button" onClick={startOver} disabled={adding} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:border-primary/45 hover:text-foreground disabled:opacity-50" data-testid="button-task-triage-start-over">
            <RotateCcw className="size-3.5" /> Start over
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`rounded-lg border p-3 ${isUnsorted(item) ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-border/70 bg-background/45'}`} data-testid={`row-task-triage-${item.id}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  disabled={isUnsorted(item) || adding}
                  aria-label={`Add ${item.text}`}
                  className="mt-1 size-4 accent-primary"
                  data-testid={`checkbox-task-triage-${item.id}`}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={item.text}
                    onChange={(event) => updateItem(item.id, { text: event.target.value })}
                    maxLength={200}
                    disabled={adding}
                    aria-label={`Edit ${item.text}`}
                    className="h-9 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                    data-testid={`input-task-triage-${item.id}`}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={item.quadrant}
                      onChange={(event) => updateItem(item.id, { quadrant: event.target.value as TaskTriageItem['quadrant'] })}
                      disabled={adding}
                      aria-label={`Choose priority for ${item.text}`}
                      className="h-9 rounded-lg border border-input bg-background/70 px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                      data-testid={`select-task-triage-${item.id}`}
                    >
                      {QUADRANT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <p className="text-[11px] leading-4 text-muted-foreground">{item.reason}</p>
                  </div>
                </div>
                <button type="button" onClick={() => updateItem(item.id, { quadrant: 'unsorted' })} disabled={adding || isUnsorted(item)} aria-label={`Remove ${item.text} from selected tasks`} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/65 hover:bg-destructive/10 hover:text-destructive disabled:opacity-35" data-testid={`button-remove-task-triage-${item.id}`}>
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {unsortedItems.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3" data-testid="section-task-triage-unsorted">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xs font-semibold text-foreground">Unsorted / Needs your decision</h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">These items were too vague or not clearly actionable. Decide on them yourself, or copy them, clean them up, and run the same sorter again.</p>
              </div>
              <button type="button" onClick={() => void copyUnsorted()} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-[11px] font-semibold text-foreground hover:bg-amber-500/10" data-testid="button-copy-unsorted-tasks">
                <Copy className="size-3.5" /> Copy unsorted
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-foreground/80">{unsortedItems.map((item) => <li key={item.id}>• {item.text}</li>)}</ul>
          </div>
        )}

        {notice && <p className="mt-3 rounded-lg bg-primary/[0.08] px-3 py-2 text-xs text-foreground" role="status" data-testid="status-task-triage-notice">{notice}</p>}
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">{selectedItems.length} selected to add to Day Tripper{unsortedItems.length ? ` · ${unsortedItems.length} need your decision` : ''}</p>
          <button type="button" onClick={() => void confirmSelection()} disabled={!selectedItems.length || adding} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-45" data-testid="button-confirm-task-triage">
            {adding ? 'Adding tasks…' : 'Add selected tasks'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border/70 bg-card/55 p-3.5" data-testid="section-task-triage">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Sort a list into your priority matrix</h2>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Paste one thing per line. The AI sorts clear actions; you review everything before anything is added.</p>
      <p className="mt-3 rounded-lg border border-border/60 bg-background/45 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">För bästa resultat: skriv saker du kan eller behöver göra. Ta bort tankar, reflektioner och bakgrundsinformation innan du sorterar.</p>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        maxLength={6000}
        rows={6}
        placeholder={'Review finances\nAsk Johan about the project\nMaybe I should start running again'}
        disabled={triage.isPending}
        className="mt-3 w-full resize-y rounded-lg border border-input bg-background/70 px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        data-testid="textarea-task-triage-input"
      />
      {notice && <p className="mt-3 rounded-lg bg-destructive/[0.07] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-task-triage-error">{notice}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">Up to 40 lines · no new tasks are added until you review them.</p>
        <button type="button" onClick={() => void sortList()} disabled={!input.trim() || triage.isPending} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-45" data-testid="button-sort-task-triage">
          {triage.isPending ? 'Sorting…' : 'Sort into matrix'}
        </button>
      </div>
    </section>
  );
}