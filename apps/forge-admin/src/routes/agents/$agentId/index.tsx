import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAgent, type AgentDetail } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/')({
  component: AgentDetailIndexRoute,
});

function AgentDetailIndexRoute() {
  const { agentId } = Route.useParams();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const agent = agentQuery.data;

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {agent ? (
        <>
          <section className="space-y-5">
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20 border border-border bg-muted">
                  <AvatarFallback className="bg-muted text-base font-medium text-foreground">
                    {getAgentInitials(agent.name)}
                  </AvatarFallback>
                </Avatar>
                <Badge variant="outline" className="rounded-sm">
                  {humanizeAgentStatus(agent.executionState)}
                </Badge>
              </div>

              <div className="min-w-0 space-y-3">
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tracking-[-0.04em]">{agent.name}</div>
                  <div className="text-sm text-muted-foreground">{agent.role?.name ?? 'Sem papel'}</div>
                </div>
              </div>
            </div>
          </section>

          {agent.description ? (
            <section className="space-y-3">
              <div className="text-lg font-semibold tracking-[-0.03em]">Descrição</div>
              <div className="max-w-3xl text-sm leading-6 text-muted-foreground">{agent.description}</div>
            </section>
          ) : null}

          <section className="space-y-5">
            <div className="grid gap-4 min-[720px]:grid-cols-3">
              <MetricItem
                label="Valor do contrato"
                value={agent.activeContract ? formatUsd(agent.activeContract.weeklyValueUsd) : 'Sem contrato'}
              />
              <MetricItem
                label="% de uso"
                value={agent.activeContract ? `${formatPercent(agent.activeContract.spentPercent)}%` : '0%'}
              />
              <MetricItem
                label="Tempo médio de intervalo"
                value={formatAverageInterval(agent.recentExecutionSteps)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-lg font-semibold tracking-[-0.03em]">Instruções</div>
            <ScrollArea className="h-[min(20rem,calc(100dvh-18rem))] rounded-sm border border-border bg-background">
              <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-foreground">
                {agent.instructions.trim() || 'Sem instruções.'}
              </div>
            </ScrollArea>
          </section>
        </>
      ) : null}

      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
}

function MetricItem(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{input.label}</div>
      <div className="text-xl font-semibold tracking-[-0.03em]">{input.value}</div>
    </div>
  );
}

function getAgentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'AG';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function humanizeAgentStatus(executionState: 'idle' | 'running') {
  return executionState === 'running' ? 'Trabalhando' : 'Ocioso';
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatAverageInterval(steps: AgentDetail['recentExecutionSteps']) {
  if (steps.length < 2) {
    return 'Sem dados';
  }

  const sortedSteps = [...steps].sort((left, right) => left.createdAt - right.createdAt);
  let totalDiff = 0;

  for (let index = 1; index < sortedSteps.length; index += 1) {
    totalDiff += sortedSteps[index].createdAt - sortedSteps[index - 1].createdAt;
  }

  const averageMs = totalDiff / (sortedSteps.length - 1);
  const totalMinutes = Math.round(averageMs / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}
