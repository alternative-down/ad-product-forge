import { CircleDollarSign, Shield, Siren } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getOverview, listFunctions } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/format';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { MetricStrip, PageHeader } from '../../components/layout/page-header';

export function OverviewPage() {
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });
  if (overviewQuery.isLoading || functionsQuery.isLoading) {
    return <PanelLoading label="Loading overview" />;
  }

  if (overviewQuery.isError) {
    return <PanelError message={overviewQuery.error.message} />;
  }

  if (functionsQuery.isError) {
    return <PanelError message={functionsQuery.error.message} />;
  }

  const overview = overviewQuery.data!;
  const functions = functionsQuery.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Operational posture at a glance"
        description="The overview should answer three questions quickly: what is running, what is funded, and where the capability graph is drifting."
      />

      <MetricStrip
        items={[
          {
            label: 'Agents',
            value: overview.totals.agents,
            detail: `${overview.totals.loadedAgents} loaded`,
          },
          {
            label: 'Execution',
            value: `${overview.totals.runningAgents} running`,
            detail: `${overview.totals.idleAgents} idle`,
          },
          {
            label: 'Functions / Roles',
            value: `${overview.totals.functions} / ${overview.totals.roles}`,
            detail: 'Current capability topology',
          },
          {
            label: 'Cash balance',
            value: formatUsd(overview.cash.balanceUsd),
            detail: `${overview.totals.activeContracts} active contracts`,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Cash flow snapshot</h2>
              <p className="mt-1 text-sm text-slate-500">
                Posted and scheduled movements for the current period.
              </p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-slate-500" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Total in" value={formatUsd(overview.cash.summary.totalInUsd)} />
            <MiniMetric label="Total out" value={formatUsd(overview.cash.summary.totalOutUsd)} />
            <MiniMetric label="Net" value={formatUsd(overview.cash.summary.netUsd)} />
            <MiniMetric
              label="Scheduled out"
              value={formatUsd(overview.cash.summary.scheduledOutUsd)}
            />
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {overview.cash.recentMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{movement.type}</div>
                      <div className="text-xs text-slate-500">
                        {movement.description ?? 'No description'}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{movement.direction}</td>
                    <td className="px-4 py-3">{formatUsd(movement.amountUsd)}</td>
                    <td className="px-4 py-3">
                      {formatDateTime(movement.effectiveAt ?? movement.dueAt ?? movement.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Function map</h2>
              <p className="mt-1 text-sm text-slate-500">
                Read-only summary of functions, attached roles, and agent counts.
              </p>
            </div>
            <Siren className="h-5 w-5 text-slate-500" />
          </div>
          <div className="mt-5 space-y-3">
            {functions.map((agentFunction) => {
              const roleNames = agentFunction.roles.map((role) => role.name);

              return (
                <div
                  key={agentFunction.functionId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-950">{agentFunction.name}</div>
                      <div className="text-xs text-slate-500">
                        {agentFunction.description ?? 'No description'}
                      </div>
                    </div>
                    <Badge>{agentFunction.assignedAgentCount} agents</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                    <Shield className="h-3.5 w-3.5" />
                    Roles: {roleNames.length > 0 ? roleNames.join(', ') : 'No roles'}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MiniMetric(input: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {input.label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-950">{input.value}</div>
    </div>
  );
}

function PanelLoading(input: { label: string }) {
  return <Card className="p-6 text-sm text-slate-600">{input.label}</Card>;
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}
