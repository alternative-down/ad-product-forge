import { Link } from '@tanstack/react-router';
import { Bot, Cable, Shield, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { getOverview } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/format';
import { Card } from '../../components/ui/card';
import { PageHeader } from '../../components/layout/page-header';
import { WorkspaceCanvas } from '../../components/layout/section-nav';

export function OverviewPage() {
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  if (overviewQuery.isLoading) {
    return <PanelLoading label="Loading overview" />;
  }

  if (overviewQuery.isError) {
    return <PanelError message={overviewQuery.error.message} />;
  }

  const overview = overviewQuery.data!;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Forge control center"
        description="Use this page to enter the right workspace quickly. Details, editing, and long tables live in the specialized routes."
      />

      <WorkspaceCanvas
        title="Workspaces"
        description="Open one operational surface at a time."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <WorkspaceEntry
            to="/agents"
            icon={Bot}
            title="Agents"
            detail="Runtime, communications, schedules, and execution history."
            metric={`${overview.totals.agents} agents · ${overview.totals.runningAgents} running`}
          />
          <WorkspaceEntry
            to="/finance"
            icon={Wallet}
            title="Finance"
            detail="Capital, payables, recurring obligations, and ledger posting."
            metric={`Balance ${formatUsd(overview.cash.balanceUsd)}`}
          />
          <WorkspaceEntry
            to="/system"
            icon={Cable}
            title="System"
            detail="Company context, LLM setup, integrations, OAuth, and migrations."
            metric={`${overview.totals.loadedAgents} loaded agents`}
          />
          <WorkspaceEntry
            to="/roles"
            icon={Shield}
            title="Capabilities"
            detail="Roles, tool grants, and workflow grants."
            metric={`${overview.totals.roles} roles`}
          />
        </div>
      </WorkspaceCanvas>

      <WorkspaceCanvas
        title="Operational pulse"
        description="Small live summary only. The full workflows live behind each workspace."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Loaded agents" value={String(overview.totals.loadedAgents)} />
          <MiniMetric label="Running now" value={String(overview.totals.runningAgents)} />
          <MiniMetric label="Active contracts" value={String(overview.totals.activeContracts)} />
          <MiniMetric label="Cash balance" value={formatUsd(overview.cash.balanceUsd)} />
        </div>
      </WorkspaceCanvas>

      <WorkspaceCanvas
        title="Recent cash movement"
        description="Latest financial rows only. Open Finance for full posting and payable management."
        actions={
          <Link
            to="/finance"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-4 text-sm font-semibold text-[color:var(--muted-strong)] transition hover:border-[color:var(--panel-border-strong)] hover:text-[color:var(--ink)]"
          >
            Open finance
          </Link>
        }
      >
        <div className="overflow-hidden rounded-md border border-[color:var(--panel-border)]">
          <table className="min-w-full divide-y divide-[color:var(--panel-border)] text-left text-sm">
            <thead className="bg-[color:var(--panel-muted)] text-xs uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--panel-border)] bg-[color:var(--panel)] text-[color:var(--ink)]">
              {overview.cash.recentMovements.slice(0, 5).map((movement) => (
                <tr key={movement.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{movement.type}</div>
                    <div className="text-xs text-[color:var(--muted)]">
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
      </WorkspaceCanvas>
    </div>
  );
}

function WorkspaceEntry(input: {
  to: '/' | '/agents' | '/finance' | '/system' | '/roles';
  icon: typeof Bot;
  title: string;
  detail: string;
  metric: string;
}) {
  const Icon = input.icon;

  return (
    <Link
      to={input.to}
      className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-5 py-5 transition hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel)]"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-2 text-[color:var(--ink)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-[color:var(--ink)]">{input.title}</div>
          <div className="mt-2 text-sm text-[color:var(--muted)]">{input.detail}</div>
          <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            {input.metric}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MiniMetric(input: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {input.label}
      </div>
      <div className="mt-2 text-base font-semibold text-[color:var(--ink)]">{input.value}</div>
    </div>
  );
}

function PanelLoading(input: { label: string }) {
  return <Card className="p-6 text-sm text-[color:var(--muted)]">{input.label}</Card>;
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}
