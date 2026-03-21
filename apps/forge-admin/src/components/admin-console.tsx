import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  Bot,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  RefreshCcw,
  Shield,
  Siren,
  Zap,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  addRoleToolPermission,
  createSchedule,
  deleteSchedule,
  getAgent,
  getOverview,
  listAgents,
  listFunctions,
  listRoles,
  reloadAgent,
  removeRoleToolPermission,
  updateSchedule,
  wakeAgent,
  type AgentDetail,
  type AgentSchedule,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from '../lib/api';
import { formatDateTime, formatInteger, formatUsd } from '../lib/format';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';

type Screen = 'overview' | 'agents' | 'roles';

type ScheduleDraft = {
  mode: 'create' | 'edit';
  scheduleId?: string;
  name: string;
  description: string;
  scheduleType: 'cron' | 'date';
  cronExpression: string;
  scheduledDate: string;
  timezone: string;
  content: string;
  isActive: boolean;
};

const screenItems: Array<{ id: Screen; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'roles', label: 'Roles', icon: Shield },
];

export function AdminConsole() {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getOverview,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: listAgents,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });
  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });
  const agentDetailQuery = useQuery({
    queryKey: ['admin', 'agent', selectedAgentId],
    queryFn: () => getAgent(selectedAgentId!),
    enabled: Boolean(selectedAgentId),
  });

  useEffect(() => {
    if (!selectedAgentId && agentsQuery.data?.length) {
      setSelectedAgentId(agentsQuery.data[0].agentId);
    }
  }, [agentsQuery.data, selectedAgentId]);

  useEffect(() => {
    if (!selectedRoleId && rolesQuery.data?.items.length) {
      setSelectedRoleId(rolesQuery.data.items[0].roleId);
    }
  }, [rolesQuery.data, selectedRoleId]);

  const selectedRole = useMemo(
    () => rolesQuery.data?.items.find((role) => role.roleId === selectedRoleId) ?? null,
    [rolesQuery.data, selectedRoleId],
  );

  const wakeMutation = useMutation({
    mutationFn: wakeAgent,
    onSuccess: async (_, agentId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] }),
      ]);
    },
  });
  const reloadMutation = useMutation({
    mutationFn: reloadAgent,
    onSuccess: async (_, agentId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] }),
      ]);
    },
  });
  const createScheduleMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
      setScheduleDraft(null);
    },
  });
  const updateScheduleMutation = useMutation({
    mutationFn: updateSchedule,
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
      setScheduleDraft(null);
    },
  });
  const deleteScheduleMutation = useMutation({
    mutationFn: ({ agentId, scheduleId }: { agentId: string; scheduleId: string }) =>
      deleteSchedule(agentId, scheduleId),
    onSuccess: async (_, input) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
      setScheduleDraft(null);
    },
  });
  const addRoleToolMutation = useMutation({
    mutationFn: ({ roleId, toolId }: { roleId: string; toolId: string }) =>
      addRoleToolPermission(roleId, toolId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        selectedAgentId
          ? queryClient.invalidateQueries({ queryKey: ['admin', 'agent', selectedAgentId] })
          : Promise.resolve(),
      ]);
    },
  });
  const removeRoleToolMutation = useMutation({
    mutationFn: ({ roleId, toolId }: { roleId: string; toolId: string }) =>
      removeRoleToolPermission(roleId, toolId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        selectedAgentId
          ? queryClient.invalidateQueries({ queryKey: ['admin', 'agent', selectedAgentId] })
          : Promise.resolve(),
      ]);
    },
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(184,230,218,0.75),_transparent_30%),linear-gradient(180deg,_#f4f1e8_0%,_#ece7db_100%)] text-slate-900">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[28px] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(33,41,51,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-800">
                Forge Admin Console
              </span>
              <div>
                <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
                  Runtime maintenance and visibility
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
                  This UI is intentionally narrow. It exposes runtime state, schedule maintenance,
                  wake and reload controls, and role tool grants.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryChip label="Agents" value={overviewQuery.data?.totals.agents} icon={Bot} />
              <SummaryChip
                label="Loaded"
                value={overviewQuery.data?.totals.loadedAgents}
                icon={Zap}
              />
              <SummaryChip
                label="Running"
                value={overviewQuery.data?.totals.runningAgents}
                icon={Activity}
              />
              <SummaryChip
                label="Cash"
                value={formatUsd(overviewQuery.data?.cash.balanceUsd)}
                icon={CircleDollarSign}
              />
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="space-y-2">
            {screenItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === screen;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition',
                    active
                      ? 'border-slate-950 bg-slate-950 text-white shadow-lg'
                      : 'border-white/70 bg-white/70 text-slate-700 hover:bg-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="space-y-6">
            {screen === 'overview' && (
              <OverviewPanel
                overviewQuery={overviewQuery}
                functionsQuery={functionsQuery}
                rolesQuery={rolesQuery}
              />
            )}

            {screen === 'agents' && (
              <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                <Card className="overflow-hidden">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-semibold text-slate-950">Agents</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Loaded status, function, providers, and runtime state.
                    </p>
                  </div>
                  <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-3">
                    {agentsQuery.isLoading && <PanelLoading label="Loading agents" />}
                    {agentsQuery.isError && <PanelError message={agentsQuery.error.message} />}
                    {agentsQuery.data?.map((agent) => (
                      <button
                        key={agent.agentId}
                        type="button"
                        onClick={() => {
                          setSelectedAgentId(agent.agentId);
                          setScheduleDraft(null);
                        }}
                        className={cn(
                          'mb-2 w-full rounded-2xl border px-4 py-4 text-left transition last:mb-0',
                          selectedAgentId === agent.agentId
                            ? 'border-slate-950 bg-slate-950 text-white'
                            : 'border-slate-200 bg-white hover:border-slate-400',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{agent.name}</div>
                            <div
                              className={cn(
                                'mt-1 text-xs',
                                selectedAgentId === agent.agentId
                                  ? 'text-slate-300'
                                  : 'text-slate-500',
                              )}
                            >
                              {agent.functionName ?? 'No function'}
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              selectedAgentId === agent.agentId &&
                                'border-slate-700 bg-slate-800 text-slate-100',
                            )}
                          >
                            {agent.executionState}
                          </Badge>
                        </div>
                        <div
                          className={cn(
                            'mt-3 flex flex-wrap gap-2 text-xs',
                            selectedAgentId === agent.agentId ? 'text-slate-200' : 'text-slate-600',
                          )}
                        >
                          <span>{agent.loaded ? 'loaded' : 'not loaded'}</span>
                          <span>•</span>
                          <span>{agent.providerTypes.join(', ') || 'no providers'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>

                <div className="space-y-6">
                  {agentDetailQuery.isLoading && <PanelLoading label="Loading agent detail" />}
                  {agentDetailQuery.isError && (
                    <PanelError message={agentDetailQuery.error.message} />
                  )}
                  {agentDetailQuery.data && (
                    <AgentDetailPanel
                      agent={agentDetailQuery.data}
                      onWake={() => wakeMutation.mutate(agentDetailQuery.data.agentId)}
                      onReload={() => reloadMutation.mutate(agentDetailQuery.data.agentId)}
                      wakePending={wakeMutation.isPending}
                      reloadPending={reloadMutation.isPending}
                      onCreateSchedule={() => setScheduleDraft(createEmptyScheduleDraft())}
                      onEditSchedule={(schedule) =>
                        setScheduleDraft(createScheduleDraftFromRecord(schedule))
                      }
                      onDeleteSchedule={(scheduleId) => {
                        deleteScheduleMutation.mutate({
                          agentId: agentDetailQuery.data.agentId,
                          scheduleId,
                        });
                      }}
                      deletingScheduleId={deleteScheduleMutation.variables?.scheduleId}
                    />
                  )}

                  {agentDetailQuery.data && scheduleDraft && (
                    <ScheduleEditorCard
                      draft={scheduleDraft}
                      pending={createScheduleMutation.isPending || updateScheduleMutation.isPending}
                      error={
                        createScheduleMutation.error?.message ??
                        updateScheduleMutation.error?.message ??
                        null
                      }
                      onCancel={() => setScheduleDraft(null)}
                      onChange={setScheduleDraft}
                      onSubmit={(draft) => {
                        if (draft.mode === 'create') {
                          createScheduleMutation.mutate(
                            toCreateScheduleInput(agentDetailQuery.data!.agentId, draft),
                          );
                          return;
                        }

                        updateScheduleMutation.mutate(
                          toUpdateScheduleInput(agentDetailQuery.data!.agentId, draft),
                        );
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {screen === 'roles' && (
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
                        onClick={() => setSelectedRoleId(role.roleId)}
                        className={cn(
                          'mb-2 w-full rounded-2xl border px-4 py-4 text-left transition last:mb-0',
                          selectedRoleId === role.roleId
                            ? 'border-slate-950 bg-slate-950 text-white'
                            : 'border-slate-200 bg-white hover:border-slate-400',
                        )}
                      >
                        <div className="font-semibold">{role.name}</div>
                        <div
                          className={cn(
                            'mt-1 text-xs',
                            selectedRoleId === role.roleId ? 'text-slate-300' : 'text-slate-500',
                          )}
                        >
                          {role.assignedFunctionCount} function assignments
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge
                            className={cn(
                              selectedRoleId === role.roleId &&
                                'border-slate-700 bg-slate-800 text-slate-100',
                            )}
                          >
                            {role.toolIds.length} tools
                          </Badge>
                          <Badge
                            className={cn(
                              selectedRoleId === role.roleId &&
                                'border-slate-700 bg-slate-800 text-slate-100',
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
                  {selectedRole && rolesQuery.data && (
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
                        addRoleToolMutation.error?.message ??
                        removeRoleToolMutation.error?.message ??
                        null
                      }
                      functions={functionsQuery.data ?? []}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel(input: {
  overviewQuery: UseQueryResult<Awaited<ReturnType<typeof getOverview>>, Error>;
  functionsQuery: UseQueryResult<Awaited<ReturnType<typeof listFunctions>>, Error>;
  rolesQuery: UseQueryResult<Awaited<ReturnType<typeof listRoles>>, Error>;
}) {
  if (input.overviewQuery.isLoading) {
    return <PanelLoading label="Loading overview" />;
  }

  if (input.overviewQuery.isError) {
    return <PanelError message={input.overviewQuery.error.message} />;
  }

  const overview = input.overviewQuery.data!;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Agent count"
          value={overview.totals.agents}
          detail={`${overview.totals.loadedAgents} loaded`}
          icon={Bot}
        />
        <MetricCard
          label="Execution"
          value={`${overview.totals.runningAgents} running`}
          detail={`${overview.totals.idleAgents} idle`}
          icon={Zap}
        />
        <MetricCard
          label="Functions / Roles"
          value={`${overview.totals.functions} / ${overview.totals.roles}`}
          detail="Current capability topology"
          icon={Shield}
        />
        <MetricCard
          label="Cash balance"
          value={formatUsd(overview.cash.balanceUsd)}
          detail={`${overview.totals.activeContracts} active contracts`}
          icon={CircleDollarSign}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Cash flow snapshot</h2>
              <p className="mt-1 text-sm text-slate-500">
                Posted and scheduled movements for the current period.
              </p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-slate-500" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Total in" value={formatUsd(overview.cash.summary.totalInUsd)} />
            <MiniMetric label="Total out" value={formatUsd(overview.cash.summary.totalOutUsd)} />
            <MiniMetric label="Net" value={formatUsd(overview.cash.summary.netUsd)} />
            <MiniMetric
              label="Scheduled out"
              value={formatUsd(overview.cash.summary.scheduledOutUsd)}
            />
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {overview.cash.recentMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{movement.type}</div>
                      <div className="text-xs text-slate-500">
                        {movement.description ?? 'No description'}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">{movement.direction}</td>
                    <td className="px-4 py-3">{formatUsd(movement.amountUsd)}</td>
                    <td className="px-4 py-3">
                      {formatDateTime(movement.effectiveAt ?? movement.dueAt ?? movement.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Function map</h2>
              <p className="mt-1 text-sm text-slate-500">
                Read-only summary of functions, attached roles, and agent counts.
              </p>
            </div>
            <Siren className="h-5 w-5 text-slate-500" />
          </div>
          <div className="mt-5 space-y-3">
            {input.functionsQuery.data?.map((agentFunction) => {
              const roleName =
                input.rolesQuery.data?.items.find((role) => role.roleId === agentFunction.roleId)
                  ?.name ?? 'No role';

              return (
                <div
                  key={agentFunction.functionId}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-950">{agentFunction.name}</div>
                      <div className="text-xs text-slate-500">
                        {agentFunction.description ?? 'No description'}
                      </div>
                    </div>
                    <Badge>{agentFunction.assignedAgentCount} agents</Badge>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">Role: {roleName}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

function AgentDetailPanel(input: {
  agent: AgentDetail;
  onWake(): void;
  onReload(): void;
  wakePending: boolean;
  reloadPending: boolean;
  onCreateSchedule(): void;
  onEditSchedule(schedule: AgentSchedule): void;
  onDeleteSchedule(scheduleId: string): void;
  deletingScheduleId?: string;
}) {
  return (
    <>
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-slate-950">{input.agent.name}</h2>
              <Badge>{input.agent.executionState}</Badge>
              <Badge>{input.agent.loaded ? 'loaded' : 'not loaded'}</Badge>
            </div>
            <p className="text-sm text-slate-500">{input.agent.description ?? 'No description'}</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span>Function: {input.agent.function?.name ?? 'No function'}</span>
              <span>•</span>
              <span>Role: {input.agent.function?.roleName ?? 'No role'}</span>
              <span>•</span>
              <span>Model: {input.agent.model}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={input.onWake} disabled={input.wakePending || !input.agent.loaded}>
              {input.wakePending ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Wake
            </Button>
            <Button variant="secondary" onClick={input.onReload} disabled={input.reloadPending}>
              {input.reloadPending ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Reload runtime
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Runner" value={input.agent.runner?.executing ? 'executing' : 'idle'} />
          <MiniMetric
            label="Timer scheduled"
            value={input.agent.runner?.scheduled ? 'yes' : 'no'}
          />
          <MiniMetric
            label="Backoff"
            value={input.agent.runner ? `${Math.round(input.agent.runner.backoffMs / 1000)}s` : '—'}
          />
          <MiniMetric label="Providers" value={formatInteger(input.agent.providers.length)} />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Workspace
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ReadOnlyField
                label="Auto sync"
                value={input.agent.workspace.autoSync ? 'enabled' : 'disabled'}
              />
              <ReadOnlyField
                label="BM25"
                value={input.agent.workspace.bm25 ? 'enabled' : 'disabled'}
              />
              <ReadOnlyField label="Embedder" value={input.agent.workspace.embedder} />
              <ReadOnlyField
                label="Sandbox working dir"
                value={getSandboxWorkingDirectory(input.agent)}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Execution contract
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ReadOnlyField
                label="Weekly budget"
                value={formatUsd(input.agent.activeContract?.weeklyValueUsd)}
              />
              <ReadOnlyField
                label="Ends at"
                value={formatDateTime(input.agent.activeContract?.endsAt)}
              />
              <ReadOnlyField
                label="Auto renew"
                value={input.agent.activeContract?.autoRenew ? 'yes' : 'no'}
              />
              <ReadOnlyField
                label="Providers"
                value={
                  input.agent.providers.map((provider) => provider.providerType).join(', ') || '—'
                }
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Schedules</h2>
            <p className="mt-1 text-sm text-slate-500">
              Agent schedules are editable here. Heartbeat is visible but read-only.
            </p>
          </div>
          <Button variant="secondary" onClick={input.onCreateSchedule}>
            Create schedule
          </Button>
        </div>

        {input.agent.heartbeat && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-medium">
              <Clock3 className="h-4 w-4" />
              Heartbeat
            </div>
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <span>Cron: {input.agent.heartbeat.cronExpression}</span>
              <span>Next: {formatDateTime(input.agent.heartbeat.nextTriggerAt)}</span>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {input.agent.schedules.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No agent schedules.
            </div>
          )}
          {input.agent.schedules.map((schedule) => (
            <div
              key={schedule.scheduleId}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-slate-950">{schedule.name}</div>
                    <Badge>{schedule.scheduleType}</Badge>
                    <Badge>{schedule.isActive ? 'active' : 'inactive'}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {schedule.description ?? 'No description'}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-4">
                    <span>Cron: {schedule.cronExpression ?? '—'}</span>
                    <span>
                      Date: {schedule.scheduledDate ? formatDateTime(schedule.scheduledDate) : '—'}
                    </span>
                    <span>Next: {formatDateTime(schedule.nextTriggerAt)}</span>
                    <span>Last: {formatDateTime(schedule.lastTriggeredAt)}</span>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {schedule.content}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => input.onEditSchedule(schedule)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => input.onDeleteSchedule(schedule.scheduleId)}
                    disabled={input.deletingScheduleId === schedule.scheduleId}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-950">Recent execution steps</h2>
        <p className="mt-1 text-sm text-slate-500">
          Last recorded agent and OM steps from the central ledger.
        </p>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
              {input.agent.recentExecutionSteps.map((step) => (
                <tr key={step.stepId}>
                  <td className="px-4 py-3">{step.kind}</td>
                  <td className="px-4 py-3">{step.modelKey}</td>
                  <td className="px-4 py-3">
                    {formatInteger(step.inputTokens + step.outputTokens)}
                  </td>
                  <td className="px-4 py-3">{formatUsd(step.costUsd)}</td>
                  <td className="px-4 py-3">{formatDateTime(step.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function ScheduleEditorCard(input: {
  draft: ScheduleDraft;
  pending: boolean;
  error: string | null;
  onCancel(): void;
  onChange(draft: ScheduleDraft): void;
  onSubmit(draft: ScheduleDraft): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {input.draft.mode === 'create' ? 'Create schedule' : 'Edit schedule'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Schedules wake the agent later through `agent_notifications`.
          </p>
        </div>
        <Button variant="ghost" onClick={input.onCancel}>
          Close
        </Button>
      </div>
      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(input.draft);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <LabeledField label="Name">
            <Input
              value={input.draft.name}
              onChange={(event) => input.onChange({ ...input.draft, name: event.target.value })}
              required
            />
          </LabeledField>
          <LabeledField label="Timezone">
            <Input
              value={input.draft.timezone}
              onChange={(event) => input.onChange({ ...input.draft, timezone: event.target.value })}
              required
            />
          </LabeledField>
        </div>

        <LabeledField label="Description">
          <Input
            value={input.draft.description}
            onChange={(event) =>
              input.onChange({ ...input.draft, description: event.target.value })
            }
          />
        </LabeledField>

        <div className="grid gap-4 md:grid-cols-2">
          <LabeledField label="Schedule type">
            <Select
              value={input.draft.scheduleType}
              onChange={(event) =>
                input.onChange({
                  ...input.draft,
                  scheduleType: event.target.value as 'cron' | 'date',
                })
              }
            >
              <option value="cron">cron</option>
              <option value="date">date</option>
            </Select>
          </LabeledField>

          {input.draft.mode === 'edit' && (
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={input.draft.isActive}
                onChange={(event) =>
                  input.onChange({ ...input.draft, isActive: event.target.checked })
                }
              />
              Active schedule
            </label>
          )}
        </div>

        {input.draft.scheduleType === 'cron' ? (
          <LabeledField label="Cron expression">
            <Input
              value={input.draft.cronExpression}
              onChange={(event) =>
                input.onChange({ ...input.draft, cronExpression: event.target.value })
              }
              placeholder="0 9 * * 1-5"
              required
            />
          </LabeledField>
        ) : (
          <LabeledField label="Scheduled date">
            <Input
              type="datetime-local"
              value={input.draft.scheduledDate}
              onChange={(event) =>
                input.onChange({ ...input.draft, scheduledDate: event.target.value })
              }
              required
            />
          </LabeledField>
        )}

        <LabeledField label="Content">
          <Textarea
            value={input.draft.content}
            onChange={(event) => input.onChange({ ...input.draft, content: event.target.value })}
            required
          />
        </LabeledField>

        {input.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={input.pending}>
            {input.pending
              ? 'Saving...'
              : input.draft.mode === 'create'
                ? 'Create schedule'
                : 'Save changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={input.onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RoleDetailPanel(input: {
  role: {
    roleId: string;
    name: string;
    description?: string;
    assignedFunctionCount: number;
    toolIds: string[];
    workflowIds: string[];
  };
  availableToolIds: string[];
  pendingToolId: string | null;
  onToggleTool(toolId: string, enabled: boolean): void;
  mutationError: string | null;
  functions: Array<{
    functionId: string;
    name: string;
    description?: string;
    roleId: string | null;
    assignedAgentCount: number;
  }>;
}) {
  const groupedTools = groupToolIds(input.availableToolIds);
  const assignedFunctions = input.functions.filter(
    (agentFunction) => agentFunction.roleId === input.role.roleId,
  );

  return (
    <>
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
                    <div className="mb-3 text-sm font-medium capitalize text-slate-900">
                      {group}
                    </div>
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
    </>
  );
}

function SummaryChip(input: {
  label: string;
  value: string | number | undefined;
  icon: typeof Activity;
}) {
  const Icon = input.icon;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-4 w-4" />
        {input.label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{input.value ?? '—'}</div>
    </div>
  );
}

function MetricCard(input: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
}) {
  const Icon = input.icon;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">{input.label}</div>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{input.value}</div>
      <div className="mt-2 text-sm text-slate-500">{input.detail}</div>
    </Card>
  );
}

function MiniMetric(input: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {input.label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-950">{input.value}</div>
    </div>
  );
}

function ReadOnlyField(input: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {input.label}
      </div>
      <div className="mt-1 text-sm text-slate-900">{input.value}</div>
    </div>
  );
}

function LabeledField(input: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span className="font-medium">{input.label}</span>
      {input.children}
    </label>
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

function createEmptyScheduleDraft(): ScheduleDraft {
  return {
    mode: 'create',
    name: '',
    description: '',
    scheduleType: 'cron',
    cronExpression: '0 9 * * 1-5',
    scheduledDate: '',
    timezone: 'UTC',
    content: '',
    isActive: true,
  };
}

function createScheduleDraftFromRecord(schedule: AgentSchedule): ScheduleDraft {
  return {
    mode: 'edit',
    scheduleId: schedule.scheduleId,
    name: schedule.name,
    description: schedule.description ?? '',
    scheduleType: schedule.scheduleType,
    cronExpression: schedule.cronExpression ?? '',
    scheduledDate: schedule.scheduledDate ? toDateTimeLocalValue(schedule.scheduledDate) : '',
    timezone: schedule.timezone,
    content: schedule.content,
    isActive: schedule.isActive,
  };
}

function toCreateScheduleInput(agentId: string, draft: ScheduleDraft): CreateScheduleInput {
  return {
    agentId,
    name: draft.name,
    description: draft.description || undefined,
    scheduleType: draft.scheduleType,
    cronExpression: draft.scheduleType === 'cron' ? draft.cronExpression : undefined,
    scheduledDate:
      draft.scheduleType === 'date' ? new Date(draft.scheduledDate).toISOString() : undefined,
    timezone: draft.timezone,
    content: draft.content,
  };
}

function toUpdateScheduleInput(agentId: string, draft: ScheduleDraft): UpdateScheduleInput {
  return {
    agentId,
    scheduleId: draft.scheduleId!,
    name: draft.name,
    description: draft.description || null,
    scheduleType: draft.scheduleType,
    cronExpression: draft.scheduleType === 'cron' ? draft.cronExpression : null,
    scheduledDate:
      draft.scheduleType === 'date' ? new Date(draft.scheduledDate).toISOString() : null,
    timezone: draft.timezone,
    content: draft.content,
    isActive: draft.isActive,
  };
}

function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
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

function getSandboxWorkingDirectory(agent: AgentDetail) {
  const sandbox = agent.workspace.sandbox;

  if (!sandbox || typeof sandbox !== 'object') {
    return '—';
  }

  if (!('workingDirectory' in sandbox) || typeof sandbox.workingDirectory !== 'string') {
    return '—';
  }

  return sandbox.workingDirectory;
}
