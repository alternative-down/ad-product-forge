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
};

function createEmptyRoleForm(): RoleForm {
  return {
    name: '',
    description: '',
  };
}

function createRoleForm(role: RoleItem): RoleForm {
  return {
    roleId: role.roleId,
    name: role.name,
    description: role.description ?? '',
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
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const roles = useMemo(
    () => [...(rolesQuery.data?.items ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    [rolesQuery.data?.items],
  );
  const currentSelectedRoleId =
    selectedRoleId && roles.some((role) => role.roleId === selectedRoleId)
      ? selectedRoleId
      : (roles[0]?.roleId ?? null);
  const selectedRole = useMemo(
    () => roles.find((role) => role.roleId === currentSelectedRoleId) ?? null,
    [currentSelectedRoleId, roles],
  );
  const toolSections = useMemo(
    () => groupToolIds(rolesQuery.data?.availableToolIds ?? []),
    [rolesQuery.data?.availableToolIds],
  );

  const roleMutation = useMutation({
    mutationFn: async (input: RoleForm) => {
      if (input.roleId) {
        return updateRole({
          roleId: input.roleId,
          name: input.name.trim(),
          description: input.description.trim() || null,
        });
      }

      return createRole({
        name: input.name.trim(),
        description: input.description.trim() || undefined,
      });
    },
    onSuccess: async (role) => {
      setDialogOpen(false);
      setRoleForm(createEmptyRoleForm());
      setSelectedRoleId(role.roleId);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: async (_, roleId) => {
      if (currentSelectedRoleId === roleId) {
        setSelectedRoleId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: async (input: { roleId: string; toolId: string; enabled: boolean }) => {
      if (input.enabled) {
        return addRoleToolPermission({
          roleId: input.roleId,
          toolId: input.toolId,
        });
      }

      return removeRoleToolPermission({
        roleId: input.roleId,
        toolId: input.toolId,
      });
    },
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
                <TableHead className="px-4 py-3 font-medium">Descrição</TableHead>
                <TableHead className="px-4 py-3 font-medium">Ferramentas</TableHead>
                <TableHead className="px-4 py-3 font-medium">Agentes</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow
                  key={role.roleId}
                  className={currentSelectedRoleId === role.roleId ? 'bg-muted/40' : undefined}
                  onClick={() => setSelectedRoleId(role.roleId)}
                >
                  <TableCell className="px-4 py-3">{role.name}</TableCell>
                  <TableCell className="max-w-[26rem] px-4 py-3 text-muted-foreground">
                    <div className="truncate">{role.description || '—'}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3">{role.toolIds.length}</TableCell>
                  <TableCell className="px-4 py-3">{role.assignedAgentCount}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
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
                        onClick={(event) => {
                          event.stopPropagation();
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
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={5}>
                    Nenhum papel cadastrado.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">
            {selectedRole ? `Ferramentas de ${selectedRole.name}` : 'Ferramentas por papel'}
          </div>
          {selectedRole?.description ? (
            <div className="text-sm text-muted-foreground">{selectedRole.description}</div>
          ) : null}
        </div>

        {selectedRole ? (
          <div className="space-y-5">
            {toolSections.map((section) => (
              <div key={section.title} className="space-y-3">
                <div className="text-sm font-medium text-foreground">{section.title}</div>
                <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
                  <Table className="min-w-[640px] text-sm">
                    <TableHeader className="bg-muted/50 text-left text-muted-foreground">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="px-4 py-3 font-medium">Ferramenta</TableHead>
                        <TableHead className="px-4 py-3 text-right font-medium">Permitida</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.toolIds.map((toolId) => {
                        const enabled = selectedRole.toolIds.includes(toolId);

                        return (
                          <TableRow key={toolId}>
                            <TableCell className="px-4 py-3 font-mono text-[13px]">{toolId}</TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <div className="flex justify-end">
                                <Switch
                                  checked={enabled}
                                  disabled={permissionMutation.isPending}
                                  onCheckedChange={(checked) =>
                                    permissionMutation.mutate({
                                      roleId: selectedRole.roleId,
                                      toolId,
                                      enabled: checked,
                                    })
                                  }
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Selecione um papel para ajustar as ferramentas.</div>
        )}

        {rolesQuery.error ? <div className="text-sm text-destructive">{rolesQuery.error.message}</div> : null}
        {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}
        {permissionMutation.error ? <div className="text-sm text-destructive">{permissionMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>{roleForm.roleId ? 'Editar papel' : 'Novo papel'}</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              roleMutation.mutate(roleForm);
            }}
          >
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
                rows={6}
                value={roleForm.description}
                onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                disabled={roleMutation.isPending}
              />
            </div>

            {roleMutation.error ? <div className="text-sm text-destructive">{roleMutation.error.message}</div> : null}

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

  for (const toolId of [...toolIds].sort((left, right) => left.localeCompare(right))) {
    const title = getToolSectionTitle(toolId);
    const current = sections.get(title) ?? [];
    current.push(toolId);
    sections.set(title, current);
  }

  return [...sections.entries()].map(([title, groupedToolIds]) => ({
    title,
    toolIds: groupedToolIds,
  }));
}

function getToolSectionTitle(toolId: string) {
  if (
    toolId === 'search_web' ||
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
    return 'Operação';
  }

  if (toolId.includes('role') || toolId.includes('capabilities')) {
    return 'Papéis';
  }

  if (toolId.includes('minimax')) {
    return 'MiniMax';
  }

  return 'Outras';
}
