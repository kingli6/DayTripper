import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHealthCheck } from '@workspace/api-client-react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Cloud,
  Compass,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

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

function Sidebar() {
  return (
    <aside className="hidden w-[264px] shrink-0 flex-col justify-between bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
      <div>
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <div>
            <p className="font-display text-[22px] leading-none tracking-[-0.03em]">
              Day Tripper
            </p>
            <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/55">
              a softer daily practice
            </p>
          </div>
        </div>

        <div className="mt-16">
          <p className="px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">
            Your space
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-3 text-sm text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]">
            <Compass className="size-4 text-sidebar-primary" strokeWidth={1.8} />
            <span>Today</span>
            <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />
          </div>
        </div>

        <div className="mt-14 px-3">
          <div className="mb-4 size-8 rounded-full border border-sidebar-primary/35 bg-sidebar-primary/10 p-2 text-sidebar-primary">
            <Sparkles className="size-full" strokeWidth={1.7} />
          </div>
          <p className="font-display text-[20px] leading-[1.15] text-sidebar-foreground/90">
            There is room for a day to change.
          </p>
          <p className="mt-3 text-[12px] leading-5 text-sidebar-foreground/55">
            No scores. No streaks. Just a place to return to what matters.
          </p>
        </div>
      </div>

      <div className="border-t border-sidebar-border/80 px-3 pt-5">
        <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/55">
          <Shield className="size-3.5 text-sidebar-primary/80" strokeWidth={1.8} />
          <span>Private by design</span>
        </div>
        <p className="mt-2 font-mono-ui text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35">
          Foundation / 01
        </p>
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border/70 bg-sidebar px-5 py-4 text-sidebar-foreground lg:hidden">
      <div className="flex items-center gap-3">
        <BrandMark />
        <p className="font-display text-[21px] tracking-[-0.03em]">Day Tripper</p>
      </div>
      <span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
        Foundation / 01
      </span>
    </header>
  );
}

function ApiCheckpoint() {
  const {
    data: health,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useHealthCheck();

  const isReachable = Boolean(health && !isError);

  return (
    <section
      aria-labelledby="checkpoint-title"
      className="animate-rise delay-3 rounded-[24px] border border-border/80 bg-card/75 p-5 shadow-[0_18px_45px_hsl(198_31%_24%/0.05)] backdrop-blur-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Foundation checkpoint
          </p>
          <h2 id="checkpoint-title" className="mt-2 font-display text-[24px] leading-tight tracking-[-0.025em]">
            A quiet connection underneath.
          </h2>
        </div>
        <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
          <Cloud className="size-5" strokeWidth={1.7} />
        </div>
      </div>

      <div className="mt-6 border-t border-border/70 pt-4">
        {isLoading ? (
          <div
            aria-label="Checking the Day Tripper service"
            className="flex items-center gap-3"
            data-testid="status-api-loading"
          >
            <span className="size-2.5 animate-breathe rounded-full bg-muted-foreground/35" />
            <div className="space-y-2">
              <div className="h-3 w-36 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-52 animate-pulse rounded-full bg-muted/70" />
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-testid="status-api-error">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground">The connection took a pause.</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Nothing is missing here. We just could not reach the service right now.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              data-testid="button-retry-health"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground transition-transform hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary active:translate-y-0 disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.9} />
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-testid="status-api-ready">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 flex size-2.5 shrink-0 items-center justify-center rounded-full bg-primary">
                <span className="size-1 rounded-full bg-primary-foreground" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  The foundation is here.
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Day Tripper is ready to hold a little space for you.
                </p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-primary">
              <Check className="size-3" strokeWidth={2.4} />
              {health?.status ?? (isReachable ? 'reachable' : 'ready')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function Home() {
  return (
    <div className="paper-grain min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -right-24 -top-28 size-[430px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-180px] left-[25%] size-[420px] rounded-full bg-secondary/35 blur-3xl" />
      <div className="relative flex min-h-[100dvh]">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <MobileHeader />
          <main className="mx-auto flex w-full max-w-[1180px] flex-col px-5 pb-12 pt-6 sm:px-8 sm:pt-9 lg:px-14 lg:pb-16 lg:pt-10">
            <header className="animate-rise flex items-center justify-between border-b border-border/60 pb-5">
              <div className="flex items-center gap-2">
                <Circle className="size-2.5 fill-accent text-accent" strokeWidth={0} />
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  A private day planner
                </span>
              </div>
              <span className="hidden text-xs text-muted-foreground/75 sm:block">
                Take the day as it comes
              </span>
            </header>

            <div className="grid gap-10 pt-12 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-16 lg:pt-20">
              <section className="max-w-[650px]">
                <p className="animate-rise font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">
                  Start gently
                </p>
                <h1 className="animate-rise delay-1 mt-5 max-w-[620px] font-display text-[clamp(3.4rem,7.5vw,6.8rem)] leading-[0.91] tracking-[-0.065em] text-foreground">
                  Make room for what matters next.
                </h1>
                <p className="animate-rise delay-2 mt-7 max-w-[470px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">
                  Day Tripper is a private place to see the next small thing clearly — and come back kindly when plans change.
                </p>

                <div className="animate-rise delay-2 mt-11 flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex -space-x-1">
                    <span className="size-6 rounded-full border-2 border-background bg-primary/80" />
                    <span className="size-6 rounded-full border-2 border-background bg-accent/85" />
                    <span className="size-6 rounded-full border-2 border-background bg-secondary" />
                  </div>
                  <span>A softer starting point, without the scorekeeping.</span>
                </div>
              </section>

              <aside className="animate-rise delay-2 lg:pt-10">
                <div className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-primary px-6 py-7 text-primary-foreground shadow-[0_24px_60px_hsl(177_28%_39%/0.18)] sm:px-7">
                  <div className="absolute -right-9 -top-12 size-36 rounded-full border border-primary-foreground/15" />
                  <div className="absolute -right-1 -top-4 size-20 rounded-full border border-primary-foreground/15" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65">
                        Your starting point
                      </span>
                      <ArrowUpRight className="size-4 text-primary-foreground/70" strokeWidth={1.7} />
                    </div>
                    <div className="mt-16">
                      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary-foreground/12">
                        <Sparkles className="size-5 text-secondary" strokeWidth={1.6} />
                      </div>
                      <h2 className="font-display text-[30px] leading-[1.03] tracking-[-0.035em]">
                        Nothing to carry in yet.
                      </h2>
                      <p className="mt-4 max-w-[245px] text-sm leading-6 text-primary-foreground/70">
                        This space is ready when you are. For now, it is simply a calm blank page.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-14 max-w-[1000px] lg:mt-24">
              <ApiCheckpoint />
            </div>

            <footer className="mt-8 flex flex-col gap-2 border-t border-border/60 pt-5 text-[11px] text-muted-foreground/75 sm:flex-row sm:items-center sm:justify-between">
              <p data-testid="text-privacy-note">No personal information is being displayed in this foundation.</p>
              <div className="flex items-center gap-2 font-mono-ui text-[9px] uppercase tracking-[0.15em]">
                <Shield className="size-3" strokeWidth={1.8} />
                <span>Held lightly</span>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
