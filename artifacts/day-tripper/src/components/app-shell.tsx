import { useState, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/react';
import { BookOpen, CalendarDays, ChevronRight, ListTodo, PanelLeft, Settings2, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const shellBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const PRIMARY_NAVIGATION = [
  { href: '/tasks', label: 'Tasks', icon: ListTodo, testId: 'link-primary-tasks' },
  { href: '/today', label: 'Today', icon: CalendarDays, testId: 'link-primary-today' },
  { href: '/retention', label: 'Practices', icon: BookOpen, testId: 'link-primary-practices' },
  { href: '/settings', label: 'Settings', icon: Settings2, testId: 'link-primary-settings' },
] as const;

function isActivePath(href: string, location: string) {
  return href === '/retention'
    ? location === href || location.startsWith(`${href}/`)
    : location === href;
}

function ShellBrand({ expanded, compactMobile = false }: { expanded: boolean; compactMobile?: boolean }) {
  return (
    <Link
      href="/today"
      aria-label="Open Today"
      className={`flex min-w-0 items-center ${expanded ? 'gap-3 px-2' : 'justify-center'}`}
      data-testid="link-shell-brand"
    >
      <span aria-hidden="true" className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-primary/40 bg-sidebar-primary/15 text-base font-semibold text-sidebar-primary">
        <span className="font-display -mt-0.5">d</span>
        <span className="absolute bottom-[5px] right-[5px] size-1.5 rounded-full bg-sidebar-primary" />
      </span>
      {expanded && (
        <span className={`min-w-0 ${compactMobile ? 'hidden min-[360px]:block' : ''}`}>
          <span className="block truncate font-display text-[19px] leading-none tracking-[-0.03em]">Day Tripper</span>
        </span>
      )}
    </Link>
  );
}

function PrimaryNavigation({ expanded, location }: { expanded: boolean; location: string }) {
  return (
    <nav className="space-y-1" aria-label="Primary navigation">
      {PRIMARY_NAVIGATION.map(({ href, label, icon: Icon, testId }) => {
        const active = isActivePath(href, location);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            title={expanded ? undefined : label}
            data-testid={testId}
            className={`group flex min-h-10 items-center rounded-md text-sm transition-colors ${
              expanded ? 'gap-3 px-3' : 'justify-center px-2'
            } ${
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]'
                : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}
          >
            <Icon className={`size-4 shrink-0 ${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/70 group-hover:text-sidebar-primary'}`} strokeWidth={1.8} />
            {expanded && <span>{label}</span>}
            {expanded && active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountControl({ compact = false }: { compact?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const label = user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Your account';

  if (compact) {
    return (
      <details className="relative">
        <summary
          aria-label="Open account menu"
          title="Account"
          className="flex size-10 shrink-0 cursor-pointer list-none items-center justify-center rounded-xl border border-sidebar-primary/35 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring min-[360px]:size-11 [&::-webkit-details-marker]:hidden"
          data-testid="button-mobile-account"
        >
          <UserRound className="size-4 text-sidebar-primary" strokeWidth={1.8} />
        </summary>
        <div className="absolute right-0 top-12 z-40 max-h-[calc(100dvh-5rem)] w-48 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-card p-2 text-foreground shadow-[0_18px_50px_hsl(205_32%_20%/0.18)] lg:bottom-full lg:left-0 lg:right-auto lg:top-auto lg:mb-2">
          <p className="truncate px-3 py-2 text-xs font-semibold">{label}</p>
          <div className="my-1 border-t border-border/70" />
          <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="link-mobile-account-operations">
            <ShieldCheck className="size-3.5 text-primary" strokeWidth={1.8} />
            Operations
          </Link>
          <button type="button" onClick={() => void signOut({ redirectUrl: shellBasePath || '/' })} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="button-mobile-sign-out">
            Sign out
          </button>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2 px-2 text-[11px] text-sidebar-foreground/65">
        <UserRound className="size-3.5 shrink-0 text-sidebar-primary/80" strokeWidth={1.8} />
        <span className="truncate">{label}</span>
      </div>
      <Link href="/admin" className="flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-semibold text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="link-account-operations">
        <ShieldCheck className="size-3.5 text-sidebar-primary/80" strokeWidth={1.8} />
        Operations
      </Link>
      <button type="button" onClick={() => void signOut({ redirectUrl: shellBasePath || '/' })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-semibold text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="button-shell-sign-out">
        <ChevronRight className="size-3.5 rotate-180 text-sidebar-primary/70" strokeWidth={1.8} />
        Sign out
      </button>
    </div>
  );
}

function MobileShellHeader({ location }: { location: string }) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border/70 bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
      <div className="min-w-0 flex-1">
        <ShellBrand expanded compactMobile />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 max-[359px]:gap-1">
        <nav className="flex items-center gap-1 max-[359px]:gap-0.5" aria-label="Primary navigation">
          {PRIMARY_NAVIGATION.map(({ href, label, icon: Icon, testId }) => {
            const active = isActivePath(href, location);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                title={label}
                data-testid={`${testId}-mobile`}
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors min-[360px]:size-11 ${
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className={active ? 'text-sidebar-primary' : undefined} size={15} strokeWidth={1.8} />
              </Link>
            );
          })}
        </nav>
        <AccountControl compact />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative flex min-h-[100dvh]">
      <aside className={`hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-2 py-4 text-sidebar-foreground transition-[width] duration-200 lg:flex ${expanded ? 'w-[232px]' : 'w-[68px]'}`}>
        <div className={`flex items-center ${expanded ? 'justify-between gap-2' : 'justify-center'}`}>
          <ShellBrand expanded={expanded} />
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={expanded}
            title={expanded ? 'Collapse navigation' : 'Expand navigation'}
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${expanded ? '' : 'mt-3'}`}
            data-testid="button-toggle-navigation"
          >
            <PanelLeft className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className={`mt-8 ${expanded ? 'px-1' : ''}`}>
          <PrimaryNavigation expanded={expanded} location={location} />
        </div>
        <div className={`mt-auto border-t border-sidebar-border/80 pt-4 ${expanded ? 'px-1' : ''}`}>
          {expanded ? <AccountControl /> : <AccountControl compact />}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileShellHeader location={location} />
        {children}
      </div>
    </div>
  );
}