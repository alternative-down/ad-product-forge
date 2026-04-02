import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import {
  addRoleToolPermission,
  addRoleWorkflowPermission,
  createRole,
  deleteRole,
  listRoles,
  removeRoleToolPermission,
  removeRoleWorkflowPermission,
  updateRole,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/page-header';
import { WorkspaceCanvas } from '../../components/layout/section-nav';

type RoleDraft = {
  name: string;
  description: string;
  toolIds: string[];
  workflowIds: string[];
};

export function RolesPage() {
  return <RolesWorkspacePage />;
}

export function RoleDetailPage(input: { roleId: string }) {
  return <RolesWorkspacePage roleId={input.roleId} />;
}

function RolesWorkspacePage(input: { roleId?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [newRoleDraft, setNewRoleDraft] = useState<RoleDraft>({
    name: '',
    description: '',
    toolIds: [],
    workflowIds: [],
  });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });
  const selectedRole = rolesQuery.data?.items.find((role) => role.roleId === input.roleId) ?? null;
  const selectedRoleDraft = selectedRole
    ? roleDraft && selectedRole.roleId === input.roleId
      ? roleDraft
      : {
          name: selectedRole.name,
          description: selectedRole.description ?? '',
          toolIds: selectedRole.toolIds,
          workflowIds: selectedRole.workflowIds,
        }
    : null;

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: async (result) => {
      setNewRoleDraft({
        name: '',
        description: '',
        toolIds: [],
        workflowIds: [],
      });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      void navigate({ to: '/v1/roles/roles/$roleId', params: { roleId: result.roleId } });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (next: {
      roleId: string;
      name: string;
      description: string | null;
      currentToolIds: string[];
      currentWorkflowIds: string[];
      nextToolIds: string[];
      nextWorkflowIds: string[];
    }) => {
      await updateRole({
        roleId: next.roleId,
        name: next.name,
        description: next.description,
      });

      const toolAdds = next.nextToolIds.filter((toolId) => !next.currentToolIds.includes(toolId));
      const toolRemovals = next.currentToolIds.filter((toolId) => !next.nextToolIds.includes(toolId));
      const workflowAdds = next.nextWorkflowIds.filter((workflowId) => !next.currentWorkflowIds.includes(workflowId));
      const workflowRemovals = next.currentWorkflowIds.filter((workflowId) => !next.nextWorkflowIds.includes(workflowId));

      for (const toolId of toolAdds) {
        await addRoleToolPermission(next.roleId, toolId);
      }

      for (const toolId of toolRemovals) {
        await removeRoleToolPermission(next.roleId, toolId);
      }

      for (const workflowId of workflowAdds) {
        await addRoleWorkflowPermission(next.roleId, workflowId);
      }

      for (const workflowId of workflowRemovals) {
        await removeRoleWorkflowPermission(next.roleId, workflowId);
      }
    },
    onSuccess: async (_, next) => {
      setRoleDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      void navigate({ to: '/v1/roles/roles/$roleId', params: { roleId: next.roleId } });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: async (_, roleId) => {
      setRoleDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      const nextRoles = await queryClient.fetchQuery({
        queryKey: ['admin', 'roles'],
        queryFn: listRoles,
      });
      const nextRoleId = nextRoles.items.find((role) => role.roleId !== roleId)?.roleId;

      if (nextRoleId) {
        void navigate({ to: '/v1/roles/roles/$roleId', params: { roleId: nextRoleId }, replace: true });
        return;
      }

      void navigate({ to: '/v1/roles', replace: true });
    },
  });

  const toolGroups = useMemo(
    () => groupIds(rolesQuery.data?.availableToolIds ?? []),
    [rolesQuery.data?.availableToolIds],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Capabilities"
        title="Roles"
        description="Roles are the single capability layer. They define the tools and workflows each agent can use."
      />

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b border-[color:var(--panel-border)] px-4 py-4">
              <h2 className="text-base font-semibold text-[color:var(--ink)]">Roles</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Select one role to edit identity and permissions.
              </p>
            </div>
            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
              {rolesQuery.isLoading && <PanelLoading label="Loading roles" />}
              {rolesQuery.isError && <PanelError message={rolesQuery.error.message} />}
              {rolesQuery.data?.items.map((role) => (
                <Link
                  key={role.roleId}
                  to="/v1/roles/roles/$roleId"
                  params={{ roleId: role.roleId }}
                  className={cn(
                    'mb-2 block w-full rounded-md border px-4 py-4 text-left transition last:mb-0',
                    input.roleId === role.roleId
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                      : 'border-[color:var(--panel-border)] bg-white hover:border-[color:var(--panel-border-strong)]',
                  )}
                >
                  <div className="truncate font-semibold">{role.name}</div>
                  <div
                    className={cn(
                      'mt-1 text-xs',
                      input.roleId === role.roleId
                        ? 'text-[color:var(--accent)]/80'
                        : 'text-[color:var(--muted)]',
                    )}
                  >
                    {role.assignedAgentCount} assigned agents
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Create role</h3>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createRoleMutation.mutate({
                  name: newRoleDraft.name,
                  description: newRoleDraft.description || undefined,
                });
              }}
            >
              <LabeledField label="Name">
                <Input
                  value={newRoleDraft.name}
                  onChange={(event) => setNewRoleDraft({ ...newRoleDraft, name: event.target.value })}
                  required
                />
              </LabeledField>
              <LabeledField label="Description">
                <Textarea
                  value={newRoleDraft.description}
                  onChange={(event) => setNewRoleDraft({ ...newRoleDraft, description: event.target.value })}
                />
              </LabeledField>
              {createRoleMutation.error && <InlineError message={createRoleMutation.error.message} />}
              <Button type="submit" disabled={createRoleMutation.isPending}>
                {createRoleMutation.isPending ? 'Creating...' : 'Create role'}
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          {selectedRole && selectedRoleDraft ? (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                updateRoleMutation.mutate({
                  roleId: selectedRole.roleId,
                  name: selectedRoleDraft.name,
                  description: selectedRoleDraft.description || null,
                  currentToolIds: selectedRole.toolIds,
                  currentWorkflowIds: selectedRole.workflowIds,
                  nextToolIds: selectedRoleDraft.toolIds,
                  nextWorkflowIds: selectedRoleDraft.workflowIds,
                });
              }}
            >
              <WorkspaceCanvas
                title={selectedRole.name}
                description="Edit identity, then adjust tool and workflow permissions."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label="Assigned agents" value={String(selectedRole.assignedAgentCount)} />
                  <ReadOnlyField label="Tools" value={String(selectedRole.toolIds.length)} />
                  <ReadOnlyField label="Workflows" value={String(selectedRole.workflowIds.length)} />
                  <ReadOnlyField label="Role id" value={selectedRole.roleId} />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Role identity"
                description="Name and description for this role."
              >
                <div className="max-w-3xl space-y-4">
                  <LabeledField label="Role name">
                    <Input
                      value={selectedRoleDraft.name}
                      onChange={(event) =>
                        setRoleDraft({
                          ...selectedRoleDraft,
                          name: event.target.value,
                        })
                      }
                      required
                    />
                  </LabeledField>
                  <LabeledField label="Description">
                    <Textarea
                      value={selectedRoleDraft.description}
                      onChange={(event) =>
                        setRoleDraft({
                          ...selectedRoleDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </LabeledField>
                  {(updateRoleMutation.error || deleteRoleMutation.error) ? (
                    <InlineError
                      message={updateRoleMutation.error?.message ?? deleteRoleMutation.error?.message ?? ''}
                    />
                  ) : null}
                  <div className="flex gap-3">
                    <Button type="submit" disabled={updateRoleMutation.isPending}>
                      {updateRoleMutation.isPending ? 'Saving...' : 'Save role'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteRoleMutation.isPending || selectedRole.assignedAgentCount > 0}
                      onClick={() => {
                        deleteRoleMutation.mutate(selectedRole.roleId);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete role
                    </Button>
                  </div>
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Tool grants"
                description="Tools this role is allowed to use."
              >
                <div className="space-y-4">
                  {Object.entries(toolGroups).map(([group, toolIds]) => (
                    <PermissionGroup key={group} title={group}>
                      {toolIds.map((toolId) => (
                        <PermissionToggle
                          key={toolId}
                          label={toolId}
                          checked={selectedRoleDraft.toolIds.includes(toolId)}
                          pending={updateRoleMutation.isPending}
                          onChange={() => {
                            setRoleDraft({
                              ...selectedRoleDraft,
                              toolIds: selectedRoleDraft.toolIds.includes(toolId)
                                ? selectedRoleDraft.toolIds.filter((id) => id !== toolId)
                                : [...selectedRoleDraft.toolIds, toolId],
                            });
                          }}
                        />
                      ))}
                    </PermissionGroup>
                  ))}
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Workflow grants"
                description="Workflows this role can trigger."
              >
                <PermissionGroup title="workflows">
                  {(rolesQuery.data?.availableWorkflowIds ?? []).map((workflowId) => (
                    <PermissionToggle
                      key={workflowId}
                      label={workflowId}
                      checked={selectedRoleDraft.workflowIds.includes(workflowId)}
                      pending={updateRoleMutation.isPending}
                      onChange={() => {
                        setRoleDraft({
                          ...selectedRoleDraft,
                          workflowIds: selectedRoleDraft.workflowIds.includes(workflowId)
                            ? selectedRoleDraft.workflowIds.filter((id) => id !== workflowId)
                            : [...selectedRoleDraft.workflowIds, workflowId],
                        });
                      }}
                    />
                  ))}
                </PermissionGroup>
              </WorkspaceCanvas>
            </form>
          ) : (
            <WorkspaceCanvas
              title="No role selected"
              description="Create the first role from the left panel, or select one to edit permissions and metadata."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionGroup(input: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <div className="mb-3 text-sm font-medium capitalize text-foreground">{input.title}</div>
      <div className="grid gap-2">{input.children}</div>
    </div>
  );
}

function PermissionToggle(input: {
  label: string;
  checked: boolean;
  pending: boolean;
  onChange(): void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl bg-background px-3 py-2 text-sm text-foreground">
      <input type="checkbox" checked={input.checked} disabled={input.pending} onChange={input.onChange} />
      <code className="rounded bg-muted px-2 py-1 text-xs text-foreground">{input.label}</code>
      {input.pending ? <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-muted-foreground" /> : null}
    </label>
  );
}

function groupIds(ids: string[]) {
  return ids.reduce<Record<string, string[]>>((groups, id) => {
    const group = getGroup(id);
    groups[group] ??= [];
    groups[group].push(id);
    return groups;
  }, {});
}

function getGroup(value: string) {
  if (value.includes('github')) {
    return 'github';
  }

  if (value.includes('coolify')) {
    return 'deployment';
  }

  if (value.includes('schedule')) {
    return 'schedules';
  }

  if (value.includes('company_cash') || value.includes('contract')) {
    return 'finance';
  }

  if (value.includes('agent_role') || value.includes('role_') || value.includes('workflow')) {
    return 'capabilities';
  }

  return 'other';
}

function LabeledField(input: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {input.label}
      </div>
      {input.children}
    </label>
  );
}

function ReadOnlyField(input: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)]">
        {input.label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[color:var(--ink)]">{input.value}</div>
    </div>
  );
}

function InlineError(input: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {input.message}
    </div>
  );
}

function PanelLoading(input: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {input.label}
    </Card>
  );
}

function PanelError(input: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">
      {input.message}
    </Card>
  );
}
