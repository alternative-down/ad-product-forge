import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getAgents } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/')({
  component: AgentsIndexRoute,
});

function AgentsIndexRoute() {
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
  });
  const agents = agentsQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Agentes" />

      <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.agentId}
              to="/agents/$agentId"
              params={{ agentId: agent.agentId }}
              className="block rounded-sm border border-border bg-background px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="h-14 w-14 border border-border bg-muted">
                    <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
                      {getAgentInitials(agent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <Badge variant="outline" className="rounded-sm">
                    {humanizeAgentStatus(agent)}
                  </Badge>
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="space-y-1">
                    <div className="truncate text-base font-semibold tracking-[-0.03em]">{agent.name}</div>
                    <div className="text-sm text-muted-foreground">{agent.roleName ?? 'Sem papel'}</div>
                  </div>
                  </div>
                </div>
            </Link>
          ))}
        </div>

        {agents.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum agente ainda.</div>
        ) : null}
        {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
      </section>
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

function humanizeAgentStatus(agent: {
  executionState: 'idle' | 'running';
}) {
  if (agent.executionState === 'running') {
    return 'Trabalhando';
  }

  return 'Ocioso';
}
