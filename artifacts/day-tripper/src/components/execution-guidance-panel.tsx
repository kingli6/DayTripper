import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  getListExecutionObservationsQueryKey,
  useCreateExecutionObservation,
  useDeleteExecutionObservation,
  useListExecutionObservations,
  useUpdateExecutionObservation,
} from '@workspace/api-client-react';
import type { ExecutionCapability, ExecutionObservation } from '@workspace/api-client-react';

const CAPABILITY_OPTIONS: Array<{ value: ExecutionCapability; label: string }> = [
  { value: 'task_recommendation', label: 'Choosing what to work on' },
  { value: 'eisenhower_matrix', label: 'Task matrix' },
  { value: 'plan_today', label: 'Planning today' },
  { value: 'replan_today', label: 'Re-planning the day' },
];

type EditorState = {
  observation?: ExecutionObservation;
};

function capabilityLabel(capability: ExecutionCapability) {
  return CAPABILITY_OPTIONS.find((option) => option.value === capability)?.label ?? capability;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'That did not save. Try again.';
}

export function ExecutionGuidancePanel() {
  const queryClient = useQueryClient();
  const observations = useListExecutionObservations();
  const createObservation = useCreateExecutionObservation();
  const updateObservation = useUpdateExecutionObservation();
  const deleteObservation = useDeleteExecutionObservation();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: getListExecutionObservationsQueryKey() });
  }

  async function save(finding: string, capabilities: ExecutionCapability[]) {
    setError('');
    try {
      if (editor?.observation) {
        await updateObservation.mutateAsync({
          observationId: editor.observation.id,
          data: { finding, capabilities },
        });
      } else {
        await createObservation.mutateAsync({
          data: {
            dimension: 'personal_guidance',
            finding,
            stateContext: null,
            confidence: 1,
            evidenceCount: 0,
            source: 'user-guidance',
            capabilities,
          },
        });
      }
      await refresh();
      setEditor(null);
    } catch (saveError) {
      setError(errorMessage(saveError));
    }
  }

  async function remove(observation: ExecutionObservation) {
    if (!window.confirm('Remove this guidance?')) return;
    setError('');
    setDeletingId(observation.id);
    try {
      await deleteObservation.mutateAsync({ observationId: observation.id });
      await refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  }

  const items = observations.data ?? [];
  const pending = createObservation.isPending || updateObservation.isPending;

  return (
    <>
      <section className="rounded-[22px] border border-[hsl(15_66%_71%/0.38)] bg-[hsl(15_66%_71%/0.09)] p-5" data-testid="panel-execution-guidance">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[hsl(15_58%_42%)]">Personal guidance</p>
            <h2 className="mt-3 font-display text-[21px] leading-[1.15] tracking-[-0.025em]">Keep useful context close.</h2>
          </div>
          <button
            type="button"
            onClick={() => { setError(''); setEditor({}); }}
            aria-label="Add personal guidance"
            data-testid="button-add-execution-guidance"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(15_58%_42%/0.32)] bg-card/70 text-[hsl(15_58%_42%)] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(15_58%_42%)]"
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Add a short note about how you work. It can be general, or attached to one of the capabilities below. You stay in control of every note.</p>
        {observations.isLoading ? (
          <p className="mt-5 text-xs text-muted-foreground" data-testid="status-execution-guidance-loading">Loading guidance…</p>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[hsl(15_58%_42%/0.28)] bg-card/35 px-4 py-4" data-testid="status-execution-guidance-empty">
            <p className="text-xs leading-5 text-muted-foreground">Nothing saved yet. A useful first note might be a condition that makes starting easier.</p>
            <button type="button" onClick={() => { setError(''); setEditor({}); }} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-[hsl(15_58%_42%/0.32)] bg-card/70 px-3 py-2 text-xs font-semibold text-[hsl(15_58%_42%)] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(15_58%_42%)]" data-testid="button-add-first-execution-guidance">
              <Plus className="size-3.5" strokeWidth={2} />
              Add a note
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3" data-testid="list-execution-guidance">
            {items.map((observation) => (
              <article key={observation.id} className="rounded-2xl border border-border/70 bg-card/65 p-4" data-testid={`row-execution-guidance-${observation.id}`}>
                <p className="text-sm leading-6 text-foreground">{observation.finding}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {observation.capabilities.length === 0 ? (
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.08em] text-secondary-foreground">General</span>
                  ) : observation.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">{capabilityLabel(capability)}</span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={() => { setError(''); setEditor({ observation }); }} className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`button-edit-execution-guidance-${observation.id}`}>
                    <Pencil className="size-3.5" strokeWidth={1.8} />
                    Edit
                  </button>
                  <button type="button" onClick={() => void remove(observation)} disabled={deletingId === observation.id} className="inline-flex min-h-8 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid={`button-delete-execution-guidance-${observation.id}`}>
                    <Trash2 className="size-3.5" strokeWidth={1.8} />
                    {deletingId === observation.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {error && <p className="mt-4 text-xs leading-5 text-destructive" role="alert" data-testid="status-execution-guidance-error">{error}</p>}
      </section>
      {editor && <ExecutionGuidanceEditor observation={editor.observation} pending={pending} onClose={() => setEditor(null)} onSave={save} />}
    </>
  );
}

function ExecutionGuidanceEditor({
  observation,
  pending,
  onClose,
  onSave,
}: {
  observation?: ExecutionObservation;
  pending: boolean;
  onClose: () => void;
  onSave: (finding: string, capabilities: ExecutionCapability[]) => Promise<void>;
}) {
  const [finding, setFinding] = useState(observation?.finding ?? '');
  const [capabilities, setCapabilities] = useState<ExecutionCapability[]>(observation?.capabilities ?? []);

  function toggleCapability(capability: ExecutionCapability) {
    setCapabilities((current) => current.includes(capability)
      ? current.filter((item) => item !== capability)
      : [...current, capability]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = finding.trim();
    if (!trimmed) return;
    await onSave(trimmed, capabilities);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="execution-guidance-title" className="paper-grain max-h-[94dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] border border-border bg-background p-5 shadow-[0_24px_80px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary">{observation ? 'Edit guidance' : 'New guidance'}</p>
            <h2 id="execution-guidance-title" className="mt-2 font-display text-[30px] leading-tight tracking-[-0.035em]">{observation ? 'Make it more useful.' : 'What should be remembered?'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This is a note you choose to keep. It will not change today’s plan by itself.</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close guidance form" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)} className="mt-7">
          <label htmlFor="execution-guidance-finding" className="text-xs font-semibold text-foreground">Your guidance</label>
          <textarea id="execution-guidance-finding" value={finding} onChange={(event) => setFinding(event.target.value)} maxLength={1000} required autoFocus placeholder="For example: I start more easily when the first step is concrete." className="mt-2 min-h-[120px] w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-execution-guidance" />
          <fieldset className="mt-6">
            <legend className="text-xs font-semibold text-foreground">Where does this apply?</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Leave everything unchecked for general guidance.</p>
            <div className="mt-3 grid gap-2">
              {CAPABILITY_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/75 bg-card/45 px-3 py-3 text-xs hover:border-primary/40">
                  <input type="checkbox" checked={capabilities.includes(option.value)} onChange={() => toggleCapability(option.value)} className="size-4 accent-[hsl(177_28%_39%)]" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-7 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-full border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={pending || !finding.trim()} className="min-h-11 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-55" data-testid="button-save-execution-guidance">
              {pending ? 'Saving…' : observation ? 'Save changes' : 'Save guidance'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}