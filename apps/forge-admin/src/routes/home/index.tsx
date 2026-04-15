import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import {
  AgentAvatar,
  AdminButton,
  AdminLoadingState,
  HireAgentDialog,
} from '@/components/admin';
import { Badge } from '@/components/ui/badge';
import { getAgents, getSystemSettings } from '@/lib/admin-api';

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

function HomeIndexRoute() {
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
  });
  const [hireOpen, setHireOpen] = useState(false);
  const agents = agentsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">
            {settingsQuery.data?.companyName?.trim() || 'Empresa'}
          </h1>
          {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando empresa..." /> : null}
        </div>
        <AdminButton onClick={() => setHireOpen(true)}>
          Contratar
        </AdminButton>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <Link
            key={agent.agentId}
            to="/agents/$agentId"
            params={{ agentId: agent.agentId }}
            className="block rounded-sm border border-border bg-background px-5 py-4 transition-colors hover:bg-muted/30"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <AgentAvatar
                  agentId={agent.agentId}
                  name={agent.name}
                  className="h-14 w-14 border border-border bg-muted"
                  fallbackClassName="bg-muted text-sm font-medium text-foreground"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-base font-semibold tracking-[-0.03em]">{agent.name}</div>
                    <Badge variant="outline" className="rounded-sm">
                      {humanizeAgentStatus(agent.executionState)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{agent.roleName ?? 'Sem papel'}</div>
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Última step</span>
                  <span className="font-medium text-foreground">{formatRelativeTime(agent.overview.lastStepAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Contexto da step</span>
                  <span className="font-medium text-foreground">{formatNullableNumber(agent.overview.lastStepContextTokens)} tokens</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Média entre steps</span>
                  <span className="font-medium text-foreground">{formatDuration(agent.overview.averageStepIntervalMs)}</span>
                </div>
              </div>

              {agent.overview.om ? (
                <div className="space-y-2">
                  <OmMetricBar
                    label="RAW"
                    current={agent.overview.om.recentRawTokenCount}
                    limit={agent.overview.om.recentRawTokenLimit}
                  />
                  <OmMetricBar
                    label="Overflow"
                    current={agent.overview.om.overflowTokenCount}
                    limit={agent.overview.om.overflowTokenLimit}
                  />
                  <OmMetricBar
                    label="Obs"
                    current={agent.overview.om.observationTokenCount}
                    limit={agent.overview.om.observationTokenLimit}
                  />
                  <OmMetricBar
                    label="Ref"
                    current={agent.overview.om.reflectionTokenCount}
                    limit={agent.overview.om.reflectionTokenLimit}
                  />
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </section>

      {agentsQuery.isLoading && agents.length === 0 ? <AdminLoadingState label="Carregando agentes..." /> : null}
      {agents.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum agente ainda.</div> : null}
      {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}

      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
}

function OmMetricBar(input: {
  label: string;
  current: number;
  limit: number;
}) {
  const percent = input.limit > 0
    ? Math.max(0, Math.min(100, Math.round((input.current / input.limit) * 100)))
    : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="uppercase tracking-[0.14em] text-muted-foreground">{input.label}</span>
        <span className="text-muted-foreground">
          {formatNullableNumber(input.current)} / {formatNullableNumber(input.limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/70 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function humanizeAgentStatus(executionState: 'idle' | 'running') {
  if (executionState === 'running') {
    return 'Trabalhando';
  }

  return 'Ocioso';
}

function formatNullableNumber(value: number | null) {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatRelativeTime(value: number | null) {
  if (!value) {
    return '—';
  }

  const diffMs = Math.max(Date.now() - value, 0);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'agora';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} h`;
  }

  return `${Math.floor(diffHours / 24)} d`;
}

function formatDuration(value: number | null) {
  if (!value) {
    return '—';
  }

  const minutes = Math.round(value / 60_000);

  if (minutes < 1) {
    return '<1 min';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}
