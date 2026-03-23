import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import {
  addRoleToolPermission,
  addRoleWorkflowPermission,
  addRoleToFunction,
  createFunction,
  createRole,
  deleteFunction,
  deleteRole,
  listFunctions,
  listRoles,
  removeRoleFromFunction,
  removeRoleToolPermission,
  removeRoleWorkflowPermission,
  updateFunction,
  updateRole,
} from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/page-header';
import { SectionNav, WorkspaceCanvas } from '../../components/layout/section-nav';

type RoleDraft = {
  name: string;
  description: string;
  toolIds: string[];
  workflowIds: string[];
};

type FunctionDraft = {
  name: string;
  description: string;
  roleIds: string[];
};

export function RolesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/roles' });
  const search = useSearch({ from: '/roles' });
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [newRoleDraft, setNewRoleDraft] = useState<RoleDraft>({
    name: '',
    description: '',
    toolIds: [],
    workflowIds: [],
  });
  const [functionDrafts, setFunctionDrafts] = useState<Record<string, FunctionDraft>>({});
  const [newFunctionDraft, setNewFunctionDraft] = useState<FunctionDraft>({
    name: '',
    description: '',
    roleIds: [],
  });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });

  useEffect(() => {
    if (search.tab === 'functions') {
      if (search.functionId || !functionsQuery.data?.length) {
        return;
      }

      void navigate({
        to: '/roles',
        search: {
          roleId: search.roleId,
          functionId: functionsQuery.data[0].functionId,
          tab: 'functions',
        },
        replace: true,
      });
      return;
    }

    if (search.roleId || !rolesQuery.data?.items.length) {
      return;
    }

    void navigate({
      to: '/roles',
      search: {
        roleId: rolesQuery.data.items[0].roleId,
        functionId: search.functionId,
        tab: search.tab,
      },
      replace: true,
    });
  }, [functionsQuery.data, navigate, rolesQuery.data, search.functionId, search.roleId, search.tab]);

  const selectedRole = rolesQuery.data?.items.find((role) => role.roleId === search.roleId) ?? null;
  const selectedFunction = functionsQuery.data?.find((item) => item.functionId === search.functionId) ?? null;
  const selectedRoleDraft = selectedRole
    ? roleDraft && selectedRole.roleId === search.roleId
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
      void navigate({
        to: '/roles',
        search: {
          roleId: result.roleId,
          tab: search.tab,
        },
      });
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: async (input: {
      roleId: string;
      name: string;
      description: string | null;
      nextToolIds: string[];
      nextWorkflowIds: string[];
      currentToolIds: string[];
      currentWorkflowIds: string[];
    }) => {
      await updateRole({
        roleId: input.roleId,
        name: input.name,
        description: input.description,
      });

      const toolAdds = input.nextToolIds.filter((toolId) => !input.currentToolIds.includes(toolId));
      const toolRemovals = input.currentToolIds.filter((toolId) => !input.nextToolIds.includes(toolId));
      const workflowAdds = input.nextWorkflowIds.filter(
        (workflowId) => !input.currentWorkflowIds.includes(workflowId),
      );
      const workflowRemovals = input.currentWorkflowIds.filter(
        (workflowId) => !input.nextWorkflowIds.includes(workflowId),
      );

      for (const toolId of toolAdds) {
        await addRoleToolPermission(input.roleId, toolId);
      }

      for (const toolId of toolRemovals) {
        await removeRoleToolPermission(input.roleId, toolId);
      }

      for (const workflowId of workflowAdds) {
        await addRoleWorkflowPermission(input.roleId, workflowId);
      }

      for (const workflowId of workflowRemovals) {
        await removeRoleWorkflowPermission(input.roleId, workflowId);
      }
    },
    onSuccess: async (_, input) => {
      setRoleDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      void navigate({
        to: '/roles',
        search: {
          roleId: input.roleId,
          tab: search.tab,
        },
      });
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
      void navigate({
        to: '/roles',
        search: {
          roleId: nextRoleId,
          tab: search.tab,
        },
        replace: true,
      });
    },
  });
  const createFunctionMutation = useMutation({
    mutationFn: createFunction,
    onSuccess: async () => {
      setNewFunctionDraft({
        name: '',
        description: '',
        roleIds: [],
      });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] });
    },
  });
  const updateFunctionMutation = useMutation({
    mutationFn: async (input: {
      functionId: string;
      name: string;
      description: string | null;
      nextRoleIds: string[];
      currentRoleIds: string[];
    }) => {
      await updateFunction({
        functionId: input.functionId,
        name: input.name,
        description: input.description,
      });

      const roleAdds = input.nextRoleIds.filter((roleId) => !input.currentRoleIds.includes(roleId));
      const roleRemovals = input.currentRoleIds.filter(
        (roleId) => !input.nextRoleIds.includes(roleId),
      );

      for (const roleId of roleAdds) {
        await addRoleToFunction(input.functionId, roleId);
      }

      for (const roleId of roleRemovals) {
        await removeRoleFromFunction(input.functionId, roleId);
      }
    },
    onSuccess: async (_, input) => {
      setFunctionDrafts((current) => {
        const next = { ...current };
        delete next[input.functionId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] });
    },
  });
  const deleteFunctionMutation = useMutation({
    mutationFn: deleteFunction,
    onSuccess: async (_, functionId) => {
      setFunctionDrafts((current) => {
        const next = { ...current };
        delete next[functionId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] });
    },
  });
  const toolGroups = useMemo(
    () => groupIds(rolesQuery.data?.availableToolIds ?? []),
    [rolesQuery.data?.availableToolIds],
  );
  const selectedTab = search.tab ?? 'roles';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Capabilities"
        title="Capability graph"
        description="Roles define permissions. Functions compose roles. Keep one editor open at a time."
      />

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-4">
        <SectionNav
          title="Capability area"
          value={selectedTab}
          items={[
            { value: 'roles', label: 'Roles', detail: `${rolesQuery.data?.items.length ?? 0} role definitions` },
            { value: 'functions', label: 'Functions', detail: `${functionsQuery.data?.length ?? 0} function definitions` },
          ]}
          onChange={(tab) =>
            void navigate({
              to: '/roles',
              search: {
                roleId: tab === 'roles' ? search.roleId : undefined,
                functionId: tab === 'functions' ? search.functionId : undefined,
                tab,
              },
            })
          }
        />

        <Card className="overflow-hidden">
          <div className="border-b border-[color:var(--panel-border)] px-4 py-4">
            <h2 className="text-base font-semibold text-[color:var(--ink)]">
              {selectedTab === 'roles' ? 'Roles' : 'Functions'}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {selectedTab === 'roles'
                ? 'Select one role to edit permissions and metadata.'
                : 'Select one function to edit composition and metadata.'}
            </p>
          </div>
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-3">
            {selectedTab === 'roles' && rolesQuery.isLoading && <PanelLoading label="Loading roles" />}
            {selectedTab === 'roles' && rolesQuery.isError && <PanelError message={rolesQuery.error.message} />}
            {selectedTab === 'roles' && rolesQuery.data?.items.map((role) => (
              <button
                key={role.roleId}
                type="button"
                onClick={() => void navigate({ to: '/roles', search: { roleId: role.roleId, functionId: undefined, tab: 'roles' } })}
                className={cn(
                  'mb-2 w-full rounded-md border px-4 py-4 text-left transition last:mb-0',
                  search.roleId === role.roleId
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-[color:var(--panel-border)] bg-white hover:border-[color:var(--panel-border-strong)]',
                )}
              >
                <div className="font-semibold">{role.name}</div>
                <div className={cn('mt-1 text-xs', search.roleId === role.roleId ? 'text-slate-300' : 'text-[color:var(--muted)]')}>
                  {role.assignedFunctionCount} function assignments
                </div>
              </button>
            ))}
            {selectedTab === 'functions' && functionsQuery.isLoading && <PanelLoading label="Loading functions" />}
            {selectedTab === 'functions' && functionsQuery.isError && <PanelError message={functionsQuery.error.message} />}
            {selectedTab === 'functions' && functionsQuery.data?.map((item) => (
              <button
                key={item.functionId}
                type="button"
                onClick={() => void navigate({ to: '/roles', search: { functionId: item.functionId, roleId: undefined, tab: 'functions' } })}
                className={cn(
                  'mb-2 w-full rounded-md border px-4 py-4 text-left transition last:mb-0',
                  search.functionId === item.functionId
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-[color:var(--panel-border)] bg-white hover:border-[color:var(--panel-border-strong)]',
                )}
              >
                <div className="font-semibold">{item.name}</div>
                <div className={cn('mt-1 text-xs', search.functionId === item.functionId ? 'text-slate-300' : 'text-[color:var(--muted)]')}>
                  {item.roleIds.length} roles
                </div>
              </button>
            ))}
          </div>
        </Card>

        {selectedTab === 'roles' && <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-950">Create role</h3>
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
                onChange={(event) =>
                  setNewRoleDraft({ ...newRoleDraft, name: event.target.value })
                }
                required
              />
            </LabeledField>
            <LabeledField label="Description">
              <Textarea
                value={newRoleDraft.description}
                onChange={(event) =>
                  setNewRoleDraft({ ...newRoleDraft, description: event.target.value })
                }
              />
            </LabeledField>
            {createRoleMutation.error && <InlineError message={createRoleMutation.error.message} />}
            <Button type="submit" disabled={createRoleMutation.isPending}>
              {createRoleMutation.isPending ? 'Creating...' : 'Create role'}
            </Button>
          </form>
        </Card>}
        {selectedTab === 'functions' && <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-950">Create function</h3>
          </div>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createFunctionMutation.mutate({
                name: newFunctionDraft.name,
                description: newFunctionDraft.description || undefined,
              });
            }}
          >
            <LabeledField label="Name">
              <Input
                value={newFunctionDraft.name}
                onChange={(event) => setNewFunctionDraft({ ...newFunctionDraft, name: event.target.value })}
                required
              />
            </LabeledField>
            <LabeledField label="Description">
              <Textarea
                value={newFunctionDraft.description}
                onChange={(event) => setNewFunctionDraft({ ...newFunctionDraft, description: event.target.value })}
              />
            </LabeledField>
            {createFunctionMutation.error ? <InlineError message={createFunctionMutation.error.message} /> : null}
            <Button type="submit" disabled={createFunctionMutation.isPending}>
              {createFunctionMutation.isPending ? 'Creating...' : 'Create function'}
            </Button>
          </form>
        </Card>}
      </div>

      <div className="space-y-6">
        {functionsQuery.isLoading && <PanelLoading label="Loading functions" />}
        {functionsQuery.isError && <PanelError message={functionsQuery.error.message} />}

        {selectedTab === 'roles' && selectedRole && rolesQuery.data && functionsQuery.data && selectedRoleDraft && (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">{selectedRole.name}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Edit the role and manage its tool and workflow grants.
                </p>
              </div>
              <div className="flex gap-2">
                <Badge>{selectedRole.assignedFunctionCount} functions</Badge>
                <Badge>{selectedRole.workflowIds.length} workflows</Badge>
              </div>
            </div>

            <form
              className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]"
              onSubmit={(event) => {
                event.preventDefault();
                updateRoleMutation.mutate({
                  roleId: selectedRole.roleId,
                  name: selectedRoleDraft.name,
                  description: selectedRoleDraft.description || null,
                  nextToolIds: selectedRoleDraft.toolIds,
                  nextWorkflowIds: selectedRoleDraft.workflowIds,
                  currentToolIds: selectedRole.toolIds,
                  currentWorkflowIds: selectedRole.workflowIds,
                });
              }}
            >
              <div className="space-y-4">
                <LabeledField label="Role name">
                  <Input
                    value={selectedRoleDraft.name}
                    onChange={(event) =>
                      setRoleDraft({
                        name: event.target.value,
                        description: selectedRoleDraft.description,
                        toolIds: selectedRoleDraft.toolIds,
                        workflowIds: selectedRoleDraft.workflowIds,
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
                        name: selectedRoleDraft.name,
                        description: event.target.value,
                        toolIds: selectedRoleDraft.toolIds,
                        workflowIds: selectedRoleDraft.workflowIds,
                      })
                    }
                  />
                </LabeledField>
                {(updateRoleMutation.error || deleteRoleMutation.error) && (
                  <InlineError
                    message={updateRoleMutation.error?.message ?? deleteRoleMutation.error?.message ?? ''}
                  />
                )}
                <div className="flex gap-3">
                  <Button type="submit" disabled={updateRoleMutation.isPending}>
                    {updateRoleMutation.isPending ? 'Saving...' : 'Save role'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={deleteRoleMutation.isPending || selectedRole.assignedFunctionCount > 0}
                    onClick={() => {
                      deleteRoleMutation.mutate(selectedRole.roleId);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete role
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Tool grants
                  </div>
                  {Object.entries(toolGroups).map(([group, toolIds]) => (
                    <PermissionGroup key={group} title={group}>
                      {toolIds.map((toolId) => {
                        return (
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
                        );
                      })}
                    </PermissionGroup>
                  ))}
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Workflow grants
                  </div>
                  <PermissionGroup title="workflows">
                    {rolesQuery.data.availableWorkflowIds.map((workflowId) => {
                      return (
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
                      );
                    })}
                  </PermissionGroup>
                </div>
              </div>
            </form>
          </Card>
        )}

        {selectedTab === 'functions' && functionsQuery.data && rolesQuery.data && selectedFunction && (
          <WorkspaceCanvas
            title={selectedFunction.name}
            description="Edit metadata and choose which roles compose this function."
          >
            {(() => {
              const draft = functionDrafts[selectedFunction.functionId] ?? {
                name: selectedFunction.name,
                description: selectedFunction.description ?? '',
                roleIds: selectedFunction.roleIds,
              };

              return (
                <form
                  className="space-y-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateFunctionMutation.mutate({
                      functionId: selectedFunction.functionId,
                      name: draft.name,
                      description: draft.description || null,
                      nextRoleIds: draft.roleIds,
                      currentRoleIds: selectedFunction.roleIds,
                    });
                  }}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LabeledField label="Function name">
                      <Input
                        value={draft.name}
                        onChange={(event) =>
                          setFunctionDrafts({
                            ...functionDrafts,
                            [selectedFunction.functionId]: {
                              ...draft,
                              name: event.target.value,
                            },
                          })
                        }
                      />
                    </LabeledField>
                    <LabeledField label="Description">
                      <Input
                        value={draft.description}
                        onChange={(event) =>
                          setFunctionDrafts({
                            ...functionDrafts,
                            [selectedFunction.functionId]: {
                              ...draft,
                              description: event.target.value,
                            },
                          })
                        }
                      />
                    </LabeledField>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
                    <Badge>{selectedFunction.assignedAgentCount} agents</Badge>
                    <Badge>{selectedFunction.roleIds.length} roles</Badge>
                  </div>

                  <LabeledField label="Roles">
                    <div className="grid gap-2 rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 md:grid-cols-2">
                      {rolesQuery.data.items.map((role) => (
                        <PermissionToggle
                          key={role.roleId}
                          label={role.name}
                          checked={draft.roleIds.includes(role.roleId)}
                          pending={updateFunctionMutation.isPending}
                          onChange={() => {
                            setFunctionDrafts({
                              ...functionDrafts,
                              [selectedFunction.functionId]: {
                                ...draft,
                                roleIds: draft.roleIds.includes(role.roleId)
                                  ? draft.roleIds.filter((id) => id !== role.roleId)
                                  : [...draft.roleIds, role.roleId],
                              },
                            });
                          }}
                        />
                      ))}
                    </div>
                  </LabeledField>

                  {(updateFunctionMutation.error || deleteFunctionMutation.error) ? (
                    <InlineError
                      message={updateFunctionMutation.error?.message ?? deleteFunctionMutation.error?.message ?? ''}
                    />
                  ) : null}

                  <div className="flex gap-3">
                    <Button type="submit" disabled={updateFunctionMutation.isPending}>
                      {updateFunctionMutation.isPending ? 'Saving...' : 'Save function'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteFunctionMutation.isPending || selectedFunction.assignedAgentCount > 0}
                      onClick={() => {
                        deleteFunctionMutation.mutate(selectedFunction.functionId);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete function
                    </Button>
                  </div>
                </form>
              );
            })()}
          </WorkspaceCanvas>
        )}
      </div>
      </div>
    </div>
  );
}

function PermissionGroup(input: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-sm font-medium capitalize text-slate-900">{input.title}</div>
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
    <label className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
      <input type="checkbox" checked={input.checked} disabled={input.pending} onChange={input.onChange} />
      <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{input.label}</code>
      {input.pending ? <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-slate-500" /> : null}
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

  if (
    value.includes('agent_function') ||
    value.includes('agent_role') ||
    value.includes('role_') ||
    value.includes('workflow')
  ) {
    return 'capabilities';
  }

  return 'other';
}

function LabeledField(input: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {input.label}
      </div>
      {input.children}
    </label>
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
    <Card className="flex items-center gap-3 p-6 text-sm text-slate-600">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {input.label}
    </Card>
  );
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}
