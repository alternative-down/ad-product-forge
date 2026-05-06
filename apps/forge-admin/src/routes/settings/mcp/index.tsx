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
import { deleteSystemMcpServer, getSystemMcpServers, upsertSystemMcpServer } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { createEmptyMcpForm, createMcpForm, McpDialog, toSystemMcpInput } from './-mcp-dialog';

export const Route = createFileRoute('/settings/mcp/')({
  component: SettingsMcpIndexRoute,
});

function SettingsMcpIndexRoute() {
  const queryClient = useQueryClient();
  const mcpQuery = useQuery({
    queryKey: ['admin', 'system-mcp'],
    queryFn: getSystemMcpServers,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mcpForm, setMcpForm] = useState(createEmptyMcpForm);
  const upsertMutation = useMutation({
    mutationFn: () => upsertSystemMcpServer(toSystemMcpInput(mcpForm)),
    onMutate: () => startAdminAction(mcpForm.serverId ? 'Salvando servidor MCP...' : 'Criando servidor MCP...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, mcpForm.serverId ? 'Servidor MCP atualizado.' : 'Servidor MCP criado.');
      setDialogOpen(false);
      setMcpForm(createEmptyMcpForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-mcp'] });
    },
    onError: (error, _variables, context) => failAdminAction(context, error),
  });
  const deleteMutation = useMutation({
    mutationFn: (serverId: string) => deleteSystemMcpServer(serverId),
    onMutate: () => startAdminAction('Excluindo servidor MCP...'),
    onSuccess: async (_data, _serverId, context) => {
      succeedAdminAction(context, 'Servidor MCP excluído.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-mcp'] });
    },
    onError: (error, _serverId, context) => failAdminAction(context, error),
  });
  const servers = mcpQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {mcpQuery.isLoading && !mcpQuery.data ? <AdminLoadingState label="Carregando MCP..." /> : null}

      <PageHeader
        title="MCP"
        description="Cadastre servidores MCP uma vez e depois habilite o uso por agente."
      />

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold tracking-[-0.03em]">Servidores compartilhados</div>
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
                <TableHead className="px-4 py-3 font-medium">Ativo</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
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
                  <TableCell className="px-4 py-3">{server.isActive ? 'Sim' : 'Não'}</TableCell>
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
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(server.serverId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {servers.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Nenhum servidor MCP ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {mcpQuery.error ? <div className="text-sm text-destructive">{mcpQuery.error.message}</div> : null}
      </section>

      <McpDialog
        open={dialogOpen}
        pending={upsertMutation.isPending}
        form={mcpForm}
        onOpenChange={setDialogOpen}
        onFormChange={setMcpForm}
        onSubmit={() => upsertMutation.mutate()}
      />
    </div>
  );
}
