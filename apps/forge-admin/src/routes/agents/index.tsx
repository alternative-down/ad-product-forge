import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { AgentAvatar, AdminButton, AdminLoadingState, HireAgentDialog, PageHeader } from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAgents } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/')({
  component: AgentsIndexRoute,
});

function AgentsIndexRoute() {
  const [hireOpen, setHireOpen] = useState(false);
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
  });
  const agents = agentsQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Agentes"
        actions={
          <AdminButton onClick={() => setHireOpen(true)}>
            Contratar
          </AdminButton>
        }
      />

      <section className="space-y-5">
        {agentsQuery.isLoading && agents.length === 0 ? <AdminLoadingState label="Carregando agentes..." /> : null}
        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Papel</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                <TableHead className="px-4 py-3 font-medium">Última step</TableHead>
                <TableHead className="px-4 py-3 font-medium">Wake</TableHead>
                <TableHead className="px-4 py-3 font-medium">Notificações</TableHead>
                <TableHead className="px-4 py-3 font-medium">OM</TableHead>
                <TableHead className="px-4 py-3 font-medium">LTM</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.agentId}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AgentAvatar
                        agentId={agent.agentId}
                        name={agent.name}
                        size="sm"
                        className="border border-border bg-muted"
                        fallbackClassName="bg-muted text-xs font-medium text-foreground"
                      />
                      <span>{agent.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">{agent.roleName ?? 'Sem papel'}</TableCell>
                  <TableCell className="px-4 py-3">{agent.executionState === 'running' ? 'Trabalhando' : 'Ocioso'}</TableCell>
                  <TableCell className="px-4 py-3">{formatRelativeTime(agent.overview.lastStepAt)}</TableCell>
                  <TableCell className="px-4 py-3">
                    {agent.runner?.wake.pending
                      ? 'Pendente'
                      : agent.runner?.wake.waitingForIdle
                        ? 'Aguardando idle'
                        : 'Limpa'}
                  </TableCell>
                  <TableCell className="px-4 py-3">{agent.overview.unreadNotificationCount}</TableCell>
                  <TableCell className="px-4 py-3">
                    {agent.overview.om
                      ? `g${agent.overview.om.generationCount} · raw ${formatNullableNumber(agent.overview.om.recentRawTokenCount)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {`${formatNullableNumber(agent.overview.ltm.processedPackageCount)}/${formatNullableNumber(agent.overview.ltm.writtenPackageCount)}`}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        asChild
                        variant="ghost"
                        size="icon"
                      >
                        <Link to="/agents/$agentId" params={{ agentId: agent.agentId }}>
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Abrir agente</span>
                        </Link>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {agents.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={9}>
                    Nenhum agente ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
      </section>

      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
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
