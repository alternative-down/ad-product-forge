import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminButton, AdminInput, AdminLoadingState, PageHeader } from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteAgentSkill, getAgent, uploadAgentSkills } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

export const Route = createFileRoute('/agents/$agentId/skills/')({
  component: AgentSkillsIndexRoute,
});

function AgentSkillsIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const [skillFile, setSkillFile] = useState<File | null>(null);
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
    onMutate: () => startAdminAction('Enviando skill...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Skill enviada.');
      setSkillFile(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const deleteSkillMutation = useMutation({
    mutationFn: (skillName: string) => deleteAgentSkill({ agentId, skillName }),
    onMutate: () => startAdminAction('Excluindo skill...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Skill excluída.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const skills = agentQuery.data?.skills ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando skills..." /> : null}
      <PageHeader title="Skills" />

      <section className="space-y-5">
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
        {uploadSkillMutation.error ? <div className="text-sm text-destructive">{uploadSkillMutation.error.message}</div> : null}
        {deleteSkillMutation.error ? <div className="text-sm text-destructive">{deleteSkillMutation.error.message}</div> : null}
      </section>
    </div>
  );
}
