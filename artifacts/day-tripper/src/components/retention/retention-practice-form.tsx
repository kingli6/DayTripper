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

const units: Array<{ value: RetentionPracticeInput['unit']; label: string }> = [
  { value: 'correct answers', label: 'Correct answers' },
  { value: 'repetitions', label: 'Repetitions' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'pages', label: 'Pages' },
  { value: 'words', label: 'Words' },
  { value: 'items', label: 'Items completed' },
];

const repeatIntervals = [
  { value: 'none', label: 'No interval — always available' },
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '4', label: '4 days' },
  { value: '5', label: '5 days' },
  { value: 'custom', label: 'Custom number of days' },
] as const;

export function RetentionPracticeForm({
  practice,
  pending,
  error,
  onClose,
  onSubmit,
}: RetentionPracticeFormProps) {
  const [name, setName] = useState(practice?.name ?? '');
  const [unit, setUnit] = useState<RetentionPracticeInput['unit']>(
    (practice?.unit as RetentionPracticeInput['unit'] | undefined) ?? 'correct answers',
  );
  const [retentionSpeed, setRetentionSpeed] = useState<RetentionSpeed>(
    practice?.retentionSpeed ?? 'moderate',
  );
  const [repeatInterval, setRepeatInterval] = useState<string>(
    practice?.repeatIntervalDays ? String(practice.repeatIntervalDays) : 'none',
  );
  const [customRepeatDays, setCustomRepeatDays] = useState(
    practice?.repeatIntervalDays && ![1, 2, 3, 4, 5].includes(practice.repeatIntervalDays)
      ? String(practice.repeatIntervalDays)
      : '',
  );
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setName(practice?.name ?? '');
    setUnit((practice?.unit as RetentionPracticeInput['unit'] | undefined) ?? 'correct answers');
    setRetentionSpeed(practice?.retentionSpeed ?? 'moderate');
    setRepeatInterval(practice?.repeatIntervalDays ? String(practice.repeatIntervalDays) : 'none');
    setCustomRepeatDays(
      practice?.repeatIntervalDays && ![1, 2, 3, 4, 5].includes(practice.repeatIntervalDays)
        ? String(practice.repeatIntervalDays)
        : '',
    );
    setLocalError('');
  }, [practice]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const repeatIntervalDays = repeatInterval === 'none'
      ? null
      : repeatInterval === 'custom'
        ? Number(customRepeatDays)
        : Number(repeatInterval);
    if (
      repeatIntervalDays !== null
      && (!Number.isInteger(repeatIntervalDays) || repeatIntervalDays < 1)
    ) {
      setLocalError('Enter a whole number of days at or above 1.');
      return;
    }
    setLocalError('');
    onSubmit({ name: name.trim(), unit, retentionSpeed, repeatIntervalDays });
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
            <label htmlFor="practice-unit" className="text-xs font-semibold text-foreground">What will you count?</label>
            <select id="practice-unit" value={unit} onChange={(event) => setUnit(event.target.value as RetentionPracticeInput['unit'])} data-testid="input-practice-unit" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              {units.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Choose one simple, higher-is-better measure that you can observe yourself.</p>
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
          <div>
            <label htmlFor="practice-repeat-interval" className="text-xs font-semibold text-foreground">Repeat / availability</label>
            <select id="practice-repeat-interval" value={repeatInterval} onChange={(event) => { setRepeatInterval(event.target.value); setLocalError(''); }} data-testid="input-practice-repeat-interval" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
              {repeatIntervals.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {repeatInterval === 'custom' && (
              <input
                type="number"
                min="1"
                step="1"
                value={customRepeatDays}
                onChange={(event) => { setCustomRepeatDays(event.target.value); setLocalError(''); }}
                placeholder="Number of days"
                aria-label="Custom repeat interval in days"
                data-testid="input-practice-custom-repeat-days"
                className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            )}
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">This is guidance, not a lock. You can always practice early if you choose.</p>
          </div>
          {(localError || error) && <p className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive" role="alert" data-testid="status-practice-form-error">{localError || error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} data-testid="button-cancel-practice" className="rounded-full border border-border px-5 py-2.5 text-xs font-semibold text-foreground hover:border-primary/40">Cancel</button>
            <button type="submit" disabled={pending || !name.trim()} data-testid="button-save-practice" className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55">
              {pending ? 'Saving…' : practice ? 'Save changes' : 'Add practice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}