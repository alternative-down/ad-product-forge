import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  addRoleWorkflowPermission,
  addRoleToolPermission,
  createRole,
  deleteRole,
  getRoles,
  removeRoleWorkflowPermission,
  removeRoleToolPermission,
  updateRole,
} from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { RoleDialog } from './role-dialog';
import { createEmptyRoleForm, createRoleForm, groupToolIds, type RoleForm } from './roles-page.helpers';

export function RolesPage() {
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
  const workflowIds = useMemo(
    () => [...(rolesQuery.data?.availableWorkflowIds ?? [])].sort((left, right) => left.localeCompare(right)),
    [rolesQuery.data?.availableWorkflowIds],
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
      const currentWorkflowIds = input.roleId
        ? (roles.find((role) => role.roleId === input.roleId)?.workflowIds ?? [])
        : [];
      const nextWorkflowIds = [...new Set(input.workflowIds)].sort((left, right) => left.localeCompare(right));
      const workflowIdsToAdd = nextWorkflowIds.filter((workflowId) => !currentWorkflowIds.includes(workflowId));
      const workflowIdsToRemove = currentWorkflowIds.filter((workflowId) => !nextWorkflowIds.includes(workflowId));

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

      for (const workflowId of workflowIdsToAdd) {
        await addRoleWorkflowPermission({
          roleId: savedRole.roleId,
          workflowId,
        });
      }

      for (const workflowId of workflowIdsToRemove) {
        await removeRoleWorkflowPermission({
          roleId: savedRole.roleId,
          workflowId,
        });
      }

      return savedRole;
    },
    onMutate: (input) => startAdminAction(input.roleId ? 'Salvando papel...' : 'Criando papel...'),
    onSuccess: async (_data, input, context) => {
      succeedAdminAction(context, input.roleId ? 'Papel atualizado.' : 'Papel criado.');
      setDialogOpen(false);
      setRoleForm(createEmptyRoleForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onMutate: () => startAdminAction('Excluindo papel...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Papel excluído.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Papéis & Ferramentas"
        description="Defina os papéis do sistema e quais ferramentas cada um pode usar."
      />

      <section className="space-y-5">
        {rolesQuery.isLoading && roles.length === 0 ? <AdminLoadingState label="Carregando papéis..." /> : null}
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
          <Table className="text-sm">
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

      <RoleDialog
        open={dialogOpen}
        pending={roleMutation.isPending}
        form={roleForm}
        workflowIds={workflowIds}
        toolSections={toolSections}
        errorMessage={roleMutation.error?.message}
        onOpenChange={setDialogOpen}
        onFormChange={setRoleForm}
        onSubmit={() => roleMutation.mutate(roleForm)}
      />
    </div>
  );
}
