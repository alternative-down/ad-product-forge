import { useEffect, useState } from 'react';
import { Activity, Bot, Cable, KeyRound, Moon, Shield, Sun, Wallet } from 'lucide-react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import {
  AdminApiKeyError,
  getOverview,
  getStoredAdminApiKey,
  setStoredAdminApiKey,
} from '../../lib/api';
import { formatUsd } from '../../lib/format';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

const navigationItems = [
  { to: '/v1', label: 'Overview', icon: Activity },
  { to: '/v1/agents', label: 'Agents', icon: Bot },
  { to: '/v1/finance', label: 'Finance', icon: Wallet },
  { to: '/v1/system', label: 'System', icon: Cable },
  { to: '/v1/roles', label: 'Capabilities', icon: Shield },
] as const;

export function AppShell() {
  const [adminApiKey, setAdminApiKey] = useState(() => getStoredAdminApiKey());
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const storedTheme = window.localStorage.getItem('forge-admin-theme');
    return storedTheme === 'dark' ? 'dark' : 'light';
  });
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview', adminApiKey],
    queryFn: getOverview,
    enabled: Boolean(adminApiKey),
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('forge-admin-theme', theme);
  }, [theme]);

  if (!adminApiKey || overviewQuery.error instanceof AdminApiKeyError) {
    return (
      <AdminApiKeyGate
        initialValue={adminApiKey}
        errorMessage={overviewQuery.error instanceof AdminApiKeyError ? overviewQuery.error.message : null}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        onSave={(value) => {
          setStoredAdminApiKey(value);
          setAdminApiKey(value.trim());
          void overviewQuery.refetch();
        }}
        onClear={() => {
          setStoredAdminApiKey('');
          setAdminApiKey('');
        }}
      />
    );
  }

  const currentWorkspace =
    navigationItems.find((item) => (item.to === '/v1' ? pathname === '/v1' : pathname.startsWith(item.to))) ??
    navigationItems[0];

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--ink)]">
      <header className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
        <div className="px-4 py-4 lg:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
                Alternative Down
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">Forge Admin</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-4 py-2 text-sm text-[color:var(--muted)] lg:block">
                <span className="font-semibold text-[color:var(--ink)]">{currentWorkspace.label}</span>
                <span className="mx-2 text-[color:var(--panel-border-strong)]">/</span>
                <span>Agents {overviewQuery.data?.totals.agents ?? '—'}</span>
                <span className="mx-2 text-[color:var(--panel-border-strong)]">/</span>
                <span>Running {overviewQuery.data?.totals.runningAgents ?? '—'}</span>
                <span className="mx-2 text-[color:var(--panel-border-strong)]">/</span>
                <span>Cash {formatUsd(overviewQuery.data?.cash.balanceUsd)}</span>
              </div>
              <Button type="button" variant="secondary" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === '/v1' }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--muted-strong)] transition hover:border-[color:var(--panel-border-strong)] hover:text-[color:var(--ink)]',
                  )}
                  activeProps={{
                    className: 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--ink)]',
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="px-4 py-6 lg:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function AdminApiKeyGate(input: {
  initialValue: string;
  errorMessage: string | null;
  theme: 'light' | 'dark';
  onThemeToggle(): void;
  onSave(value: string): void;
  onClear(): void;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <Card className="grid w-full overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[color:var(--bg-rail)] px-8 py-10 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="inline-flex items-center rounded-md border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
                Access gate
              </div>
              <Button
                type="button"
                variant="ghost"
                className="border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={input.onThemeToggle}
              >
                {input.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
            <h1 className="mt-6 font-serif text-4xl tracking-tight">Unlock Forge Admin</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/65">
              The admin console uses the Forge admin API key for every privileged request. The key is
              kept only in localStorage on this browser.
            </p>
          </div>

          <div className="px-8 py-10">
            <div className="flex items-start gap-4">
              <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-3 text-[color:var(--ink)]">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-3xl tracking-tight text-[color:var(--ink)]">
                  Admin API key
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Paste the current key and enter the console. If the backend rejects it, the session
                  is cleared and the gate opens again.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <Input
                type="password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Forge admin API key"
              />
              {input.errorMessage ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {input.errorMessage}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => input.onSave(value)} disabled={!value.trim()}>
                  Unlock admin
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setValue('');
                    input.onClear();
                  }}
                >
                  Clear cached key
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
