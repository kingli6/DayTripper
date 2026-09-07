import { AppShell } from '@/components/app-shell';
import { useAppearance, type Appearance } from '@/lib/appearance';
import { useKeepAppActive } from '@/lib/server-wake';

const APPEARANCE_OPTIONS: Array<{ value: Appearance; label: string; description: string }> = [
  {
    value: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Dark mode with neon accents and the original Day Tripper look.',
  },
  {
    value: 'daylight',
    label: 'Daylight',
    description: 'A bright, calm surface with the same Day Tripper identity.',
  },
];

export default function SettingsPage() {
  const { appearance, setAppearance } = useAppearance();
  const { enabled, setEnabled } = useKeepAppActive();

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <AppShell>
        <main className="mx-auto w-full max-w-[920px] px-5 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pb-12 lg:pt-8">
          <div className="mt-5 border-b border-border/60 pb-6 sm:mt-7">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Settings</p>
            <h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.055em]">Keep the day space close.</h1>
            <p className="mt-5 max-w-[560px] text-sm leading-7 text-muted-foreground">
              Choose the appearance and connection behavior that feel right for your day.
            </p>
          </div>

          <section className="mt-8 max-w-[720px] rounded-md border border-border/70 bg-card/65 p-5 sm:p-6" aria-labelledby="appearance-title">
            <div>
              <h2 id="appearance-title" className="text-sm font-semibold text-foreground">Appearance</h2>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Your choice is saved on this device and applies across Day Tripper.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Appearance">
              {APPEARANCE_OPTIONS.map((option) => {
                const selected = appearance === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAppearance(option.value)}
                    data-testid={`button-appearance-${option.value}`}
                    className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/55 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className={`size-3 rounded-full border ${selected ? 'border-primary bg-primary' : 'border-muted-foreground/60'}`} aria-hidden="true" />
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-8 max-w-[720px] rounded-md border border-border/70 bg-card/65 p-5 sm:p-6" aria-labelledby="keep-app-active-title">
            <label htmlFor="keep-app-active" className="flex cursor-pointer items-start justify-between gap-5">
              <span className="min-w-0">
                <span id="keep-app-active-title" className="block text-sm font-semibold text-foreground">Keep app active</span>
                <span className="mt-2 block max-w-[540px] text-xs leading-6 text-muted-foreground">
                  Sends a small request every 10 minutes while Day Tripper is open to help prevent the Render server from going to sleep. This uses server time.
                </span>
                <span className="mt-3 block font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">
                  {enabled ? 'On · saved on this device' : 'Off'}
                </span>
              </span>
              <span className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${enabled ? 'border-primary bg-primary' : 'border-border bg-background'}`}>
                <input
                  id="keep-app-active"
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="peer sr-only"
                  data-testid="toggle-keep-app-active"
                />
                <span className={`pointer-events-none size-5 rounded-full bg-background shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </span>
            </label>
          </section>
        </main>
      </AppShell>
    </div>
  );
}