import { useState } from 'react';
import { Activity, Bot, Cable, KeyRound, Shield, Wallet } from 'lucide-react';
import { Link, Outlet } from '@tanstack/react-router';
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

const navigationItems = [
  { to: '/', label: 'Overview', icon: Activity, caption: 'signal and finance pulse' },
  { to: '/agents', label: 'Agents', icon: Bot, caption: 'hire, runtime, communications' },
  { to: '/finance', label: 'Finance', icon: Wallet, caption: 'cash, payables, ledger' },
  { to: '/system', label: 'System', icon: Cable, caption: 'company, models, integrations' },
  { to: '/roles', label: 'Roles', icon: Shield, caption: 'functions and capability graph' },
] as const;

export function AppShell() {
  const [adminApiKey, setAdminApiKey] = useState(() => getStoredAdminApiKey());
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview', adminApiKey],
    queryFn: getOverview,
    enabled: Boolean(adminApiKey),
  });

  if (!adminApiKey || overviewQuery.error instanceof AdminApiKeyError) {
    return (
      <AdminApiKeyGate
        initialValue={adminApiKey}
        errorMessage={overviewQuery.error instanceof AdminApiKeyError ? overviewQuery.error.message : null}
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

  return (
    <div className="min-h-screen text-[color:var(--ink)]">
      <div className="mx-auto grid min-h-screen max-w-[1540px] gap-8 px-5 py-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="rounded-md bg-[color:var(--bg-rail)] p-5 text-white">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 pb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
                Alternative Down
              </div>
              <h1 className="mt-3 font-serif text-[2rem] leading-none tracking-tight">
                Forge Admin
              </h1>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/60">
                Clear admin surfaces for agents, finance, system wiring, and capabilities.
              </p>
            </div>

            <nav className="mt-6 space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === '/' }}
                    activeProps={{
                      className: 'border-[color:var(--accent)] bg-white text-slate-950',
                    }}
                    className="group flex w-full items-start gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3.5 text-left transition hover:border-white/20 hover:bg-white/8"
                  >
                    <div className="mt-0.5 rounded-md border border-white/10 bg-white/8 p-2 text-white/80 group-[.active]:text-slate-950">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="mt-1 text-xs leading-5 text-white/55 group-[.active]:text-slate-500">
                        {item.caption}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-md border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                Current state
              </div>
              <div className="mt-3 space-y-2 text-sm text-white/70">
                <div className="flex items-center justify-between gap-4">
                  <span>Agents</span>
                  <span>{overviewQuery.data?.totals.agents ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Running</span>
                  <span>{overviewQuery.data?.totals.runningAgents ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Cash</span>
                  <span>{formatUsd(overviewQuery.data?.cash.balanceUsd)}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 py-2">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminApiKeyGate(input: {
  initialValue: string;
  errorMessage: string | null;
  onSave(value: string): void;
  onClear(): void;
}) {
  const [value, setValue] = useState(input.initialValue);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <Card className="grid w-full overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[color:var(--bg-rail)] px-8 py-10 text-white">
            <div className="inline-flex items-center rounded-md border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
              Access gate
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
