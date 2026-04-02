import { useEffect, useState } from 'react';
import { Activity, Bot, Cable, Moon, Shield, Sun, Wallet } from 'lucide-react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { AccessGate } from '@/components/admin/access-gate';
import {
  AdminApiKeyError,
  getOverview,
  getStoredAdminApiKey,
  setStoredAdminApiKey,
} from '../../lib/api';
import { formatUsd } from '../../lib/format';
import { Button } from '../ui/button';
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
      <AccessGate
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
