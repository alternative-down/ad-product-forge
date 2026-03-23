import { useState } from 'react';
import {
  Activity,
  Bot,
  Cable,
  CircleDollarSign,
  KeyRound,
  Shield,
  Wallet,
  Zap,
} from 'lucide-react';
import { Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import {
  AdminApiKeyError,
  getOverview,
  getStoredAdminApiKey,
  setStoredAdminApiKey,
} from '../../lib/api';
import { formatUsd } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const navigationItems = [
  { to: '/', label: 'Overview', icon: Activity, caption: 'signal and finance pulse' },
  { to: '/agents', label: 'Agents', icon: Bot, caption: 'runtime, contacts, contracts' },
  { to: '/finance', label: 'Finance', icon: Wallet, caption: 'cash, payables, ledger' },
  { to: '/system', label: 'System', icon: Cable, caption: 'models, integrations, migrations' },
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
      <div className="mx-auto grid min-h-screen max-w-[1720px] gap-6 px-4 py-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
        <aside className="relative overflow-hidden rounded-[2rem] bg-[color:var(--bg-rail)] p-5 text-white shadow-[0_30px_120px_rgba(15,23,42,0.35)]">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(184,92,56,0.35),_transparent_58%)]" />
          <div className="relative flex h-full flex-col">
            <div className="border-b border-white/10 pb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/50">
                Alternative Down
              </div>
              <h1 className="mt-3 font-serif text-[2.2rem] leading-none tracking-tight">
                Forge Admin
              </h1>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/65">
                Operational cockpit for agents, capital, models, and runtime wiring.
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
                      className:
                        'border-[color:var(--accent)] bg-white text-slate-950 shadow-[0_12px_40px_rgba(0,0,0,0.18)]',
                    }}
                    className="group flex w-full items-start gap-3 rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:border-white/20 hover:bg-white/8"
                  >
                    <div className="mt-0.5 rounded-full border border-white/10 bg-white/8 p-2 text-white/80 group-[.active]:text-slate-950">
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

            <div className="mt-6 grid gap-3">
              <RailStat label="Agents" value={overviewQuery.data?.totals.agents} icon={Bot} />
              <RailStat label="Loaded" value={overviewQuery.data?.totals.loadedAgents} icon={Zap} />
              <RailStat label="Running" value={overviewQuery.data?.totals.runningAgents} icon={Activity} />
              <RailStat
                label="Cash"
                value={formatUsd(overviewQuery.data?.cash.balanceUsd)}
                icon={CircleDollarSign}
              />
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-6 py-1">
          <section className="rounded-[2rem] border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-6 py-5 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted-strong)]">
                  Runtime maintenance console
                </div>
                <h2 className="font-serif text-3xl tracking-tight text-[color:var(--ink)]">
                  Watch the system. Edit with intent.
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
                  This console is intentionally human-facing: fast inspection, controlled edits, and
                  clearer separation between live runtime state and administrative action.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TopMetric label="Functions" value={overviewQuery.data?.totals.functions} />
                <TopMetric label="Roles" value={overviewQuery.data?.totals.roles} />
                <TopMetric label="Contracts" value={overviewQuery.data?.totals.activeContracts} />
                <TopMetric
                  label="Balance"
                  value={formatUsd(overviewQuery.data?.cash.balanceUsd)}
                />
              </div>
            </div>
          </section>

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
        <Card className="grid w-full overflow-hidden rounded-[2rem] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[color:var(--bg-rail)] px-8 py-10 text-white">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
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
              <div className="rounded-[1.25rem] border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-3 text-[color:var(--ink)]">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-3xl tracking-tight text-[color:var(--ink)]">
                  Admin API key
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Paste the current key and enter the cockpit. If the backend rejects it, the console
                  will clear the session and ask again.
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
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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

function RailStat(input: {
  label: string;
  value: string | number | undefined;
  icon: typeof Activity;
}) {
  const Icon = input.icon;

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50">
        <Icon className="h-4 w-4" />
        {input.label}
      </div>
      <div className={cn('mt-3 text-2xl font-semibold tracking-tight', !input.value && 'text-white/35')}>
        {input.value ?? '—'}
      </div>
    </div>
  );
}

function TopMetric(input: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-[1.35rem] border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-strong)]">
        {input.label}
      </div>
      <div className={cn('mt-3 text-2xl font-semibold tracking-tight', !input.value && 'text-slate-400')}>
        {input.value ?? '—'}
      </div>
    </div>
  );
}
