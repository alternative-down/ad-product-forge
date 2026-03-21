import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Clock3, LoaderCircle, RefreshCcw, Zap } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

import {
  createSchedule,
  deleteSchedule,
  getAgent,
  listAgents,
  reloadAgent,
  updateSchedule,
  wakeAgent,
  type AgentSchedule,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from '../../lib/api';
import { formatDateTime, formatInteger, formatUsd } from '../../lib/format';
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

export const agentsSearchSchema = z.object({
  agentId: z.string().optional(),
});

export function AgentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: '/agents' });
  const search = useSearch({ from: '/agents' });
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);

  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: listAgents,
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
        {agentDetailQuery.isLoading && <PanelLoading label="Loading agent detail" />}
        {agentDetailQuery.isError && <PanelError message={agentDetailQuery.error.message} />}
        {agentDetailQuery.data && (
          <>
            <AgentHeader
              agent={agentDetailQuery.data}
              onWake={() => wakeMutation.mutate(agentDetailQuery.data!.agentId)}
              onReload={() => reloadMutation.mutate(agentDetailQuery.data!.agentId)}
              wakePending={wakeMutation.isPending}
              reloadPending={reloadMutation.isPending}
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
            <span>Role: {agent.function?.roleName ?? 'No role'}</span>
            <span>•</span>
            <span>Model: {agent.model}</span>
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

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Runner" value={agent.runner?.executing ? 'executing' : 'idle'} />
        <MiniMetric label="Timer scheduled" value={agent.runner?.scheduled ? 'yes' : 'no'} />
        <MiniMetric
          label="Backoff"
          value={agent.runner ? `${Math.round(agent.runner.backoffMs / 1000)}s` : '—'}
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
            <ReadOnlyField label="Sandbox working dir" value={getSandboxWorkingDirectory(agent)} />
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
            <ReadOnlyField label="Ends at" value={formatDateTime(agent.activeContract?.endsAt)} />
            <ReadOnlyField
              label="Auto renew"
              value={agent.activeContract?.autoRenew ? 'yes' : 'no'}
            />
            <ReadOnlyField
              label="Providers"
              value={agent.providers.map((provider) => provider.providerType).join(', ') || '—'}
            />
          </div>
        </div>
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
                <td className="px-4 py-3">{formatInteger(step.inputTokens + step.outputTokens)}</td>
                <td className="px-4 py-3">{formatUsd(step.costUsd)}</td>
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

function getSandboxWorkingDirectory(agent: NonNullable<Awaited<ReturnType<typeof getAgent>>>) {
  const sandbox = agent.workspace.sandbox;

  if (!sandbox || typeof sandbox !== 'object') {
    return '—';
  }

  if (!('workingDirectory' in sandbox) || typeof sandbox.workingDirectory !== 'string') {
    return '—';
  }

  return sandbox.workingDirectory;
}
