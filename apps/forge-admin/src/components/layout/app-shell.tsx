import { Activity, Bot, CircleDollarSign, Shield, Zap } from 'lucide-react';
import { Link, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { getOverview } from '../../lib/api';
import { formatUsd } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';

const navigationItems = [
  { to: '/', label: 'Overview', icon: Activity },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/roles', label: 'Roles', icon: Shield },
] as const;

export function AppShell() {
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(184,230,218,0.75),_transparent_30%),linear-gradient(180deg,_#f4f1e8_0%,_#ece7db_100%)] text-slate-900">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[28px] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(33,41,51,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
                Forge Admin Console
              </span>
              <div>
                <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
                  Runtime maintenance and visibility
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
                  Maintenance UI for the Forge runtime. Human-facing, narrow, and intentionally
                  separate from the agent tool surface.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryChip label="Agents" value={overviewQuery.data?.totals.agents} icon={Bot} />
              <SummaryChip
                label="Loaded"
                value={overviewQuery.data?.totals.loadedAgents}
                icon={Zap}
              />
              <SummaryChip
                label="Running"
                value={overviewQuery.data?.totals.runningAgents}
                icon={Activity}
              />
              <SummaryChip
                label="Cash"
                value={formatUsd(overviewQuery.data?.cash.balanceUsd)}
                icon={CircleDollarSign}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === '/' }}
                  activeProps={{
                    className: 'border-slate-950 bg-slate-950 text-white shadow-lg',
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-white"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Outlet />
        </div>
      </div>
    </div>
  );
}

function SummaryChip(input: {
  label: string;
  value: string | number | undefined;
  icon: typeof Activity;
}) {
  const Icon = input.icon;

  return (
    <Card className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-none">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-4 w-4" />
        {input.label}
      </div>
      <div
        className={cn(
          'mt-2 text-lg font-semibold text-slate-950',
          !input.value && 'text-slate-400',
        )}
      >
        {input.value ?? '—'}
      </div>
    </Card>
  );
}
