import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import {
  addRoleToolPermission,
  listFunctions,
  listRoles,
  removeRoleToolPermission,
} from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';

export function RolesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/roles' });
  const search = useSearch({ from: '/roles' });

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });

  useEffect(() => {
    if (search.roleId || !rolesQuery.data?.items.length) {
      return;
    }

    void navigate({
      to: '/roles',
      search: {
        roleId: rolesQuery.data.items[0].roleId,
      },
      replace: true,
    });
  }, [navigate, rolesQuery.data, search.roleId]);

  const selectedRole = rolesQuery.data?.items.find((role) => role.roleId === search.roleId) ?? null;

  const addRoleToolMutation = useMutation({
    mutationFn: ({ roleId, toolId }: { roleId: string; toolId: string }) =>
      addRoleToolPermission(roleId, toolId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });
  const removeRoleToolMutation = useMutation({
    mutationFn: ({ roleId, toolId }: { roleId: string; toolId: string }) =>
      removeRoleToolPermission(roleId, toolId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Roles</h2>
          <p className="mt-1 text-sm text-slate-500">
            Roles are read-only here except for custom tool grants.
          </p>
        </div>
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-3">
          {rolesQuery.isLoading && <PanelLoading label="Loading roles" />}
          {rolesQuery.isError && <PanelError message={rolesQuery.error.message} />}
          {rolesQuery.data?.items.map((role) => (
            <button
              key={role.roleId}
              type="button"
              onClick={() => void navigate({ to: '/roles', search: { roleId: role.roleId } })}
              className={cn(
                'mb-2 w-full rounded-2xl border px-4 py-4 text-left transition last:mb-0',
                search.roleId === role.roleId
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white hover:border-slate-400',
              )}
            >
              <div className="font-semibold">{role.name}</div>
              <div
                className={cn(
                  'mt-1 text-xs',
                  search.roleId === role.roleId ? 'text-slate-300' : 'text-slate-500',
                )}
              >
                {role.assignedFunctionCount} function assignments
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  className={cn(
                    search.roleId === role.roleId && 'border-slate-700 bg-slate-800 text-slate-100',
                  )}
                >
                  {role.toolIds.length} tools
                </Badge>
                <Badge
                  className={cn(
                    search.roleId === role.roleId && 'border-slate-700 bg-slate-800 text-slate-100',
                  )}
                >
                  {role.workflowIds.length} workflows
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        {functionsQuery.isLoading && <PanelLoading label="Loading functions" />}
        {functionsQuery.isError && <PanelError message={functionsQuery.error.message} />}
        {selectedRole && rolesQuery.data && functionsQuery.data && (
          <RoleDetailPanel
            role={selectedRole}
            availableToolIds={rolesQuery.data.availableToolIds}
            pendingToolId={
              addRoleToolMutation.variables?.toolId ??
              removeRoleToolMutation.variables?.toolId ??
              null
            }
            onToggleTool={(toolId, enabled) => {
              if (enabled) {
                removeRoleToolMutation.mutate({ roleId: selectedRole.roleId, toolId });
                return;
              }

              addRoleToolMutation.mutate({ roleId: selectedRole.roleId, toolId });
            }}
            mutationError={
              addRoleToolMutation.error?.message ?? removeRoleToolMutation.error?.message ?? null
            }
            functions={functionsQuery.data}
          />
        )}
      </div>
    </div>
  );
}

function RoleDetailPanel(input: {
  role: Awaited<ReturnType<typeof listRoles>>['items'][number];
  availableToolIds: string[];
  pendingToolId: string | null;
  onToggleTool(toolId: string, enabled: boolean): void;
  mutationError: string | null;
  functions: Awaited<ReturnType<typeof listFunctions>>;
}) {
  const groupedTools = groupToolIds(input.availableToolIds);
  const assignedFunctions = input.functions.filter(
    (agentFunction) => agentFunction.roleId === input.role.roleId,
  );

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{input.role.name}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {input.role.description ?? 'No description'}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{input.role.assignedFunctionCount} functions</Badge>
          <Badge>{input.role.workflowIds.length} workflows</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Tool grants
            </div>
            <div className="space-y-3">
              {Object.entries(groupedTools).map(([group, toolIds]) => (
                <div key={group} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 text-sm font-medium capitalize text-slate-900">{group}</div>
                  <div className="grid gap-2">
                    {toolIds.map((toolId) => {
                      const enabled = input.role.toolIds.includes(toolId);

                      return (
                        <label
                          key={toolId}
                          className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={input.pendingToolId === toolId}
                            onChange={() => input.onToggleTool(toolId, enabled)}
                          />
                          <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {toolId}
                          </code>
                          {input.pendingToolId === toolId && (
                            <LoaderCircle className="ml-auto h-4 w-4 animate-spin text-slate-500" />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {input.mutationError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {input.mutationError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Assigned functions
            </div>
            <div className="mt-3 space-y-2">
              {assignedFunctions.map((agentFunction) => (
                <div
                  key={agentFunction.functionId}
                  className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <div className="font-medium text-slate-900">{agentFunction.name}</div>
                  <div className="text-xs text-slate-500">
                    {agentFunction.assignedAgentCount} agents
                  </div>
                </div>
              ))}
              {assignedFunctions.length === 0 && (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-slate-500">
                  No functions assigned to this role.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Workflow grants
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {input.role.workflowIds.map((workflowId) => (
                <Badge key={workflowId}>{workflowId}</Badge>
              ))}
              {input.role.workflowIds.length === 0 && (
                <div className="text-sm text-slate-500">No workflow grants.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function groupToolIds(toolIds: string[]) {
  return toolIds.reduce<Record<string, string[]>>((groups, toolId) => {
    const group = getToolGroup(toolId);
    groups[group] ??= [];
    groups[group].push(toolId);
    return groups;
  }, {});
}

function getToolGroup(toolId: string) {
  if (toolId.includes('github')) {
    return 'github';
  }

  if (toolId.includes('coolify')) {
    return 'deployment';
  }

  if (toolId.includes('schedule')) {
    return 'schedules';
  }

  if (toolId.includes('company_cash') || toolId.includes('contract')) {
    return 'finance';
  }

  if (
    toolId.includes('agent_function') ||
    toolId.includes('agent_role') ||
    toolId.includes('role_') ||
    toolId.includes('workflow')
  ) {
    return 'capabilities';
  }

  return 'other';
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
