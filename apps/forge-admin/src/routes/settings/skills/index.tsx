import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteSystemSkill, getSystemSkills, uploadSystemSkills } from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { AdminLoadingState } from '@/components/admin/./system/admin-loading-state';
export const Route = createFileRoute('/settings/skills/')({
  component: SettingsSkillsIndexRoute,
});

function SettingsSkillsIndexRoute() {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({
    queryKey: ['admin', 'system-skills'],
    queryFn: getSystemSkills,
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

      return uploadSystemSkills({
        archiveBase64: btoa(binary),
      });
    },
    onMutate: () => startAdminAction('Enviando skill...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Skill registrada no catálogo.');
      setSkillFile(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-skills'] });
    },
    onError: (error, _variables, context) => failAdminAction(context, error),
  });
  const deleteSkillMutation = useMutation({
    mutationFn: (skillName: string) => deleteSystemSkill(skillName),
    onMutate: () => startAdminAction('Excluindo skill...'),
    onSuccess: async (_data, _skillName, context) => {
      succeedAdminAction(context, 'Skill excluída do catálogo.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'system-skills'] });
    },
    onError: (error, _skillName, context) => failAdminAction(context, error),
  });
  const skills = skillsQuery.data ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {skillsQuery.isLoading && !skillsQuery.data ? (
        <AdminLoadingState label="Carregando skills..." />
      ) : null}

      <PageHeader
        title="Skills"
        description="Mantenha aqui o catálogo compartilhado de skills reutilizáveis. Os agentes apenas recebem vínculo para usar uma skill do catálogo. Atualizações do catálogo passam a valer em novos runs dos agentes que usam a skill; use idle + rewakeup se quiser aplicar imediatamente em um agente já carregado."
      />

      <section className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="system-skill-archive">
              Arquivo zip
            </label>
            <AdminInput
              id="system-skill-archive"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setSkillFile(event.target.files?.[0] ?? null)}
              disabled={uploadSkillMutation.isPending}
            />
          </div>

          <AdminButton
            disabled={!skillFile || uploadSkillMutation.isPending}
            onClick={() => uploadSkillMutation.mutate()}
          >
            {uploadSkillMutation.isPending ? 'Enviando...' : 'Incluir no catálogo'}
          </AdminButton>
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
              {skills.map((skill) => (
                <TableRow key={skill.skillName}>
                  <TableCell className="px-4 py-3">
                    <div className="space-y-1">
                      <div>{skill.skillName}</div>
                      {skill.description ? (
                        <div className="text-xs text-muted-foreground">{skill.description}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {skill.source === 'bundled' ? 'Bundled' : 'Catálogo'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={!skill.editable || deleteSkillMutation.isPending}
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
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={3}>
                    Nenhuma skill no catálogo.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {skillsQuery.error ? (
          <div className="text-sm text-destructive">{skillsQuery.error.message}</div>
        ) : null}
      </section>
    </div>
  );
}
