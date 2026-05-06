import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  assignAgentMcpServer,
  detachAgentMcpServer,
  getAgent,
  getSystemMcpServers,
  setAgentMcpServerActive,
} from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/agents/$agentId/mcp/')({
  component: AgentMcpIndexRoute,
});

function AgentMcpIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const systemMcpQuery = useQuery({
    queryKey: ['admin', 'system-mcp'],
    queryFn: getSystemMcpServers,
  });
  const assignMutation = useMutation({
    mutationFn: (serverId: string) => assignAgentMcpServer({ agentId, serverId, isActive: true }),
    onMutate: () => startAdminAction('Vinculando MCP...'),
    onSuccess: async (_data, _serverId, context) => {
      succeedAdminAction(context, 'MCP vinculado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _serverId, context) => failAdminAction(context, error),
  });
  const activeMutation = useMutation({
    mutationFn: (input: { configId: string; isActive: boolean }) =>
      setAgentMcpServerActive({ agentId, configId: input.configId, isActive: input.isActive }),
    onMutate: () => startAdminAction('Atualizando MCP...'),
    onSuccess: async (_data, _input, context) => {
      succeedAdminAction(context, 'MCP atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _input, context) => failAdminAction(context, error),
  });
  const detachMutation = useMutation({
    mutationFn: (configId: string) => detachAgentMcpServer({ agentId, configId }),
    onMutate: () => startAdminAction('Removendo vínculo MCP...'),
    onSuccess: async (_data, _configId, context) => {
      succeedAdminAction(context, 'Vínculo MCP removido.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _configId, context) => failAdminAction(context, error),
  });
  const assignedByServerId = new Map(
    (agentQuery.data?.mcpServers ?? []).map((server) => [server.serverId, server]),
  );
  const servers = systemMcpQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {(agentQuery.isLoading && !agentQuery.data) || (systemMcpQuery.isLoading && !systemMcpQuery.data)
        ? <AdminLoadingState label="Carregando MCP..." />
        : null}

      <PageHeader title="MCP" />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Servidores compartilhados</div>
            <div className="text-sm text-muted-foreground">
              Gerencie os servidores em <Link to="/settings/mcp" className="underline underline-offset-4">Configurações &gt; MCP</Link> e apenas habilite aqui os que este agente pode usar.
            </div>
          </div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Transporte</TableHead>
                <TableHead className="px-4 py-3 font-medium">Ativo</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => {
                const assigned = assignedByServerId.get(server.serverId) ?? null;
                const busy =
                  assignMutation.isPending ||
                  activeMutation.isPending ||
                  detachMutation.isPending;

                return (
                  <TableRow key={server.serverId}>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1">
                        <div>{server.name}</div>
                        {server.description ? (
                          <div className="text-xs text-muted-foreground">{server.description}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">{server.transport === 'stdio' ? 'stdio' : 'http'}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Switch
                        checked={assigned?.isActive ?? false}
                        disabled={!assigned || busy}
                        onCheckedChange={(checked) => {
                          if (!assigned) {
                            return;
                          }

                          activeMutation.mutate({ configId: assigned.configId, isActive: checked });
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {assigned ? (
                          <AdminButton
                            variant="outline"
                            disabled={busy}
                            onClick={() => detachMutation.mutate(assigned.configId)}
                          >
                            Remover
                          </AdminButton>
                        ) : (
                          <AdminButton
                            disabled={busy || !server.isActive}
                            onClick={() => assignMutation.mutate(server.serverId)}
                          >
                            Habilitar
                          </AdminButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {servers.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Nenhum servidor MCP cadastrado ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
        {systemMcpQuery.error ? <div className="text-sm text-destructive">{systemMcpQuery.error.message}</div> : null}
      </section>
    </div>
  );
}
