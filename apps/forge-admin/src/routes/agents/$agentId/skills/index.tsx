import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteAgentSkill, getAgent, getSystemSkills, installGlobalSkillForAgent } from '@/lib/admin-api';
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
  const systemSkillsQuery = useQuery({
    queryKey: ['admin', 'system-skills'],
    queryFn: getSystemSkills,
  });
  const installMutation = useMutation({
    mutationFn: (skillName: string) => installGlobalSkillForAgent({ agentId, skillName }),
    onMutate: () => startAdminAction('Instalando skill...'),
    onSuccess: async (_data, _skillName, context) => {
      succeedAdminAction(context, 'Skill instalada.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _skillName, context) => failAdminAction(context, error),
  });
  const deleteMutation = useMutation({
    mutationFn: (skillName: string) => deleteAgentSkill({ agentId, skillName }),
    onMutate: () => startAdminAction('Removendo skill...'),
    onSuccess: async (_data, _skillName, context) => {
      succeedAdminAction(context, 'Skill removida.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
    },
    onError: (error, _skillName, context) => failAdminAction(context, error),
  });
  const installedSkills = new Set((agentQuery.data?.skills ?? []).map((skill) => skill.skillName));
  const skills = systemSkillsQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {(agentQuery.isLoading && !agentQuery.data) || (systemSkillsQuery.isLoading && !systemSkillsQuery.data)
        ? <AdminLoadingState label="Carregando skills..." />
        : null}

      <PageHeader title="Skills" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Catálogo compartilhado</div>
          <div className="text-sm text-muted-foreground">
            Gerencie o catálogo em <Link to="/settings/skills" className="underline underline-offset-4">Configurações &gt; Skills</Link> e apenas instale ou remova aqui.
          </div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Origem</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => {
                const installed = installedSkills.has(skill.skillName);
                const busy = installMutation.isPending || deleteMutation.isPending;

                return (
                  <TableRow key={skill.skillName}>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1">
                        <div>{skill.skillName}</div>
                        {skill.description ? (
                          <div className="text-xs text-muted-foreground">{skill.description}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">{skill.source === 'bundled' ? 'Bundled' : 'Catálogo'}</TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {installed ? (
                          <AdminButton
                            variant="outline"
                            disabled={busy}
                            onClick={() => deleteMutation.mutate(skill.skillName)}
                          >
                            Remover
                          </AdminButton>
                        ) : (
                          <AdminButton
                            disabled={busy}
                            onClick={() => installMutation.mutate(skill.skillName)}
                          >
                            Instalar
                          </AdminButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {skills.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={3}>
                    Nenhuma skill disponível no catálogo.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
        {systemSkillsQuery.error ? <div className="text-sm text-destructive">{systemSkillsQuery.error.message}</div> : null}
      </section>
    </div>
  );
}
