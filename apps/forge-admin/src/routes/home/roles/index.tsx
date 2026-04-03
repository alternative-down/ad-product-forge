import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  PageHeader,
} from '@/components/admin';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  addRoleToolPermission,
  createRole,
  deleteRole,
  getRoles,
  removeRoleToolPermission,
  updateRole,
  type RoleItem,
} from '@/lib/admin-api';

export const Route = createFileRoute('/home/roles/')({
  component: HomeRolesIndexRoute,
});

type RoleForm = {
  roleId?: string;
  name: string;
  description: string;
  toolIds: string[];
};

function createEmptyRoleForm(): RoleForm {
  return {
    name: '',
    description: '',
    toolIds: [],
  };
}

function createRoleForm(role: RoleItem): RoleForm {
  return {
    roleId: role.roleId,
    name: role.name,
    description: role.description ?? '',
    toolIds: role.toolIds,
  };
}

function HomeRolesIndexRoute() {
  const queryClient = useQueryClient();
  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: getRoles,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<RoleForm>(createEmptyRoleForm);
  const roles = useMemo(
    () => [...(rolesQuery.data?.items ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [rolesQuery.data?.items],
  );
  const toolSections = useMemo(
    () => groupToolIds(rolesQuery.data?.availableToolIds ?? []),
    [rolesQuery.data?.availableToolIds],
  );

  const roleMutation = useMutation({
    mutationFn: async (input: RoleForm) => {
      const savedRole = input.roleId
        ? await updateRole({
            roleId: input.roleId,
            name: input.name.trim(),
            description: input.description.trim() || null,
          })
        : await createRole({
            name: input.name.trim(),
            description: input.description.trim() || undefined,
          });

      const currentToolIds = input.roleId
        ? (roles.find((role) => role.roleId === input.roleId)?.toolIds ?? [])
        : [];
      const nextToolIds = [...new Set(input.toolIds)].sort((left, right) => left.localeCompare(right));
      const toolIdsToAdd = nextToolIds.filter((toolId) => !currentToolIds.includes(toolId));
      const toolIdsToRemove = currentToolIds.filter((toolId) => !nextToolIds.includes(toolId));

      for (const toolId of toolIdsToAdd) {
        await addRoleToolPermission({
          roleId: savedRole.roleId,
          toolId,
        });
      }

      for (const toolId of toolIdsToRemove) {
        await removeRoleToolPermission({
          roleId: savedRole.roleId,
          toolId,
        });
      }

      return savedRole;
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setRoleForm(createEmptyRoleForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Papéis & Ferramentas"
        description="Defina os papéis do sistema e quais ferramentas cada um pode usar."
      />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Papéis cadastrados</div>
        </div>

        <div className="flex justify-end">
          <AdminButton
            onClick={() => {
              setRoleForm(createEmptyRoleForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="min-w-[760px] text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.roleId}>
                  <TableCell className="px-4 py-3">{role.name}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setRoleForm(createRoleForm(role));
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={deleteMutation.isPending || role.assignedAgentCount > 0}
                        onClick={() => {
                          deleteMutation.mutate(role.roleId);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Excluir</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    Nenhum papel cadastrado.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {rolesQuery.error ? <div className="text-sm text-destructive">{rolesQuery.error.message}</div> : null}
        {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{roleForm.roleId ? 'Editar papel' : 'Novo papel'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              roleMutation.mutate(roleForm);
            }}
          >
            <div className="min-h-0 space-y-5 overflow-y-auto overflow-x-hidden pr-1">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="role-name">
                  Nome
                </label>
                <AdminInput
                  id="role-name"
                  value={roleForm.name}
                  onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={roleMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="role-description">
                  Descrição
                </label>
                <AdminTextarea
                  id="role-description"
                  rows={5}
                  value={roleForm.description}
                  onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                  disabled={roleMutation.isPending}
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">Ferramentas</div>

                <Accordion className="space-y-3">
                  {toolSections.map((section) => (
                    <AccordionItem key={section.title} value={section.title} className="overflow-hidden rounded-sm border border-border">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span>{section.title}</span>
                          <span className="text-xs text-muted-foreground">{section.toolIds.length}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <div className="border-t border-border">
                          {section.toolIds.map((toolId) => {
                            const enabled = roleForm.toolIds.includes(toolId);

                            return (
                              <label
                                key={toolId}
                                className="flex items-center justify-between gap-4 px-4 py-3 not-last:border-b not-last:border-border"
                              >
                                <span className="min-w-0 font-mono text-[13px] break-all">{toolId}</span>
                                <Switch
                                  checked={enabled}
                                  disabled={roleMutation.isPending}
                                  onCheckedChange={(checked) =>
                                    setRoleForm((current) => ({
                                      ...current,
                                      toolIds: checked
                                        ? [...current.toolIds, toolId]
                                        : current.toolIds.filter((currentToolId) => currentToolId !== toolId),
                                    }))
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              {roleMutation.error ? <div className="text-sm text-destructive">{roleMutation.error.message}</div> : null}
            </div>

            <AdminDialogFooter>
              <AdminButton type="submit" disabled={roleMutation.isPending || !roleForm.name.trim()}>
                {roleMutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}

function groupToolIds(toolIds: string[]) {
  const sections = new Map<string, string[]>();
  const orderedSectionTitles = [
    'Pesquisa',
    'Comunicação',
    'Github',
    'Coolify',
    'Agenda & Tarefas',
    'Financeiro & Contratos',
    'Equipe & Papéis',
    'MiniMax',
    'Outras',
  ];

  for (const toolId of [...toolIds].sort((left, right) => left.localeCompare(right))) {
    const title = getToolSectionTitle(toolId);
    const current = sections.get(title) ?? [];
    current.push(toolId);
    sections.set(title, current);
  }

  return [...sections.entries()]
    .sort((left, right) => orderedSectionTitles.indexOf(left[0]) - orderedSectionTitles.indexOf(right[0]))
    .map(([title, groupedToolIds]) => ({
      title,
      toolIds: groupedToolIds,
    }));
}

function getToolSectionTitle(toolId: string) {
  if (toolId === 'search_web') {
    return 'Pesquisa';
  }

  if (
    toolId.includes('contact') ||
    toolId.includes('conversation') ||
    toolId.includes('message') ||
    toolId.includes('group')
  ) {
    return 'Comunicação';
  }

  if (toolId.includes('github')) {
    return 'Github';
  }

  if (toolId.includes('coolify')) {
    return 'Coolify';
  }

  if (toolId.includes('schedule') || toolId.includes('task')) {
    return 'Agenda & Tarefas';
  }

  if (toolId.includes('contract') || toolId.includes('cash') || toolId.includes('notification')) {
    return 'Financeiro & Contratos';
  }

  if (toolId.includes('role') || toolId.includes('capabilities')) {
    return 'Equipe & Papéis';
  }

  if (toolId.includes('minimax')) {
    return 'MiniMax';
  }

  return 'Outras';
}
