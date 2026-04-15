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
    refetchInterval: 60_000,
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

              <div className="grid gap-4 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="space-y-1 text-sm">
                  <InfoRow
                    label="Última step"
                    value={agent.overview.lastStepAt ? `${formatDateTime(agent.overview.lastStepAt)} · ${formatRelativeTime(agent.overview.lastStepAt)}` : '—'}
                  />
                  <InfoRow
                    label="Contexto da step"
                    value={formatTokenCount(agent.overview.lastStepContextTokens)}
                  />
                  <InfoRow
                    label="Média entre steps"
                    value={formatDuration(agent.overview.averageStepIntervalMs)}
                  />
                  <InfoRow
                    label="LTM"
                    value={agent.overview.ltm.running ? 'Executando' : agent.overview.ltm.queued ? 'Enfileirada' : 'Ociosa'}
                  />
                </div>

                {agent.overview.om ? (
                  <div className="space-y-1.5">
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

function InfoRow(input: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="text-right font-medium text-foreground">{input.value}</span>
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
      <div className="h-1 overflow-hidden rounded-full bg-muted">
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

function formatTokenCount(value: number | null) {
  if (value === null) {
    return '—';
  }

  return `${formatNullableNumber(value)} tokens`;
}

function formatRelativeTime(value: number | null) {
  if (!value) {
    return '—';
  }

  const diffMs = Math.max(Date.now() - value, 0);
  const diffSeconds = Math.floor(diffMs / 1_000);

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  return `${Math.floor(diffSeconds / 60)} min`;
}

function formatDuration(value: number | null) {
  if (!value) {
    return '—';
  }

  const seconds = Math.max(1, Math.round(value / 1_000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.round(seconds / 60)} min`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
