import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import { AdminButton, HireAgentDialog, PageHeader } from '@/components/admin';
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
        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Papel</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.agentId}>
                  <TableCell className="px-4 py-3">{agent.name}</TableCell>
                  <TableCell className="px-4 py-3">{agent.roleName ?? 'Sem papel'}</TableCell>
                  <TableCell className="px-4 py-3">{agent.executionState === 'running' ? 'Trabalhando' : 'Ocioso'}</TableCell>
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
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
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
