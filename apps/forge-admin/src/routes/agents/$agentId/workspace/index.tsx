import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  createAgentMcpServer,
  deleteAgentMcpServer,
  deleteAgentSkill,
  getAgent,
  updateAgentMcpServer,
  uploadAgentSkills,
  type AgentDetail,
  type AgentMcpServerInput,
} from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/workspace/')({
  component: AgentWorkspaceIndexRoute,
});

type McpForm = {
  configId?: string;
  serverId?: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http_streamable';
  command: string;
  argsText: string;
  envVarsText: string;
  url: string;
  headersText: string;
  isActive: boolean;
};

function createEmptyMcpForm(): McpForm {
  return {
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    envVarsText: '',
    url: '',
    headersText: '',
    isActive: true,
  };
}

function createMcpForm(server: AgentDetail['mcpServers'][number]): McpForm {
  return {
    configId: server.configId,
    serverId: server.serverId,
    name: server.name,
    description: server.description ?? '',
    transport: server.transport,
    command: server.command,
    argsText: server.argsText,
    envVarsText: server.envVarsText,
    url: server.url,
    headersText: server.headersText,
    isActive: server.isActive,
  };
}

function AgentWorkspaceIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mcpForm, setMcpForm] = useState<McpForm>(createEmptyMcpForm);
  const [skillFile, setSkillFile] = useState<File | null>(null);
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
    onSuccess: async () => {
      setDialogOpen(false);
      setMcpForm(createEmptyMcpForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const deleteMcpMutation = useMutation({
    mutationFn: (server: { configId: string; serverId: string }) =>
      deleteAgentMcpServer({
        agentId,
        configId: server.configId,
        serverId: server.serverId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const uploadSkillMutation = useMutation({
    mutationFn: async () => {
      if (!skillFile) {
        throw new Error('Selecione um arquivo zip.');
      }

      const buffer = await skillFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      let binary = '';

      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }

      return uploadAgentSkills({
        agentId,
        archiveBase64: btoa(binary),
      });
    },
    onSuccess: async () => {
      setSkillFile(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const deleteSkillMutation = useMutation({
    mutationFn: (skillName: string) => deleteAgentSkill({ agentId, skillName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
  });
  const mcpServers = agentQuery.data?.mcpServers ?? [];
  const skills = agentQuery.data?.skills ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="MCP & Skills" />

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
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Skills</div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="skill-archive">
              Arquivo zip
            </label>
            <AdminInput
              id="skill-archive"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setSkillFile(event.target.files?.[0] ?? null)}
              disabled={uploadSkillMutation.isPending}
            />
          </div>

          <AdminButton disabled={!skillFile || uploadSkillMutation.isPending} onClick={() => uploadSkillMutation.mutate()}>
            {uploadSkillMutation.isPending ? 'Enviando...' : 'Incluir'}
          </AdminButton>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.skillName}>
                  <TableCell className="px-4 py-3">{skill.skillName}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={deleteSkillMutation.isPending}
                        onClick={() => deleteSkillMutation.mutate(skill.skillName)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {skills.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    Nenhuma skill instalada.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
        {mcpMutation.error ? <div className="text-sm text-destructive">{mcpMutation.error.message}</div> : null}
        {deleteMcpMutation.error ? <div className="text-sm text-destructive">{deleteMcpMutation.error.message}</div> : null}
        {uploadSkillMutation.error ? <div className="text-sm text-destructive">{uploadSkillMutation.error.message}</div> : null}
        {deleteSkillMutation.error ? <div className="text-sm text-destructive">{deleteSkillMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{mcpForm.configId ? 'Editar servidor MCP' : 'Novo servidor MCP'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              mcpMutation.mutate(mcpForm);
            }}
          >
            <AdminDialogBody>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mcp-name">
                    Nome
                  </label>
                  <AdminInput id="mcp-name" value={mcpForm.name} onChange={(event) => setMcpForm((current) => ({ ...current, name: event.target.value }))} disabled={mcpMutation.isPending} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mcp-description">
                    Descrição
                  </label>
                  <AdminTextarea id="mcp-description" rows={4} value={mcpForm.description} onChange={(event) => setMcpForm((current) => ({ ...current, description: event.target.value }))} disabled={mcpMutation.isPending} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="mcp-transport">
                    Transporte
                  </label>
                  <Select value={mcpForm.transport} onValueChange={(value: 'stdio' | 'http_streamable') => setMcpForm((current) => ({ ...current, transport: value }))} disabled={mcpMutation.isPending}>
                    <SelectTrigger id="mcp-transport" className="w-full">
                      <SelectValue>{mcpForm.transport === 'stdio' ? 'stdio' : 'http_streamable'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stdio">stdio</SelectItem>
                      <SelectItem value="http_streamable">http_streamable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mcpForm.transport === 'stdio' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mcp-command">
                        Command
                      </label>
                      <AdminInput id="mcp-command" value={mcpForm.command} onChange={(event) => setMcpForm((current) => ({ ...current, command: event.target.value }))} disabled={mcpMutation.isPending} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mcp-args">
                        Args JSON
                      </label>
                      <AdminTextarea id="mcp-args" rows={4} value={mcpForm.argsText} onChange={(event) => setMcpForm((current) => ({ ...current, argsText: event.target.value }))} disabled={mcpMutation.isPending} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mcp-env">
                        Env vars JSON
                      </label>
                      <AdminTextarea id="mcp-env" rows={4} value={mcpForm.envVarsText} onChange={(event) => setMcpForm((current) => ({ ...current, envVarsText: event.target.value }))} disabled={mcpMutation.isPending} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mcp-url">
                        URL
                      </label>
                      <AdminInput id="mcp-url" value={mcpForm.url} onChange={(event) => setMcpForm((current) => ({ ...current, url: event.target.value }))} disabled={mcpMutation.isPending} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mcp-headers">
                        Headers JSON
                      </label>
                      <AdminTextarea id="mcp-headers" rows={4} value={mcpForm.headersText} onChange={(event) => setMcpForm((current) => ({ ...current, headersText: event.target.value }))} disabled={mcpMutation.isPending} />
                    </div>
                  </>
                )}

                <label className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
                  <span className="text-sm font-medium">Ativo</span>
                  <Switch checked={mcpForm.isActive} onCheckedChange={(checked) => setMcpForm((current) => ({ ...current, isActive: checked }))} disabled={mcpMutation.isPending} />
                </label>
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton
                type="submit"
                disabled={
                  mcpMutation.isPending ||
                  !mcpForm.name.trim() ||
                  (mcpForm.transport === 'stdio' ? !mcpForm.command.trim() : !mcpForm.url.trim())
                }
              >
                {mcpMutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}
