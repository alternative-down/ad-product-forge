import { useState } from 'react';
import { Bot, Clock3 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

import {
  adjustAgentContractBudget,
  changeAgentFunction,
  createSchedule,
  deleteAgentProvider,
  deleteSchedule,
  getAgent,
  getSystemLlm,
  hireAgent,
  listAgents,
  listFunctions,
  reloadAgent,
  terminateAgent,
  updateAgentConfig,
  updateSchedule,
  upsertAgentProvider,
  wakeAgent,
  type AgentListItem,
  type AgentSchedule,
  type HireAgentResult,
  type AgentDetail,
} from '../../lib/api';
import { formatDateTime, formatInteger, formatUsd, formatUsdPrecise } from '../../lib/format';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/page-header';
import { SectionNav, WorkspaceCanvas } from '../../components/layout/section-nav';
import { SegmentedTabs } from '../../components/ui/segmented-tabs';

// Import extracted types, utilities, and components
import type {
  AgentConfigDraft,
  AgentDetailTab,
  AgentRuntimeView,
  AgentCommunicationView,
  HireAgentDraft,
  ProviderDraft,
  ScheduleDraft,
} from './types';
import {
  buildAgentLocation,
  createAgentConfigDraft,
  createEmptyScheduleDraft,
  createProviderTemplate,
  createScheduleDraftFromRecord,
  buildProviderDraftKey,
  formatDateTimeText,
  toCreateScheduleInput,
  toUpdateScheduleInput,
} from './utils';
import {
  ReadOnlyField,
  LabeledField,
  PanelLoading,
  PanelError,
  CompactStat,
} from './ui';

// Import extracted cards
import {
  HireAgentCard,
  AgentMaintenanceCard,
  AgentConfigurationCard,
  GitHubProvisioningCard,
  AgentProvidersCard,
  ContractBudgetAdjustCard,
} from './cards';

// Re-export types for external use
export type {
  AgentDetailTab,
  AgentRuntimeView,
  AgentCommunicationView,
  HireAgentDraft,
  AgentConfigDraft,
  ProviderDraft,
  ScheduleDraft,
};

export function AgentsPage() {
  return <AgentsWorkspacePage mode="directory" />;
}

export function AgentHirePage() {
  return <AgentsWorkspacePage mode="hire" />;
}

export function AgentDetailPage(input: {
  agentId: string;
  tab: AgentDetailTab;
  runtimeView?: AgentRuntimeView;
  communicationView?: AgentCommunicationView;
}) {
  return <AgentsWorkspacePage {...input} mode="detail" />;
}

function AgentsWorkspacePage(input: {
  mode: 'directory' | 'hire' | 'detail';
  agentId?: string;
  tab?: AgentDetailTab;
  runtimeView?: AgentRuntimeView;
  communicationView?: AgentCommunicationView;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
    credentialsText: createProviderTemplate('discord'),
  });

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: listAgents,
  });
  const functionsQuery = useQuery({
    queryKey: ['admin', 'functions'],
    queryFn: listFunctions,
  });
  const systemLlmQuery = useQuery({
    queryKey: ['admin', 'system', 'llm'],
    queryFn: getSystemLlm,
  });
  const agentDetailQuery = useQuery({
    queryKey: ['admin', 'agent', input.agentId],
    queryFn: () => getAgent(input.agentId!),
    enabled: Boolean(input.agentId),
    refetchInterval: input.mode === 'detail' && input.agentId ? 5000 : false,
    refetchOnWindowFocus: true,
  });

  const selectedAgentFunctionId =
    agentDetailQuery.data && functionDraft?.agentId === agentDetailQuery.data.agentId
      ? functionDraft.functionId
      : (agentDetailQuery.data?.function?.functionId ?? '');
  const selectedAgentConfig =
    agentDetailQuery.data && configDraft?.agentId === agentDetailQuery.data.agentId
      ? configDraft.value
      : (agentDetailQuery.data ? createAgentConfigDraft(agentDetailQuery.data) : null);
  const selectedTab: AgentDetailTab = input.tab ?? 'runtime';
  const selectedRuntimeView = input.runtimeView ?? 'assignment';
  const selectedCommunicationView = input.communicationView ?? 'inbox';

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
  const adjustBudgetMutation = useMutation({
    mutationFn: adjustAgentContractBudget,
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] }),
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

      const nextLocation = buildAgentLocation({
        agentId: result.agentId,
        tab: 'runtime',
        runtimeView: 'assignment',
      });

      void navigate({ to: nextLocation });
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

      void navigate({
        to: '/agents',
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
  const detailTabs: Array<{ value: AgentDetailTab; label: string; detail: string }> = [
    { value: 'runtime', label: 'Runtime', detail: 'identity, config, contract, GitHub provisioning' },
    { value: 'communications', label: 'Communications', detail: 'providers, inbox, and memory thread' },
    { value: 'schedules', label: 'Schedules', detail: 'heartbeat and explicit wake schedules' },
    { value: 'history', label: 'History', detail: 'execution cost and recent steps' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agents"
        title="Agent operations"
        description="Each area should answer one question at a time: hire a collaborator, inspect runtime state, review communications, manage schedules, or inspect execution history."
        actions={
          input.mode === 'hire' ? (
            <Link
              to="/agents"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-5 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
            >
              Back to roster
            </Link>
          ) : input.mode === 'detail' ? (
            <Link
              to="/agents"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-5 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
            >
              Back to agents
            </Link>
          ) : (
            <Link
              to="/agents/hire"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--accent)] bg-[color:var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Hire agent
            </Link>
          )
        }
      />

      {input.mode === 'hire' ? (
        <WorkspaceCanvas
          title="Hire an internal collaborator"
          description="Describe the collaborator you want. The hiring workflow will shape the function, generate the operating prompt, contract the agent, and return the onboarding links."
        >
          <div className="mx-auto max-w-4xl">
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
          </div>
        </WorkspaceCanvas>
      ) : input.mode === 'directory' ? (
        <WorkspaceCanvas
          title="Agent roster"
          description="Open an agent to inspect runtime, communications, schedules, and execution history. Hiring lives in its own route."
        >
          {agentsQuery.isLoading && <PanelLoading label="Loading agents" />}
          {agentsQuery.isError && <PanelError message={agentsQuery.error.message} />}
          {agentsQuery.data ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {agentsQuery.data.map((agent) => {
                const detailLocation = buildAgentLocation({
                  agentId: agent.agentId,
                  tab: 'runtime',
                  runtimeView: 'assignment',
                });

                return (
                  <Link
                    key={agent.agentId}
                    to={detailLocation}
                    className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-5 py-5 text-left transition hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[color:var(--ink)]">{agent.name}</div>
                        <div className="mt-1 text-sm text-[color:var(--muted)]">
                          {agent.functionName ?? 'No function assigned'}
                        </div>
                      </div>
                      <Badge>{agent.executionState}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-[color:var(--muted)]">
                      <div>Providers: {agent.providerTypes.join(', ') || 'none'}</div>
                      <div>Runner: {agent.runner ? getRunnerListStateLabel(agent) : agent.executionState}</div>
                      <div>
                        Next activity: {agent.runner?.nextStepAt ? formatDateTime(agent.runner.nextStepAt) : '—'}
                      </div>
                    </div>
                    <div className="mt-5 text-sm font-semibold text-[color:var(--accent)]">Open agent</div>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </WorkspaceCanvas>
      ) : (
        <div className="space-y-6">
          <div className="space-y-6">
            {agentDetailQuery.isLoading && <PanelLoading label="Loading agent detail" />}
            {agentDetailQuery.isError && <PanelError message={agentDetailQuery.error.message} />}
            {functionsQuery.isError && <PanelError message={functionsQuery.error.message} />}
            {!input.agentId && !agentDetailQuery.isLoading ? (
              <WorkspaceCanvas
                title="Select an agent"
                description="Pick an agent from the roster to inspect runtime state, communications, schedules, or execution history."
              >
                <div className="text-sm text-[color:var(--muted)]">No agent selected.</div>
              </WorkspaceCanvas>
            ) : null}
            {agentDetailQuery.data ? (
              <>
                <WorkspaceCanvas
                  title="Run state"
                  description="Live runner status, wake queue condition, latest activity, and direct runtime actions."
                  actions={
                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={() => wakeMutation.mutate(agentDetailQuery.data!.agentId)} disabled={wakeMutation.isPending}>
                        Wake
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => reloadMutation.mutate(agentDetailQuery.data!.agentId)} disabled={reloadMutation.isPending}>
                        Reload
                      </Button>
                    </div>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ReadOnlyField label="Runner state" value={getRunnerStateLabel(agentDetailQuery.data)} />
                    <ReadOnlyField label="Wake queue" value={getWakeQueueLabel(agentDetailQuery.data)} />
                    <ReadOnlyField label="Last wake" value={formatDateTime(agentDetailQuery.data.runner?.lastWakeStartedAt ?? null)} />
                    <ReadOnlyField
                      label="Next scheduled step"
                      value={agentDetailQuery.data.runner?.nextStepAt ? `${formatDateTime(agentDetailQuery.data.runner.nextStepAt)}${agentDetailQuery.data.runner.estimatedDelayMs != null ? ` · ${formatDurationShort(agentDetailQuery.data.runner.estimatedDelayMs)}` : ''}` : '—'}
                    />
                    <ReadOnlyField
                      label="Latest step"
                      value={agentDetailQuery.data.recentExecutionSteps[0] ? `${formatDateTime(agentDetailQuery.data.recentExecutionSteps[0].createdAt)} · ${agentDetailQuery.data.recentExecutionSteps[0].kind}` : '—'}
                    />
                    <ReadOnlyField
                      label="Unread notifications"
                      value={formatInteger(agentDetailQuery.data.recentNotifications.filter((notification) => !notification.read).length)}
                    />
                    <ReadOnlyField
                      label="Unread conversations"
                      value={formatInteger(agentDetailQuery.data.recentConversations.length)}
                    />
                    <ReadOnlyField
                      label="Estimated next interval"
                      value={agentDetailQuery.data.runner?.estimatedDelayMs != null ? formatDurationShort(agentDetailQuery.data.runner.estimatedDelayMs) : '—'}
                    />
                  </div>
                </WorkspaceCanvas>

                <WorkspaceCanvas
                  title={agentDetailQuery.data.name}
                  description={`${agentDetailQuery.data.function?.name ?? 'No function assigned'} · ${agentDetailQuery.data.executionState}`}
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <CompactStat label="Function" value={agentDetailQuery.data.function?.name ?? '—'} />
                    <CompactStat label="Providers" value={agentDetailQuery.data.providers.map((provider) => provider.providerType).join(', ') || 'none'} />
                    <CompactStat label="Contract" value={agentDetailQuery.data.activeContract ? `${formatUsd(agentDetailQuery.data.activeContract.weeklyValueUsd)} / week` : 'no contract'} />
                    <CompactStat label="Model" value={agentDetailQuery.data.modelProfile?.name ?? '—'} />
                  </div>
                </WorkspaceCanvas>

                <SectionNav
                  title="Agent area"
                  value={selectedTab}
                  orientation="horizontal"
                  items={detailTabs}
                  onChange={(tab) => {
                    if (!input.agentId) {
                      return;
                    }

                    void navigate({
                      to: buildAgentLocation({
                        agentId: input.agentId,
                        tab,
                        runtimeView: selectedRuntimeView,
                        communicationView: selectedCommunicationView,
                      }),
                    });
                  }}
                />

                {selectedTab === 'runtime' && functionsQuery.data && (
                  <div className="space-y-6">
                    <SegmentedTabs
                      value={selectedRuntimeView}
                      items={[
                        { value: 'assignment', label: 'Assignment', description: 'function and lifecycle changes' },
                        { value: 'configuration', label: 'Configuration', description: 'identity, prompt, and workspace controls' },
                        { value: 'contract', label: 'Contract', description: 'budget and top-up control' },
                        { value: 'github', label: 'GitHub', description: 'provisioning status and links' },
                      ]}
                      onChange={(runtimeView) =>
                        input.agentId
                          ? void navigate({
                              to: buildAgentLocation({
                                agentId: input.agentId,
                                tab: 'runtime',
                                runtimeView,
                                communicationView: selectedCommunicationView,
                              }),
                            })
                          : undefined
                      }
                    />

                    {selectedRuntimeView === 'assignment' ? (
                      <div className="space-y-6">
                        <WorkspaceCanvas
                          title="Current assignment"
                          description="The agent keeps one function assignment. Capability changes happen through the function and its linked roles."
                        >
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <ReadOnlyField label="Assigned function" value={agentDetailQuery.data.function?.name ?? '—'} />
                            <ReadOnlyField label="Roles" value={formatInteger(agentDetailQuery.data.function?.roles.length ?? 0)} />
                            <ReadOnlyField
                              label="Primary model"
                              value={agentDetailQuery.data.modelProfile?.name ?? '—'}
                            />
                            <ReadOnlyField
                              label="Observational memory model"
                              value={agentDetailQuery.data.omModelProfile?.name ?? '—'}
                            />
                          </div>
                        </WorkspaceCanvas>

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
                      </div>
                    ) : null}

                    {selectedRuntimeView === 'configuration' ? (
                      <AgentConfigurationCard
                        draft={selectedAgentConfig!}
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
                            modelProfileId: draft.modelProfileId,
                            omModelProfileId: draft.omModelProfileId,
                          })
                        }
                        profiles={systemLlmQuery.data?.profiles ?? []}
                      />
                    ) : null}

                    {selectedRuntimeView === 'contract' ? (
                      <div className="space-y-6">
                        <WorkspaceCanvas
                          title="Contract"
                          description="Current budget, spend, and control actions for the active contract."
                        >
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <ReadOnlyField label="Value" value={formatUsd(agentDetailQuery.data.activeContract?.weeklyValueUsd)} />
                            <ReadOnlyField
                              label="Spent"
                              value={agentDetailQuery.data.activeContract ? formatUsdPrecise(agentDetailQuery.data.activeContract.spentUsd) : '—'}
                            />
                            <ReadOnlyField
                              label="Remaining"
                              value={
                                agentDetailQuery.data.activeContract
                                  ? formatUsdPrecise(
                                      agentDetailQuery.data.activeContract.weeklyValueUsd -
                                      agentDetailQuery.data.activeContract.spentUsd,
                                    )
                                  : '—'
                              }
                            />
                            <ReadOnlyField
                              label="Starts"
                              value={formatDateTime(agentDetailQuery.data.activeContract?.startsAt ?? null)}
                            />
                            <ReadOnlyField
                              label="Ends"
                              value={formatDateTime(agentDetailQuery.data.activeContract?.endsAt ?? null)}
                            />
                            <ReadOnlyField
                              label="Execution"
                              value={agentDetailQuery.data.executionState}
                            />
                          </div>
                        </WorkspaceCanvas>

                        {agentDetailQuery.data.activeContract ? (
                          <div className="max-w-xl">
                            <ContractBudgetAdjustCard
                              pending={adjustBudgetMutation.isPending}
                              error={adjustBudgetMutation.error?.message ?? null}
                              disabled={!agentDetailQuery.data.activeContract}
                              currentBudgetUsd={agentDetailQuery.data.activeContract.weeklyValueUsd}
                              spentUsd={agentDetailQuery.data.activeContract.spentUsd}
                              onSubmit={(newBudgetUsd) =>
                                adjustBudgetMutation.mutate({
                                  agentId: agentDetailQuery.data!.agentId,
                                  newBudgetUsd,
                                })
                              }
                            />
                          </div>
                        ) : (
                          <WorkspaceCanvas
                            title="No active contract"
                            description="This agent does not have an active execution contract."
                          />
                        )}
                      </div>
                    ) : null}

                    {selectedRuntimeView === 'github' ? (
                      <div className="space-y-6">
                        <WorkspaceCanvas
                          title="GitHub status"
                          description="Provisioning state and installation links for the GitHub App tied to this agent."
                        >
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <ReadOnlyField label="Provisioning" value={agentDetailQuery.data.githubProvisioning?.status ?? 'none'} />
                            <ReadOnlyField label="Loaded" value={agentDetailQuery.data.loaded ? 'yes' : 'no'} />
                            <ReadOnlyField
                              label="Registration link"
                              value={agentDetailQuery.data.githubProvisioning?.registrationUrl ? 'available' : '—'}
                            />
                            <ReadOnlyField
                              label="Install link"
                              value={agentDetailQuery.data.githubProvisioning?.installUrl ? 'available' : '—'}
                            />
                          </div>
                        </WorkspaceCanvas>

                        <GitHubProvisioningCard provisioning={agentDetailQuery.data.githubProvisioning} />
                      </div>
                    ) : null}
                  </div>
                )}

                {selectedTab === 'communications' && (
                  <div className="space-y-6">
                    <SegmentedTabs
                      value={selectedCommunicationView}
                      items={[
                        { value: 'inbox', label: 'Inbox', description: 'notifications and recent conversations' },
                        { value: 'thread', label: 'Thread', description: 'latest persisted memory messages' },
                        { value: 'providers', label: 'Providers', description: 'channel credentials and provider wiring' },
                      ]}
                      onChange={(communicationView) =>
                        input.agentId
                          ? void navigate({
                              to: buildAgentLocation({
                                agentId: input.agentId,
                                tab: 'communications',
                                runtimeView: selectedRuntimeView,
                                communicationView,
                              }),
                            })
                          : undefined
                      }
                    />

                    {selectedCommunicationView === 'providers' ? (
                      <div className="space-y-6">
                        <WorkspaceCanvas
                          title="Provider status"
                          description="Channel providers connected to this agent."
                        >
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <ReadOnlyField label="Providers" value={formatInteger(agentDetailQuery.data.providers.length)} />
                            <ReadOnlyField
                              label="Editable"
                              value={formatInteger(agentDetailQuery.data.providers.filter((provider) => provider.editable).length)}
                            />
                            <ReadOnlyField
                              label="Connected types"
                              value={agentDetailQuery.data.providers.map((provider) => provider.providerType).join(', ') || 'none'}
                            />
                            <ReadOnlyField
                              label="Loaded"
                              value={agentDetailQuery.data.loaded ? 'yes' : 'no'}
                            />
                          </div>
                        </WorkspaceCanvas>

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
                      </div>
                    ) : null}

                    {selectedCommunicationView === 'inbox' ? (
                      <AgentInboxCard
                        notifications={agentDetailQuery.data.recentNotifications}
                        conversations={agentDetailQuery.data.recentConversations}
                      />
                    ) : null}

                    {selectedCommunicationView === 'thread' ? (
                      <div className="space-y-6">
                        <WorkspaceCanvas
                          title="Thread summary"
                          description="Latest persisted memory traffic by role."
                        >
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <ReadOnlyField label="Messages" value={formatInteger(agentDetailQuery.data.recentThreadMessages.length)} />
                            <ReadOnlyField
                              label="System"
                              value={formatInteger(agentDetailQuery.data.recentThreadMessages.filter((message) => message.role === 'system').length)}
                            />
                            <ReadOnlyField
                              label="User"
                              value={formatInteger(agentDetailQuery.data.recentThreadMessages.filter((message) => message.role === 'user').length)}
                            />
                            <ReadOnlyField
                              label="Assistant"
                              value={formatInteger(agentDetailQuery.data.recentThreadMessages.filter((message) => message.role === 'assistant').length)}
                            />
                          </div>
                        </WorkspaceCanvas>

                        <AgentThreadCard messages={agentDetailQuery.data.recentThreadMessages} />
                      </div>
                    ) : null}
                  </div>
                )}

                {selectedTab === 'schedules' && (
                  <div className="space-y-6">
                    <WorkspaceCanvas
                      title="Schedule status"
                      description="Heartbeat and explicit scheduled wakeups attached to this agent."
                    >
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <ReadOnlyField label="Schedules" value={formatInteger(agentDetailQuery.data.schedules.length)} />
                        <ReadOnlyField
                          label="Active schedules"
                          value={formatInteger(agentDetailQuery.data.schedules.filter((schedule) => schedule.isActive).length)}
                        />
                        <ReadOnlyField
                          label="Heartbeat"
                          value={agentDetailQuery.data.heartbeat?.cronExpression ?? '—'}
                        />
                        <ReadOnlyField
                          label="Next heartbeat"
                          value={formatDateTime(agentDetailQuery.data.heartbeat?.nextTriggerAt ?? null)}
                        />
                      </div>
                    </WorkspaceCanvas>

                    <SchedulesCard
                      schedules={agentDetailQuery.data.schedules}
                      heartbeat={agentDetailQuery.data.heartbeat}
                      onCreateSchedule={() => setScheduleDraft(createEmptyScheduleDraft())}
                      onEditSchedule={(schedule) => setScheduleDraft(createScheduleDraftFromRecord(schedule))}
                      onDeleteSchedule={(scheduleId) =>
                        deleteScheduleMutation.mutate({
                          agentId: agentDetailQuery.data!.agentId,
                          scheduleId,
                        })
                      }
                      deletingScheduleId={deleteScheduleMutation.variables?.scheduleId}
                    />
                    {scheduleDraft ? (
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
                    ) : null}
                  </div>
                )}

                {selectedTab === 'history' && <ExecutionCard agent={agentDetailQuery.data} />}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentInboxCard(input: {
  notifications: AgentDetail['recentNotifications'];
  conversations: AgentDetail['recentConversations'];
}) {
  const [view, setView] = useState<'conversations' | 'notifications'>('conversations');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    input.conversations[0]?.conversationId ?? null,
  );
  const unreadNotificationCount = input.notifications.filter((notification) => !notification.read).length;
  const unreadMessageCount = input.conversations.reduce(
    (total, conversation) => total + conversation.messages.filter((message) => message.unread).length,
    0,
  );
  const selectedConversation = input.conversations.find(
    (conversation) => conversation.conversationId === selectedConversationId,
  ) ?? input.conversations[0] ?? null;

  return (
    <div className="space-y-6">
      <WorkspaceCanvas
        title="Inbox summary"
        description="Unread operational signals and the latest conversation activity visible from this agent workspace."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField label="Notifications" value={formatInteger(input.notifications.length)} />
          <ReadOnlyField label="Unread notifications" value={formatInteger(unreadNotificationCount)} />
          <ReadOnlyField label="Conversations" value={formatInteger(input.conversations.length)} />
          <ReadOnlyField label="Unread messages" value={formatInteger(unreadMessageCount)} />
        </div>
      </WorkspaceCanvas>

      <SegmentedTabs
        value={view}
        items={[
          { value: 'conversations', label: 'Conversations', description: 'browse and inspect recent threads' },
          { value: 'notifications', label: 'Notifications', description: 'central operational alerts' },
        ]}
        onChange={(nextView) => setView(nextView as 'conversations' | 'notifications')}
      />

      {view === 'notifications' ? (
        <Card className="p-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Notifications</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest notifications recorded in the central Forge database.
            </p>
          </div>
          <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {input.notifications.length === 0 && (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No notifications for this agent.
              </div>
            )}
            {input.notifications.map((notification) => (
              <div
                key={notification.notificationId}
                className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge>{notification.read ? 'read' : 'unread'}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(notification.timestamp)}</span>
                  </div>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm text-foreground">{notification.content}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only communication preview from the selected agent workspace database.
            </p>
          </div>
          {input.conversations.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              No conversations for this agent.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-2">
                {input.conversations.map((conversation) => {
                  const unreadCount = conversation.messages.filter((message) => message.unread).length;

                  return (
                    <button
                      key={conversation.conversationId}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.conversationId)}
                      className={cn(
                        'w-full rounded-lg border px-4 py-4 text-left transition',
                        selectedConversation?.conversationId === conversation.conversationId
                          ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                          : 'border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] text-foreground hover:border-[color:var(--muted-strong)] hover:bg-[color:var(--panel)]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {conversation.name ?? conversation.contactDisplayName ?? conversation.contactSlug ?? conversation.conversationKey}
                          </div>
                          <div
                            className={cn(
                              'mt-1 text-xs',
                              selectedConversation?.conversationId === conversation.conversationId
                                ? 'text-[color:var(--accent)]/80'
                                : 'text-muted-foreground',
                            )}
                          >
                            {conversation.provider} · {conversation.type} · {formatDateTimeText(conversation.updatedAt)}
                          </div>
                        </div>
                        {unreadCount > 0 ? <Badge>{formatInteger(unreadCount)}</Badge> : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedConversation ? (
                <div className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-foreground">{selectedConversation.conversationKey}</div>
                    <Badge>{selectedConversation.provider}</Badge>
                    <Badge>{selectedConversation.type}</Badge>
                  </div>
                  {selectedConversation.type === 'group' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedConversation.participants.map((participant) => (
                        <Badge key={`${selectedConversation.conversationId}-${participant}`}>{participant}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div>Updated at {formatDateTimeText(selectedConversation.updatedAt)}</div>
                    <div>{selectedConversation.name ?? selectedConversation.contactDisplayName ?? selectedConversation.contactSlug ?? 'Conversation'}</div>
                  </div>
                  <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={message.messageId}
                        className="rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-4 py-3 text-sm text-foreground"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-foreground">
                            {message.authorDisplayName ?? 'Unknown author'}
                          </div>
                          <div className="flex items-center gap-2">
                            {message.unread && <Badge>unread</Badge>}
                            <span className="text-xs text-muted-foreground">
                              {formatDateTimeText(message.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap">{message.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function AgentThreadCard(input: {
  messages: AgentDetail['recentThreadMessages'];
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Recent thread messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Latest messages persisted in the agent memory thread. Useful to inspect wake prompts,
          assistant replies, and tool-driven flow.
        </p>
      </div>
      <div className="mt-5 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
        {input.messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            No thread messages for this agent.
          </div>
        )}
        {input.messages.map((message) => (
          <div
            key={message.messageId}
            className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge>{message.role}</Badge>
                {message.type && <Badge>{message.type}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</div>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm text-foreground">
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
          <h2 className="text-lg font-semibold text-foreground">Schedules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent schedules are editable here. Heartbeat can be edited, but it cannot be deleted.
          </p>
        </div>
        <Button variant="secondary" onClick={input.onCreateSchedule}>
          Create schedule
        </Button>
      </div>

      {input.heartbeat && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-medium">
                <Clock3 className="h-4 w-4" />
                Heartbeat
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <span>Cron: {input.heartbeat.cronExpression}</span>
                <span>Next: {formatDateTime(input.heartbeat.nextTriggerAt)}</span>
              </div>
              <div className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs text-amber-950/80">
                {input.heartbeat.content || 'No heartbeat message configured.'}
              </div>
            </div>
            <Button variant="secondary" onClick={() => input.onEditSchedule(input.heartbeat!)}>
              Edit heartbeat
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {input.schedules.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            No agent schedules.
          </div>
        )}
        {input.schedules.map((schedule) => (
          <div
            key={schedule.scheduleId}
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-foreground">{schedule.name}</div>
                  <Badge>{schedule.scheduleType}</Badge>
                  <Badge>{schedule.isActive ? 'active' : 'inactive'}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {schedule.description ?? 'No description'}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                  <span>Cron: {schedule.cronExpression ?? '—'}</span>
                  <span>
                    Date: {schedule.scheduledDate ? formatDateTime(schedule.scheduledDate) : '—'}
                  </span>
                  <span>Next: {formatDateTime(schedule.nextTriggerAt)}</span>
                  <span>Last: {formatDateTime(schedule.lastTriggeredAt)}</span>
                </div>
                <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
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
          <h2 className="text-lg font-semibold text-foreground">
            {input.draft.mode === 'create' ? 'Create schedule' : 'Edit schedule'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
              onChange={(value) =>
                input.onChange({
                  ...input.draft,
                  scheduleType: value as 'cron' | 'date',
                })
              }
            >
              <option value="cron">cron</option>
              <option value="date">date</option>
            </Select>
          </LabeledField>

          {input.draft.mode === 'edit' && (
            <label className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
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
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
  const recentStepCostUsd = agent.recentExecutionSteps.reduce((total, step) => total + step.costUsd, 0);
  const recentStepTokenCount = agent.recentExecutionSteps.reduce(
    (total, step) => total + step.inputTokens + step.cachedInputTokens + step.outputTokens,
    0,
  );

  return (
    <div className="space-y-6">
      <WorkspaceCanvas
        title="Execution summary"
        description="Budget context and the recent execution footprint visible from the central step ledger."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ReadOnlyField label="Contract value" value={formatUsd(agent.activeContract?.weeklyValueUsd)} />
          <ReadOnlyField
            label="Used"
            value={agent.activeContract ? `${formatUsdPrecise(agent.activeContract.spentUsd)} (${agent.activeContract.spentPercent.toFixed(1)}%)` : '—'}
          />
          <ReadOnlyField
            label="Estimated next interval"
            value={agent.runner?.estimatedDelayMs != null ? formatDurationShort(agent.runner.estimatedDelayMs) : '—'}
          />
          <ReadOnlyField
            label="Recent step cost"
            value={formatUsdPrecise(recentStepCostUsd)}
          />
          <ReadOnlyField
            label="Recent step tokens"
            value={formatInteger(recentStepTokenCount)}
          />
        </div>
      </WorkspaceCanvas>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Recent execution steps</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Last recorded agent and OM steps from the central ledger.
            </p>
          </div>
          <Bot className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
              {agent.recentExecutionSteps.map((step) => (
                <tr key={step.stepId}>
                  <td className="px-4 py-3">{step.kind}</td>
                  <td className="px-4 py-3">{step.modelKey}</td>
                  <td className="px-4 py-3">
                    <div>{formatInteger(step.inputTokens + step.cachedInputTokens + step.outputTokens)}</div>
                    <div className="text-xs text-muted-foreground">
                      in {formatInteger(step.inputTokens)} / cache {formatInteger(step.cachedInputTokens)} / out {formatInteger(step.outputTokens)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{formatUsdPrecise(step.costUsd)}</div>
                    <div className="text-xs text-muted-foreground">
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
    </div>
  );
}

function getRunnerStateLabel(agent: Awaited<ReturnType<typeof getAgent>>) {
  if (!agent.runner) {
    return agent.executionState;
  }

  if (agent.runner.executing) {
    return 'executing';
  }

  if (agent.runner.scheduled) {
    return 'scheduled';
  }

  if (agent.runner.wake.pending && agent.runner.wake.waitingForIdle) {
    return 'waiting for idle';
  }

  if (agent.runner.wake.pending) {
    return 'wake pending';
  }

  return agent.executionState;
}

function getRunnerListStateLabel(agent: AgentListItem) {
  if (!agent.runner) {
    return agent.executionState;
  }

  if (agent.runner.executing) {
    return 'executing';
  }

  if (agent.runner.scheduled) {
    return 'scheduled';
  }

  if (agent.runner.wake.pending && agent.runner.wake.waitingForIdle) {
    return 'waiting for idle';
  }

  if (agent.runner.wake.pending) {
    return 'wake pending';
  }

  return agent.executionState;
}

function getWakeQueueLabel(agent: Awaited<ReturnType<typeof getAgent>>) {
  if (!agent.runner?.wake.pending) {
    return 'idle';
  }

  if (agent.runner.wake.waitingForIdle) {
    return 'waiting for idle';
  }

  if (agent.runner.wake.nextTriggerAt) {
    return `debounce · ${formatDateTime(agent.runner.wake.nextTriggerAt)}`;
  }

  return 'pending';
}

function formatDurationShort(value: number) {
  const totalSeconds = Math.max(Math.round(value / 1000), 0);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
