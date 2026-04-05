import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createAgentMcpServer,
  deleteAgentMcpServer,
  getAgent,
  updateAgentMcpServer,
  type AgentMcpServerInput,
} from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { McpDialog } from './-mcp-dialog';
import { createEmptyMcpForm, createMcpForm, type McpForm } from './-mcp-helpers';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mcpForm, setMcpForm] = useState<McpForm>(createEmptyMcpForm);
  const mcpMutation = useMutation({
    mutationFn: async (form: McpForm) => {
      const baseInput = form.transport === 'stdio'
        ? {
            agentId,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            transport: 'stdio' as const,
            command: form.command.trim(),
            argsText: form.argsText.trim() || undefined,
            envVarsText: form.envVarsText.trim() || undefined,
            isActive: form.isActive,
          }
        : {
            agentId,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            transport: 'http_streamable' as const,
            url: form.url.trim(),
            headersText: form.headersText.trim() || undefined,
            isActive: form.isActive,
          };

      if (form.configId && form.serverId) {
        return updateAgentMcpServer({
          ...baseInput,
          configId: form.configId,
          serverId: form.serverId,
        });
      }

      return createAgentMcpServer(baseInput satisfies AgentMcpServerInput);
    },
    onMutate: (form) =>
      startAdminAction(form.configId ? 'Salvando servidor MCP...' : 'Criando servidor MCP...'),
    onSuccess: async (_data, form, context) => {
      succeedAdminAction(context, form.configId ? 'Servidor MCP atualizado.' : 'Servidor MCP criado.');
      setDialogOpen(false);
      setMcpForm(createEmptyMcpForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const deleteMcpMutation = useMutation({
    mutationFn: (server: { configId: string; serverId: string }) =>
      deleteAgentMcpServer({
        agentId,
        configId: server.configId,
        serverId: server.serverId,
      }),
    onMutate: () => startAdminAction('Excluindo servidor MCP...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Servidor MCP excluído.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const mcpServers = agentQuery.data?.mcpServers ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando MCP..." /> : null}
      <PageHeader title="MCP" />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Servidores MCP</div>
          </div>

          <AdminButton
            onClick={() => {
              setMcpForm(createEmptyMcpForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Transporte</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mcpServers.map((server) => (
                <TableRow key={server.configId}>
                  <TableCell className="px-4 py-3">{server.name}</TableCell>
                  <TableCell className="px-4 py-3">{server.transport === 'stdio' ? 'stdio' : 'http'}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setMcpForm(createMcpForm(server));
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={deleteMcpMutation.isPending}
                        onClick={() => deleteMcpMutation.mutate({ configId: server.configId, serverId: server.serverId })}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {mcpServers.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={3}>
                    Nenhum servidor MCP ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
        {mcpMutation.error ? <div className="text-sm text-destructive">{mcpMutation.error.message}</div> : null}
        {deleteMcpMutation.error ? <div className="text-sm text-destructive">{deleteMcpMutation.error.message}</div> : null}
      </section>

      <McpDialog
        open={dialogOpen}
        pending={mcpMutation.isPending}
        form={mcpForm}
        onOpenChange={setDialogOpen}
        onFormChange={setMcpForm}
        onSubmit={() => mcpMutation.mutate(mcpForm)}
      />
    </div>
  );
}
