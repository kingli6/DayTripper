import { AppShell } from '@/components/app-shell';
import { useKeepAppActive } from '@/lib/server-wake';

export default function SettingsPage() {
  const { enabled, setEnabled } = useKeepAppActive();

  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <AppShell>
        <main className="mx-auto w-full max-w-[920px] px-5 pb-10 pt-5 sm:px-8 sm:pt-7 lg:px-12 lg:pb-12 lg:pt-8">
          <div className="mt-5 border-b border-border/60 pb-6 sm:mt-7">
            <p className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Settings</p>
            <h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,5rem)] font-semibold leading-[0.92] tracking-[-0.055em]">Keep the day space close.</h1>
            <p className="mt-5 max-w-[560px] text-sm leading-7 text-muted-foreground">
              Choose how Day Tripper keeps its connection available while you are here.
            </p>
          </div>

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