import { useEffect, useState, type FormEvent } from 'react';
import type { RetentionPractice, RetentionPracticeInput, RetentionSpeed } from '@workspace/api-client-react';
import { X } from 'lucide-react';

type RetentionPracticeFormProps = {
  practice?: RetentionPractice | null;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: RetentionPracticeInput) => void;
};

const speeds: Array<{ value: RetentionSpeed; label: string; description: string }> = [
  { value: 'slow', label: 'Slow', description: 'It tends to stay fresh for longer.' },
  { value: 'moderate', label: 'Moderate', description: 'It may need a little revisiting.' },
  { value: 'fast', label: 'Fast', description: 'A gentle refresh may help sooner.' },
];

export function RetentionPracticeForm({
  practice,
  pending,
  error,
  onClose,
  onSubmit,
}: RetentionPracticeFormProps) {
  const [name, setName] = useState(practice?.name ?? '');
  const [unit, setUnit] = useState(practice?.unit ?? '');
  const [retentionSpeed, setRetentionSpeed] = useState<RetentionSpeed>(
    practice?.retentionSpeed ?? 'moderate',
  );

  useEffect(() => {
    setName(practice?.name ?? '');
    setUnit(practice?.unit ?? '');
    setRetentionSpeed(practice?.retentionSpeed ?? 'moderate');
  }, [practice]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !unit.trim()) return;
    onSubmit({ name: name.trim(), unit: unit.trim(), retentionSpeed });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="retention-form-title">
      <div className="w-full max-w-[560px] rounded-t-[28px] border border-border bg-card p-6 shadow-[0_22px_70px_hsl(205_32%_20%/0.2)] sm:rounded-[28px] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">
              {practice ? 'Shape this practice' : 'A capability worth keeping'}
            </p>
            <h2 id="retention-form-title" className="mt-2 font-display text-[32px] leading-none tracking-[-0.045em]">
              {practice ? 'Edit practice' : 'Add a practice'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close practice form" data-testid="button-close-practice-form" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="practice-name" className="text-xs font-semibold text-foreground">What are you building?</label>
            <input id="practice-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus placeholder="Reading in another language" data-testid="input-practice-name" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div>
            <label htmlFor="practice-unit" className="text-xs font-semibold text-foreground">How will you notice it?</label>
            <input id="practice-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={40} placeholder="minutes, pages, or words" data-testid="input-practice-unit" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15" />
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Use one simple unit so each result can be understood beside the last.</p>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold text-foreground">How quickly does it fade without use?</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {speeds.map((speed) => (
                <label key={speed.value} className={`cursor-pointer rounded-xl border p-3 transition-colors ${retentionSpeed === speed.value ? 'border-primary bg-primary/[0.08]' : 'border-border bg-background hover:border-primary/40'}`}>
                  <input type="radio" name="retention-speed" value={speed.value} checked={retentionSpeed === speed.value} onChange={() => setRetentionSpeed(speed.value)} data-testid={`input-retention-speed-${speed.value}`} className="sr-only" />
                  <span className="block text-sm font-semibold">{speed.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{speed.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-practice-form-error">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} data-testid="button-cancel-practice" className="rounded-full border border-border px-5 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40">Keep looking</button>
            <button type="submit" disabled={pending || !name.trim() || !unit.trim()} data-testid="button-save-practice" className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55">
              {pending ? 'Saving…' : practice ? 'Save changes' : 'Keep this practice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}