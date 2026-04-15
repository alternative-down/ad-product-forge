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
  const runningCount = agents.filter((agent) => agent.executionState === 'running').length;
  const loadedCount = agents.filter((agent) => agent.loaded).length;
  const unreadNotificationCount = agents.reduce((total, agent) => total + agent.overview.unreadNotificationCount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-[-0.06em] sm:text-4xl">
          {settingsQuery.data?.companyName?.trim() || 'Empresa'}
        </h1>
        {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando empresa..." /> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewTile label="Agentes" value={String(agents.length)} detail={`${loadedCount} carregados`} />
        <OverviewTile label="Em execução" value={String(runningCount)} detail={`${Math.max(agents.length - runningCount, 0)} ociosos`} />
        <OverviewTile label="Notificações" value={String(unreadNotificationCount)} detail="não lidas" />
        <OverviewTile
          label="OM ativa"
          value={String(agents.filter((agent) => agent.overview.om && agent.overview.om.generationCount > 0).length)}
          detail="agentes com geração"
        />
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Visão operacional</div>
            <div className="text-sm text-muted-foreground">Última step, fila, notificações e sinais da OM por agente.</div>
          </div>
          <AdminButton onClick={() => setHireOpen(true)}>
            Contratar
          </AdminButton>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

                <div className="grid gap-2 sm:grid-cols-2">
                  <AgentMetric label="Última step" value={formatRelativeTime(agent.overview.lastStepAt)} />
                  <AgentMetric label="Tokens" value={formatNullableNumber(agent.overview.lastStepTokens)} />
                  <AgentMetric label="Wake" value={agent.runner?.wake.pending ? 'Pendente' : 'Limpa'} />
                  <AgentMetric label="Notificações" value={String(agent.overview.unreadNotificationCount)} />
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">OM</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <AgentMetric label="Generation" value={String(agent.overview.om?.generationCount ?? 0)} />
                    <AgentMetric label="Checkpoint" value={agent.overview.om?.checkpointGeneration?.toString() ?? '—'} />
                    <AgentMetric
                      label="RAW"
                      value={agent.overview.om
                        ? `${formatNullableNumber(agent.overview.om.recentRawTokenCount)}/${formatNullableNumber(agent.overview.om.recentRawTokenLimit)}`
                        : '—'}
                    />
                    <AgentMetric
                      label="Obs/Ref"
                      value={agent.overview.om
                        ? `${formatNullableNumber(agent.overview.om.observationTokenCount)} / ${formatNullableNumber(agent.overview.om.reflectionTokenCount)}`
                        : '—'}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {agentsQuery.isLoading && agents.length === 0 ? <AdminLoadingState label="Carregando agentes..." /> : null}
        {agents.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum agente ainda.</div> : null}
        {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
      </section>

      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
}

function OverviewTile(input: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{input.label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{input.value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{input.detail}</div>
    </div>
  );
}

function AgentMetric(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{input.label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{input.value}</div>
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

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} d`;
}
