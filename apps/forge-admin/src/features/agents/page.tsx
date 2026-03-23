import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Clock3, LoaderCircle, RefreshCcw, Trash2, UserPlus, Zap } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import {
  changeAgentFunction,
  createSchedule,
  deleteAgentProvider,
  deleteSchedule,
  getAgent,
  hireAgent,
  listAgents,
  listFunctions,
  reloadAgent,
  terminateAgent,
  updateAgentConfig,
  updateSchedule,
  upsertAgentProvider,
  wakeAgent,
  type AgentFunction,
  type AgentSchedule,
  type CreateScheduleInput,
  type HireAgentResult,
  type AgentDetail,
  type UpdateScheduleInput,
} from '../../lib/api';
import { formatDateTime, formatInteger, formatUsd, formatUsdPrecise } from '../../lib/format';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';

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

type HireAgentDraft = {
  hiringRequest: string;
  additionalContext: string;
  weeklyBudgetUsd: string;
};

type AgentConfigDraft = {
  name: string;
  description: string;
  instructions: string;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
  workspaceEmbedder: string;
};

type ProviderDraft = {
  providerType: 'discord' | 'email';
  credentialsText: string;
};

export function AgentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/agents' });
  const search = useSearch({ from: '/agents' });
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [hireDraft, setHireDraft] = useState<HireAgentDraft>({
    hiringRequest: '',
    additionalContext: '',
    weeklyBudgetUsd: '25',
  });
  const [hireResult, setHireResult] = useState<HireAgentResult | null>(null);
  const [functionDraft, setFunctionDraft] = useState<{
    agentId: string;
    functionId: string;
  } | null>(null);
  const [configDraft, setConfigDraft] = useState<{
    agentId: string;
    value: AgentConfigDraft;
  } | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [newProviderDraft, setNewProviderDraft] = useState<ProviderDraft>({
    providerType: 'discord',
    credentialsText: '{\n  "token": "",\n  "allowedChannelIds": [],\n  "respondToMentionsOnly": false\n}',
  });

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: listAgents,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });
  const agentDetailQuery = useQuery({
    queryKey: ['admin', 'agent', search.agentId],
    queryFn: () => getAgent(search.agentId!),
    enabled: Boolean(search.agentId),
  });

  useEffect(() => {
    if (search.agentId || !agentsQuery.data?.length) {
      return;
    }

    void navigate({
      to: '/agents',
      search: {
        agentId: agentsQuery.data[0].agentId,
      },
      replace: true,
    });
  }, [agentsQuery.data, navigate, search.agentId]);

  const selectedAgentFunctionId =
    agentDetailQuery.data && functionDraft?.agentId === agentDetailQuery.data.agentId
      ? functionDraft.functionId
      : (agentDetailQuery.data?.function?.functionId ?? '');
  const selectedAgentConfig =
    agentDetailQuery.data && configDraft?.agentId === agentDetailQuery.data.agentId
      ? configDraft.value
      : (agentDetailQuery.data ? createAgentConfigDraft(agentDetailQuery.data) : null);

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
  const hireMutation = useMutation({
    mutationFn: hireAgent,
    onSuccess: async (result) => {
      setHireResult(result);
      setHireDraft({
        hiringRequest: '',
        additionalContext: '',
        weeklyBudgetUsd: '25',
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] }),
      ]);

      void navigate({
        to: '/agents',
        search: {
          agentId: result.agentId,
        },
      });
    },
  });
  const changeFunctionMutation = useMutation({
    mutationFn: ({ agentId, functionId }: { agentId: string; functionId: string }) =>
      changeAgentFunction(agentId, functionId),
    onSuccess: async (_, input) => {
      setFunctionDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] }),
      ]);
    },
  });
  const terminateMutation = useMutation({
    mutationFn: terminateAgent,
    onSuccess: async ({ agentId }) => {
      setScheduleDraft(null);
      setFunctionDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'functions'] }),
        queryClient.removeQueries({ queryKey: ['admin', 'agent', agentId] }),
      ]);

      const remainingAgents = await queryClient.fetchQuery({
        queryKey: ['admin', 'agents'],
        queryFn: listAgents,
      });

      void navigate({
        to: '/agents',
        search: {
          agentId: remainingAgents[0]?.agentId,
        },
        replace: true,
      });
    },
  });
  const updateConfigMutation = useMutation({
    mutationFn: updateAgentConfig,
    onSuccess: async (_, input) => {
      setConfigDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] }),
      ]);
    },
  });
  const upsertProviderMutation = useMutation({
    mutationFn: async (input: {
      agentId: string;
      providerType: 'discord' | 'email';
      credentialsText: string;
    }) =>
      upsertAgentProvider({
        agentId: input.agentId,
        providerType: input.providerType,
        credentials: JSON.parse(input.credentialsText) as unknown,
      }),
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] }),
      ]);
    },
  });
  const deleteProviderMutation = useMutation({
    mutationFn: ({ agentId, providerType }: { agentId: string; providerType: 'discord' | 'email' }) =>
      deleteAgentProvider(agentId, providerType),
    onSuccess: async (_, input) => {
      setProviderDrafts((current) => {
        const next = { ...current };
        delete next[buildProviderDraftKey(input.agentId, input.providerType)];
        return next;
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] }),
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

  return (
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
                setScheduleDraft(null);
                void navigate({
                  to: '/agents',
                  search: { agentId: agent.agentId },
                });
              }}
              className={cn(
                'mb-2 w-full rounded-2xl border px-4 py-4 text-left transition last:mb-0',
                search.agentId === agent.agentId
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
                      search.agentId === agent.agentId ? 'text-slate-300' : 'text-slate-500',
                    )}
                  >
                    {agent.functionName ?? 'No function'}
                  </div>
                </div>
                <Badge
                  className={cn(
                    search.agentId === agent.agentId &&
                      'border-slate-700 bg-slate-800 text-slate-100',
                  )}
                >
                  {agent.executionState}
                </Badge>
              </div>
              <div
                className={cn(
                  'mt-3 flex flex-wrap gap-2 text-xs',
                  search.agentId === agent.agentId ? 'text-slate-200' : 'text-slate-600',
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
        <HireAgentCard
          draft={hireDraft}
          pending={hireMutation.isPending}
          error={hireMutation.error?.message ?? null}
          result={hireResult}
          onChange={setHireDraft}
          onSubmit={(draft) => {
            hireMutation.mutate({
              hiringRequest: draft.hiringRequest,
              additionalContext: draft.additionalContext || undefined,
              weeklyBudgetUsd: Number(draft.weeklyBudgetUsd),
            });
          }}
        />
        {agentDetailQuery.isLoading && <PanelLoading label="Loading agent detail" />}
        {agentDetailQuery.isError && <PanelError message={agentDetailQuery.error.message} />}
        {functionsQuery.isError && <PanelError message={functionsQuery.error.message} />}
        {agentDetailQuery.data && (
          <>
            <AgentHeader
              agent={agentDetailQuery.data}
              onWake={() => wakeMutation.mutate(agentDetailQuery.data!.agentId)}
              onReload={() => reloadMutation.mutate(agentDetailQuery.data!.agentId)}
              wakePending={wakeMutation.isPending}
              reloadPending={reloadMutation.isPending}
            />
            {functionsQuery.data && (
              <AgentMaintenanceCard
                agent={agentDetailQuery.data}
                functions={functionsQuery.data}
                selectedFunctionId={selectedAgentFunctionId}
                onSelectedFunctionIdChange={(functionId) => {
                  if (!agentDetailQuery.data) {
                    return;
                  }

                  setFunctionDraft({
                    agentId: agentDetailQuery.data.agentId,
                    functionId,
                  });
                }}
                onApplyFunctionChange={() =>
                  changeFunctionMutation.mutate({
                    agentId: agentDetailQuery.data!.agentId,
                    functionId: selectedAgentFunctionId,
                  })
                }
                functionPending={changeFunctionMutation.isPending}
                functionError={changeFunctionMutation.error?.message ?? null}
                onTerminate={() => terminateMutation.mutate(agentDetailQuery.data!.agentId)}
                terminatePending={terminateMutation.isPending}
                terminateError={terminateMutation.error?.message ?? null}
              />
            )}
            <GitHubProvisioningCard provisioning={agentDetailQuery.data.githubProvisioning} />
            {selectedAgentConfig && (
              <AgentConfigurationCard
                draft={selectedAgentConfig}
                pending={updateConfigMutation.isPending}
                error={updateConfigMutation.error?.message ?? null}
                onChange={(draft) => {
                  if (!agentDetailQuery.data) {
                    return;
                  }

                  setConfigDraft({
                    agentId: agentDetailQuery.data.agentId,
                    value: draft,
                  });
                }}
                onSubmit={(draft) =>
                  updateConfigMutation.mutate({
                    agentId: agentDetailQuery.data!.agentId,
                    name: draft.name,
                    description: draft.description || null,
                    instructions: draft.instructions,
                    workspaceAutoSync: draft.workspaceAutoSync,
                    workspaceBm25: draft.workspaceBm25,
                    workspaceEmbedder: draft.workspaceEmbedder,
                  })
                }
              />
            )}
            <AgentProvidersCard
              agent={agentDetailQuery.data}
              draftByKey={providerDrafts}
              newProviderDraft={newProviderDraft}
              onChangeProviderDraft={(providerType, credentialsText) => {
                const agentId = agentDetailQuery.data!.agentId;
                const key = buildProviderDraftKey(agentId, providerType);

                setProviderDrafts((current) => ({
                  ...current,
                  [key]: {
                    providerType,
                    credentialsText,
                  },
                }));
              }}
              onChangeNewProviderDraft={setNewProviderDraft}
              onSaveProvider={(providerType, credentialsText) =>
                upsertProviderMutation.mutate({
                  agentId: agentDetailQuery.data!.agentId,
                  providerType,
                  credentialsText,
                })
              }
              onDeleteProvider={(providerType) =>
                deleteProviderMutation.mutate({
                  agentId: agentDetailQuery.data!.agentId,
                  providerType,
                })
              }
              onCreateProvider={() =>
                upsertProviderMutation.mutate({
                  agentId: agentDetailQuery.data!.agentId,
                  providerType: newProviderDraft.providerType,
                  credentialsText: newProviderDraft.credentialsText,
                })
              }
              pendingProviderType={
                upsertProviderMutation.variables?.providerType ??
                deleteProviderMutation.variables?.providerType ??
                null
              }
              error={
                upsertProviderMutation.error?.message ?? deleteProviderMutation.error?.message ?? null
              }
            />
            <AgentThreadCard messages={agentDetailQuery.data.recentThreadMessages} />
            <AgentInboxCard
              notifications={agentDetailQuery.data.recentNotifications}
              conversations={agentDetailQuery.data.recentConversations}
            />
            <SchedulesCard
              schedules={agentDetailQuery.data.schedules}
              heartbeat={agentDetailQuery.data.heartbeat}
              onCreateSchedule={() => setScheduleDraft(createEmptyScheduleDraft())}
              onEditSchedule={(schedule) =>
                setScheduleDraft(createScheduleDraftFromRecord(schedule))
              }
              onDeleteSchedule={(scheduleId) =>
                deleteScheduleMutation.mutate({
                  agentId: agentDetailQuery.data!.agentId,
                  scheduleId,
                })
              }
              deletingScheduleId={deleteScheduleMutation.variables?.scheduleId}
            />
            {scheduleDraft && (
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
            <ExecutionCard agent={agentDetailQuery.data} />
          </>
        )}
      </div>
    </div>
  );
}

function HireAgentCard(input: {
  draft: HireAgentDraft;
  pending: boolean;
  error: string | null;
  result: HireAgentResult | null;
  onChange(draft: HireAgentDraft): void;
  onSubmit(draft: HireAgentDraft): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Hire agent</h2>
          <p className="mt-1 text-sm text-slate-500">
            Creates the agent, mailbox, execution contract, heartbeat, and GitHub app runtime.
          </p>
        </div>
        <UserPlus className="h-5 w-5 text-slate-500" />
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(input.draft);
        }}
      >
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <LabeledField label="Hiring request">
            <Textarea
              value={input.draft.hiringRequest}
              onChange={(event) =>
                input.onChange({ ...input.draft, hiringRequest: event.target.value })
              }
              placeholder="Describe the kind of collaborator you need, expected responsibilities, context, and desired profile."
              required
            />
          </LabeledField>
          <LabeledField label="Weekly budget (USD)">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={input.draft.weeklyBudgetUsd}
              onChange={(event) =>
                input.onChange({ ...input.draft, weeklyBudgetUsd: event.target.value })
              }
              required
            />
          </LabeledField>
        </div>

        <LabeledField label="Additional context">
          <Textarea
            value={input.draft.additionalContext}
            onChange={(event) =>
              input.onChange({ ...input.draft, additionalContext: event.target.value })
            }
            placeholder="Short operating context for the hiring workflow."
          />
        </LabeledField>

        {input.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}

        {input.result && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div>Agent created: {input.result.agentId}</div>
            {input.result.emailAddress ? <div>Email: {input.result.emailAddress}</div> : null}
            <a
              href={input.result.githubAppRegistrationUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline"
            >
              Open GitHub App registration
            </a>
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={input.pending}>
            {input.pending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Hiring...
              </>
            ) : (
              'Hire agent'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AgentHeader(input: {
  agent: Awaited<ReturnType<typeof getAgent>>;
  onWake(): void;
  onReload(): void;
  wakePending: boolean;
  reloadPending: boolean;
}) {
  const agent = input.agent!;

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-slate-950">{agent.name}</h2>
            <Badge>{agent.executionState}</Badge>
            <Badge>{agent.loaded ? 'loaded' : 'not loaded'}</Badge>
          </div>
          <p className="text-sm text-slate-500">{agent.description ?? 'No description'}</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span>Function: {agent.function?.name ?? 'No function'}</span>
            <span>•</span>
            <span>Roles: {agent.function?.roles.map((role) => role.name).join(', ') || 'No roles'}</span>
            <span>•</span>
            <span>Profile: {formatAgentProfile(agent.modelProfile)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={input.onWake} disabled={input.wakePending || !agent.loaded}>
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

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label="Runner" value={agent.runner?.executing ? 'executing' : 'idle'} />
        <MiniMetric label="Wake pending" value={agent.runner?.wake.pending ? 'yes' : 'no'} />
        <MiniMetric
          label="Next step"
          value={agent.runner?.nextStepAt ? formatDateTime(agent.runner.nextStepAt) : '—'}
        />
        <MiniMetric
          label="Step interval"
          value={agent.runner?.estimatedDelayMs != null ? `${Math.round(agent.runner.estimatedDelayMs / 1000)}s` : '—'}
        />
        <MiniMetric label="Providers" value={formatInteger(agent.providers.length)} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Workspace
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Auto sync"
              value={agent.workspace.autoSync ? 'enabled' : 'disabled'}
            />
            <ReadOnlyField label="BM25" value={agent.workspace.bm25 ? 'enabled' : 'disabled'} />
            <ReadOnlyField label="Embedder" value={agent.workspace.embedder} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Execution contract
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Weekly budget"
              value={formatUsd(agent.activeContract?.weeklyValueUsd)}
            />
            <ReadOnlyField
              label="Spent"
              value={agent.activeContract ? `${formatUsdPrecise(agent.activeContract.spentUsd)} (${agent.activeContract.spentPercent.toFixed(1)}%)` : '—'}
            />
            <ReadOnlyField label="Ends at" value={formatDateTime(agent.activeContract?.endsAt)} />
            <ReadOnlyField
              label="Auto renew"
              value={agent.activeContract?.autoRenew ? 'yes' : 'no'}
            />
            <ReadOnlyField
              label="Wake queued for"
              value={agent.runner?.wake.nextTriggerAt ? formatDateTime(agent.runner.wake.nextTriggerAt) : '—'}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function AgentMaintenanceCard(input: {
  agent: Awaited<ReturnType<typeof getAgent>>;
  functions: AgentFunction[];
  selectedFunctionId: string;
  onSelectedFunctionIdChange(functionId: string): void;
  onApplyFunctionChange(): void;
  functionPending: boolean;
  functionError: string | null;
  onTerminate(): void;
  terminatePending: boolean;
  terminateError: string | null;
}) {
  const currentFunctionId = input.agent?.function?.functionId ?? '';

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-950">Agent maintenance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Human-facing adjustments only. Functions stay read-only here except for reassignment on
            the selected agent.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <LabeledField label="Assigned function">
              <Select
                value={input.selectedFunctionId}
                onChange={(event) => input.onSelectedFunctionIdChange(event.target.value)}
              >
                <option value="" disabled>
                  Select function
                </option>
                {input.functions.map((agentFunction) => (
                  <option key={agentFunction.functionId} value={agentFunction.functionId}>
                    {agentFunction.name}
                  </option>
                ))}
              </Select>
            </LabeledField>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={input.onApplyFunctionChange}
                disabled={
                  input.functionPending ||
                  !input.selectedFunctionId ||
                  input.selectedFunctionId === currentFunctionId
                }
              >
                {input.functionPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply function'
                )}
              </Button>
            </div>
          </div>

          {input.functionError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {input.functionError}
            </div>
          )}
        </div>

        <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-4 xl:max-w-sm">
          <div className="text-sm font-semibold text-red-800">Terminate agent</div>
          <p className="mt-2 text-sm text-red-700">
            Removes runtime, schedules, mailbox, GitHub app installation, database record, and the
            workspace directory.
          </p>
          {input.terminateError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
              {input.terminateError}
            </div>
          )}
          <Button
            className="mt-4 w-full"
            variant="danger"
            onClick={input.onTerminate}
            disabled={input.terminatePending}
          >
            {input.terminatePending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Terminating...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Terminate agent
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AgentConfigurationCard(input: {
  draft: AgentConfigDraft;
  pending: boolean;
  error: string | null;
  onChange(draft: AgentConfigDraft): void;
  onSubmit(draft: AgentConfigDraft): void;
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Agent runtime config</h2>
        <p className="mt-1 text-sm text-slate-500">
          Updates the stored agent record and reloads the runtime if the agent is loaded.
        </p>
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
          <LabeledField label="Workspace embedder">
            <Input
              value={input.draft.workspaceEmbedder}
              onChange={(event) =>
                input.onChange({ ...input.draft, workspaceEmbedder: event.target.value })
              }
              required
            />
          </LabeledField>
        </div>

        <LabeledField label="Description">
          <Textarea
            value={input.draft.description}
            onChange={(event) =>
              input.onChange({ ...input.draft, description: event.target.value })
            }
          />
        </LabeledField>

        <LabeledField label="Agent instructions">
          <Textarea
            className="min-h-56"
            value={input.draft.instructions}
            onChange={(event) =>
              input.onChange({ ...input.draft, instructions: event.target.value })
            }
            required
          />
        </LabeledField>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={input.draft.workspaceAutoSync}
              onChange={(event) =>
                input.onChange({ ...input.draft, workspaceAutoSync: event.target.checked })
              }
            />
            Workspace auto sync
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={input.draft.workspaceBm25}
              onChange={(event) =>
                input.onChange({ ...input.draft, workspaceBm25: event.target.checked })
              }
            />
            BM25 retrieval
          </label>
        </div>

        {input.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={input.pending}>
            {input.pending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save config'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function GitHubProvisioningCard(input: {
  provisioning: AgentDetail['githubProvisioning'];
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">GitHub provisioning</h2>
        <p className="mt-1 text-sm text-slate-500">
          Hiring starts the GitHub App registration flow. The app only exists in GitHub after the
          registration URL is opened and completed.
        </p>
      </div>

      {!input.provisioning ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          No GitHub app provisioning exists for this agent.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ReadOnlyField label="Status" value={input.provisioning.status} />
            <ReadOnlyField
              label="Registration URL"
              value={input.provisioning.registrationUrl}
              wrap
            />
            <ReadOnlyField
              label="Install URL"
              value={input.provisioning.installUrl ?? '—'}
              wrap
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={input.provisioning.registrationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
            >
              Open registration
            </a>
            {input.provisioning.installUrl ? (
              <a
                href={input.provisioning.installUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-950 bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Open install
              </a>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

function AgentProvidersCard(input: {
  agent: AgentDetail;
  draftByKey: Record<string, ProviderDraft>;
  newProviderDraft: ProviderDraft;
  onChangeProviderDraft(providerType: 'discord' | 'email', credentialsText: string): void;
  onChangeNewProviderDraft(draft: ProviderDraft): void;
  onSaveProvider(providerType: 'discord' | 'email', credentialsText: string): void;
  onDeleteProvider(providerType: 'discord' | 'email'): void;
  onCreateProvider(): void;
  pendingProviderType: string | null;
  error: string | null;
}) {
  const editableProviders = input.agent.providers.filter(
    (provider): provider is AgentDetail['providers'][number] & {
      providerType: 'discord' | 'email';
    } => provider.editable && (provider.providerType === 'discord' || provider.providerType === 'email'),
  );

  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Providers</h2>
        <p className="mt-1 text-sm text-slate-500">
          External provider credentials are editable here. Internal chat remains system-managed.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {input.agent.providers.map((provider) => {
          const editableProviderType =
            provider.providerType === 'discord' || provider.providerType === 'email'
              ? provider.providerType
              : null;
          const key =
            editableProviderType
              ? buildProviderDraftKey(input.agent.agentId, editableProviderType)
              : null;
          const draft =
            key && input.draftByKey[key]
              ? input.draftByKey[key]
              : {
                  providerType: editableProviderType ?? 'discord',
                  credentialsText: toPrettyJson(provider.credentials),
                };

          return (
            <div key={provider.providerType} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-950">{provider.providerType}</div>
                  <div className="text-xs text-slate-500">
                    Created at {formatDateTime(provider.createdAt)}
                  </div>
                </div>
                <Badge>{provider.editable ? 'editable' : 'read-only'}</Badge>
              </div>

              {provider.editable && editableProviderType ? (
                <>
                  <Textarea
                    className="mt-4 min-h-44 font-mono text-xs"
                    value={draft.credentialsText}
                    onChange={(event) => input.onChangeProviderDraft(editableProviderType, event.target.value)}
                  />
                  <div className="mt-3 flex gap-3">
                    <Button
                      variant="secondary"
                      disabled={input.pendingProviderType === editableProviderType}
                      onClick={() => input.onSaveProvider(editableProviderType, draft.credentialsText)}
                    >
                      Save provider
                    </Button>
                    <Button
                      variant="danger"
                      disabled={input.pendingProviderType === editableProviderType}
                      onClick={() => input.onDeleteProvider(editableProviderType)}
                    >
                      Delete provider
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-slate-500">
                  This provider is not editable from the admin console.
                </div>
              )}
            </div>
          );
        })}

        {editableProviders.length < 2 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="text-sm font-medium text-slate-900">Add provider</div>
            <div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <LabeledField label="Provider type">
                <Select
                  value={input.newProviderDraft.providerType}
                  onChange={(event) =>
                    input.onChangeNewProviderDraft({
                      providerType: event.target.value as 'discord' | 'email',
                      credentialsText: createProviderTemplate(
                        event.target.value as 'discord' | 'email',
                      ),
                    })
                  }
                >
                  <option value="discord">discord</option>
                  <option value="email">email</option>
                </Select>
              </LabeledField>
              <LabeledField label="Credentials JSON">
                <Textarea
                  className="min-h-44 font-mono text-xs"
                  value={input.newProviderDraft.credentialsText}
                  onChange={(event) =>
                    input.onChangeNewProviderDraft({
                      ...input.newProviderDraft,
                      credentialsText: event.target.value,
                    })
                  }
                />
              </LabeledField>
            </div>
            <div className="mt-4">
              <Button
                variant="secondary"
                disabled={input.pendingProviderType === input.newProviderDraft.providerType}
                onClick={input.onCreateProvider}
              >
                Add provider
              </Button>
            </div>
          </div>
        )}

        {input.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}
      </div>
    </Card>
  );
}

function AgentInboxCard(input: {
  notifications: AgentDetail['recentNotifications'];
  conversations: AgentDetail['recentConversations'];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recent notifications</h2>
          <p className="mt-1 text-sm text-slate-500">
            Latest notifications recorded in the central Forge database.
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {input.notifications.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No notifications for this agent.
            </div>
          )}
          {input.notifications.map((notification) => (
            <div key={notification.notificationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge>{notification.read ? 'read' : 'unread'}</Badge>
                <div className="text-xs text-slate-500">{formatDateTime(notification.timestamp)}</div>
              </div>
              <div className="mt-3 text-sm text-slate-700">{notification.content}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recent conversations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Read-only communication preview from the selected agent workspace database.
          </p>
        </div>
        <div className="mt-5 space-y-4">
          {input.conversations.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No conversations for this agent.
            </div>
          )}
          {input.conversations.map((conversation) => (
            <div
              key={conversation.conversationId}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-slate-950">
                  {conversation.name ?? conversation.contactDisplayName ?? conversation.contactSlug ?? 'Conversation'}
                </div>
                <Badge>{conversation.provider}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Updated at {formatDateTimeText(conversation.updatedAt)}
              </div>
              <div className="mt-4 space-y-3">
                {conversation.messages.map((message) => (
                  <div key={message.messageId} className="rounded-xl bg-white px-3 py-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">
                        {message.authorDisplayName ?? 'Unknown author'}
                      </div>
                      <div className="flex items-center gap-2">
                        {message.unread && <Badge>unread</Badge>}
                        <span className="text-xs text-slate-500">
                          {formatDateTimeText(message.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap">{message.content}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AgentThreadCard(input: {
  messages: AgentDetail['recentThreadMessages'];
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Recent thread messages</h2>
        <p className="mt-1 text-sm text-slate-500">
          Latest messages persisted in the agent memory thread. Useful to inspect wake prompts,
          assistant replies, and tool-driven flow.
        </p>
      </div>
      <div className="mt-5 space-y-3">
        {input.messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
            No thread messages for this agent.
          </div>
        )}
        {input.messages.map((message) => (
          <div key={message.messageId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge>{message.role}</Badge>
                {message.type && <Badge>{message.type}</Badge>}
              </div>
              <div className="text-xs text-slate-500">{formatDateTime(message.createdAt)}</div>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
              {message.content || '—'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SchedulesCard(input: {
  schedules: AgentSchedule[];
  heartbeat: AgentSchedule | null;
  onCreateSchedule(): void;
  onEditSchedule(schedule: AgentSchedule): void;
  onDeleteSchedule(scheduleId: string): void;
  deletingScheduleId?: string;
}) {
  return (
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

      {input.heartbeat && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <Clock3 className="h-4 w-4" />
            Heartbeat
          </div>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <span>Cron: {input.heartbeat.cronExpression}</span>
            <span>Next: {formatDateTime(input.heartbeat.nextTriggerAt)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {input.schedules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
            No agent schedules.
          </div>
        )}
        {input.schedules.map((schedule) => (
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

function ExecutionCard(input: { agent: Awaited<ReturnType<typeof getAgent>> }) {
  const agent = input.agent!;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recent execution steps</h2>
          <p className="mt-1 text-sm text-slate-500">
            Last recorded agent and OM steps from the central ledger.
          </p>
        </div>
        <Bot className="h-5 w-5 text-slate-500" />
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-4">
          <ReadOnlyField label="Contract value" value={formatUsd(agent.activeContract?.weeklyValueUsd)} />
          <ReadOnlyField
            label="Used"
            value={agent.activeContract ? `${formatUsdPrecise(agent.activeContract.spentUsd)} (${agent.activeContract.spentPercent.toFixed(1)}%)` : '—'}
          />
          <ReadOnlyField
            label="Estimated step interval"
            value={agent.runner?.estimatedDelayMs != null ? `${Math.round(agent.runner.estimatedDelayMs / 1000)}s` : '—'}
          />
          <ReadOnlyField
            label="Wake pending"
            value={agent.runner?.wake.pending ? `yes${agent.runner.wake.nextTriggerAt ? ` · ${formatDateTime(agent.runner.wake.nextTriggerAt)}` : ''}` : 'no'}
          />
        </div>
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
            {agent.recentExecutionSteps.map((step) => (
              <tr key={step.stepId}>
                <td className="px-4 py-3">{step.kind}</td>
                <td className="px-4 py-3">{step.modelKey}</td>
                <td className="px-4 py-3">
                  <div>{formatInteger(step.inputTokens + step.cachedInputTokens + step.outputTokens)}</div>
                  <div className="text-xs text-slate-500">
                    in {formatInteger(step.inputTokens)} / cache {formatInteger(step.cachedInputTokens)} / out {formatInteger(step.outputTokens)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>{formatUsdPrecise(step.costUsd)}</div>
                  <div className="text-xs text-slate-500">
                    in {step.inputPerMillionUsd} / cache {step.inputCachePerMillionUsd} / out {step.outputPerMillionUsd} · {step.contractCostMultiplier.toFixed(3)}x
                  </div>
                </td>
                <td className="px-4 py-3">{formatDateTime(step.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

function ReadOnlyField(input: { label: string; value: string; wrap?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {input.label}
      </div>
      <div className={cn('mt-1 text-sm text-slate-900', input.wrap && 'break-all')}>{input.value}</div>
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

function createAgentConfigDraft(agent: AgentDetail): AgentConfigDraft {
  return {
    name: agent.name,
    description: agent.description ?? '',
    instructions: agent.instructions,
    workspaceAutoSync: agent.workspace.autoSync,
    workspaceBm25: agent.workspace.bm25,
    workspaceEmbedder: agent.workspace.embedder,
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

function buildProviderDraftKey(agentId: string, providerType: 'discord' | 'email') {
  return `${agentId}:${providerType}`;
}

function createProviderTemplate(providerType: 'discord' | 'email') {
  if (providerType === 'discord') {
    return '{\n  "token": "",\n  "allowedChannelIds": [],\n  "respondToMentionsOnly": false\n}';
  }

  return (
    '{\n' +
    '  "imap": {\n' +
    '    "host": "",\n' +
    '    "port": 993,\n' +
    '    "secure": true,\n' +
    '    "user": "",\n' +
    '    "password": ""\n' +
    '  },\n' +
    '  "smtp": {\n' +
    '    "host": "",\n' +
    '    "port": 465,\n' +
    '    "secure": true,\n' +
    '    "user": "",\n' +
    '    "password": ""\n' +
    '  }\n' +
    '}'
  );
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatAgentProfile(
  profile:
    | {
        modelKey: string;
      }
    | null
    | undefined,
) {
  if (!profile) {
    return 'No model profile';
  }

  return profile.modelKey;
}

function formatDateTimeText(value?: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return formatDateTime(parsed.getTime());
}
