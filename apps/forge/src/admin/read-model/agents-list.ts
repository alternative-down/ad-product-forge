/**
 * Agent List Read Model — Phase 3 of #2467
 * Extracted from admin/read-model/agents.ts
 * Contains: listAgents, getAgent
 *
 * Backward-compatible: agents.ts re-exports types and delegates to this module
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Agent, AgentExecutionStep } from '../../database/schema';
import { resolve } from 'node:path';
import {
  agentExecutionContracts,
  agentExecutionSteps,
  agentLongTermMemoryStates,
  agentNotifications,
  agentMcpConfigs,
  agentSchedules,
  agents,
  mcpServerConfigs,
} from '../../database/schema';
import {
  longTermMemoryStateSchema,
  createEmptyLongTermMemoryState,
  type LongTermMemoryState,
} from '../../agents/ltm/store';
import { listThreadMessages } from './conversation-helpers';
import {
  toScheduleSummary as toScheduleSummaryHelper,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
  withTimeoutAndLog,
  type ScheduleSummary,
} from './helpers';
import { listAgentWorkspaceSkills } from '../../agents/workspace-skills';

import type { Database } from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import {
  toMastraSafeIdentifier,
  readOperationalMemoryState,
  LibsqlConversationStore,
  forgeDebug,
} from '@forge-runtime/core';
import { type AgentExecutionState } from './agents-types';
import { errorMsg } from '../../agents/error-formatting';
import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';

const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;

export interface AgentListItem {
  agentId: string;
  name: string;
  description: string | null;
  role: string | null;
  executionState: AgentExecutionState;
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  roleName: string | null;
  modelProfile: string | null;
  omModelProfile: string | null;
  loaded: boolean;
  runner: unknown | null;
  providerTypes: unknown[];
  overview: {
    lastStepAt: number | null;
    lastStepContextTokens: number | null;
    lastStepPreview: string | null;
    lastToolBadge: string | null;
    lastStepTokens: number | null;
    lastStepCostUsd: number | null;
    averageStepIntervalMs: number | null;
    unreadNotificationCount: number;
    om: {
      generationCount: number;
      checkpointGeneration: number;
      recentRawTokenCount: number;
      recentRawTokenLimit: number;
      overflowTokenCount: number;
      overflowTokenLimit: number;
      observationTokenCount: number;
      reflectionTriggerTokenLimit: number;
      reflectionTokenCount: number;
      reflectionTokenLimit: number;
      checkpointTokenCount: number;
    } | null;
    ltm: {
      running: boolean;
      queued: boolean;
      packageCount: number;
    };
  };
  createdAt: number;
  updatedAt: number;
}

export interface AgentDetail {
  id: string;
  name: string | null;
  description: string | null;
  executionState: string;
  role: string | null;
  roleName: string | null;
  modelProfile: string | null;
  omModelProfile: string | null;
  workspaceFilesystem: { basePath: string } | null;
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  loaded: boolean;
  runner: unknown | null;
  mcpConfigIds: string[];
  mcpServers: Array<{
    configId: string | null;
    serverId: string;
    name: string;
    description?: string;
    transport: 'stdio' | 'http_streamable';
    command: string;
    argsText: string;
    envVarsText: string;
    url: string;
    headersText: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  recentExecutionSteps: Array<{
    stepId: string;
    agentId: string;
    kind: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    input: unknown;
    output: unknown;
    error: unknown;
    costUsd: number | null;
  }>;
  recentNotifications: Array<{
    notificationId: string;
    content: string;
    timestamp: number;
    read: boolean;
  }>;
  githubProvisioning: unknown;
  skills: unknown[];
  activeContract: {
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyValueUsd: number;
    spentUsd: number;
    spentPercent: number;
    autoRenew: boolean;
  } | null;
  schedules: Array<{
    id: string;
    kind: string;
    name: string | null;
    description: string | null;
    cronExpression: string | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    isActive: boolean;
    createdAt: number;
  }>;
  heartbeat: {
    id: string;
    kind: string;
    name: string | null;
    description: string | null;
    cronExpression: string | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    isActive: boolean;
    createdAt: number;
  } | null;
}

export interface AgentListReadModel {
  listAgents: () => Promise<AgentListItem[]>;
  getAgent: (agentId: string) => Promise<AgentDetail | null>;
}

export interface AgentListReadModelDeps {
  db: Database;
  registry: {
    get(agentId: string): unknown;
    size: number;
  };
  workspaceBasePath: string;
}

type RuntimeMemoryOutput = {
  generationCount: number;
  checkpointGeneration: number;
  metrics: {
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
  };
  /** LTM snapshot from loaded agent — for ltm.running/queued in #5312 */
  ltm: { running: boolean; queued: boolean } | null;
} | null;

  // Workspace skills parallel map — populated in listAgents
  const skillsByAgentId = new Map<string, Awaited<ReturnType<typeof listAgentWorkspaceSkills>>>();

export function createAgentListReadModel(deps: AgentListReadModelDeps): AgentListReadModel {
  const { db, registry, workspaceBasePath } = deps;
  const systemSettings = createSystemSettingsStore(db);

  async function getRuntimeMemoryForAgent(agentId: string): Promise<RuntimeMemoryOutput> {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId) as
      | { runtime?: { longTermMemory?: { readSnapshot: () => Promise<unknown> } } }
      | undefined;
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');

    // eslint-disable-next-line no-dynamic-imports/no-dynamic-imports
    const { createClient } = await import('@libsql/client');
    let client: Awaited<ReturnType<typeof import("@libsql/client").createClient>> | null = null;
    try {
      client = createClient({ url: `file:${agentDatabasePath}` });
      client.execute('PRAGMA foreign_keys = ON');
    } catch (err) {
      forgeDebug({ scope: 'agents-list', level: 'debug', message: 'createClient failed: ' + errorMsg(err) });
      return null;
    }

    const conversationStore = new LibsqlConversationStore({
      client: client,
      tablePrefix: mastraAgentId,
    });
    const settings = await systemSettings.getSettings();

    const operationalMemoryState = await readOperationalMemoryState({
      threadId: mastraAgentId,
      store: conversationStore,
      recentTokenLimit: settings.checkpointedOmRecentRawTokens,
    });
    const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
    const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;

    const _runtimeLtmSnapshot = loadedAgent?.runtime?.longTermMemory
      ? await withTimeoutAndLog({
          scope: 'admin-read-model-agents-list',
          op: 'runtimeLtmSnapshot',
          promise: loadedAgent.runtime.longTermMemory.readSnapshot(),
          timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
          timeoutMessage: `Agent runtime memory LTM snapshot timed out for ${agentId}`,
          fallback: null,
        })
      : null;

    const rawMetrics = operationalMemoryState.metrics;
    const recentRawLimit = settings.checkpointedOmRecentRawTokens ?? 0;
    const observationTriggerLimit = settings.checkpointedOmRawObservationBatchTokens ?? 0;
    const reflectionTriggerLimit = settings.checkpointedOmObservationReflectionBatchTokens ?? 0;
    const totalTokens = settings.checkpointedOmTotalContextTokens ?? 0;
    return {
      generationCount,
      checkpointGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? 0,
      metrics: {
        recentRawTokenCount: rawMetrics?.recentRawTokenCount ?? 0,
        recentRawTokenLimit: recentRawLimit,
        overflowTokenCount: rawMetrics?.overflowTokenCount ?? 0,
        observationTriggerTokenLimit: observationTriggerLimit,
        observationTokenCount: rawMetrics?.observationTokenCount ?? 0,
        reflectionTriggerTokenLimit: reflectionTriggerLimit,
        reflectionTokenCount: rawMetrics?.reflectionTokenCount ?? 0,
        reflectionBudget: Math.max(0, totalTokens - recentRawLimit),
        checkpointTokenCount: rawMetrics?.checkpointTokenCount ?? 0,
      },
      ltm: _runtimeLtmSnapshot !== null
        ? { running: (_runtimeLtmSnapshot as { running?: boolean }).running ?? false, queued: (_runtimeLtmSnapshot as { queued?: boolean }).queued ?? false }
        : null,
    };
  }

  async function listAgents(): Promise<AgentListItem[]> {
    const [agentRows, unreadNotificationRows, allRoles, allProfiles] = await Promise.all([
      db.query.agents.findMany({ orderBy: (fields, { asc }) => [asc(fields.name)] }),
      db
        .select({ agentId: agentNotifications.agentId, count: sql<number>`count(*)` })
        .from(agentNotifications)
        .where(sql`${agentNotifications.readAt} is null`)
        .groupBy(agentNotifications.agentId)
        .all(),
      db.query.agentRoles.findMany(),
      db.query.llmProfiles.findMany(),
    ]);
    // Parallel fetch workspace skills for all agents (N+1 fix)
    const agentRowsSkills = agentRows.length > 0
      ? await Promise.all(agentRows.map((agent) => listAgentWorkspaceSkills(workspaceBasePath, agent)))
      : [];
    for (let i = 0; i < (agentRows ?? []).length; i++) {
      skillsByAgentId.set(agentRows![i].id, agentRowsSkills[i]);
    }

    const unreadNotificationCountByAgentId = new Map(
      unreadNotificationRows.map((row) => [row.agentId, row.count]),
    );
    const roleMap = new Map(allRoles.map((r) => [r.id, r]));
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

    // Batch-fetch recent steps for all agents in a single query, then group by agentId
    const agentIds = agentRows.map((a) => a.id);
    const allRecentSteps =
      agentIds.length > 0
        ? await db.query.agentExecutionSteps.findMany({
            where: and(
              inArray(agentExecutionSteps.agentId, agentIds),
              eq(agentExecutionSteps.kind, 'agent-step'),
            ),
            orderBy: [desc(agentExecutionSteps.createdAt)],
          })
        : [];
    const recentStepsByAgentId = new Map<string, typeof allRecentSteps>();
    for (const step of allRecentSteps) {
      const existing = recentStepsByAgentId.get(step.agentId) ?? [];
      if (existing.length < 6) existing.push(step);
      recentStepsByAgentId.set(step.agentId, existing);
    }

    const runtimeMemoryByAgentId = new Map(
      await Promise.all(
        agentRows.map(
          async (agent) =>
            [
              agent.id,
              await withTimeoutAndLog({
                scope: 'admin-read-model-agents-list',
                op: 'runtimeMemoryByAgent',
                promise: getRuntimeMemoryForAgent(agent.id),
                timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
                timeoutMessage: `Admin runtime memory read timed out for ${agent.id}`,
                fallback: null,
              }),
            ] as const,
        ),
      ),
    );

    const latestThreadDetailsByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => {
          const threadMessages = await withTimeoutAndLog({
            scope: 'admin-read-model-agents-list',
            op: 'latestThreadDetails',
            promise: listThreadMessages(workspaceBasePath, agent.id, { page: 0, perPage: 8 }),
            timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            timeoutMessage: `Admin latest thread details read timed out for ${agent.id}`,
            fallback: {
              items: [] as Array<{ role: string; content: unknown }>,
              hasMore: false,
            },
          });

          let preview: string | null = null;
          let toolBadge: string | null = null;

          for (const message of threadMessages.items) {
            if (message.role !== 'assistant') continue;
            const content = message.content as unknown[];
            preview ??= extractLatestMessagePreview(
              content as Parameters<typeof extractLatestMessagePreview>[0],
            );
            const tb = extractLatestMessageToolBadge(
              content as Parameters<typeof extractLatestMessageToolBadge>[0],
            );
            toolBadge ??= tb ? (tb.label ?? null) : null;
            if ((preview ?? '') !== '') break;
          }

          return [agent.id, { preview, toolBadge }] as const;
        }),
      ),
    );

    // Batch-fetch LTM state for all agents in a single query, then group by agentId
    const ltmStateRows =
      agentIds.length > 0
        ? await withTimeoutAndLog({
            scope: 'admin-read-model-agents-list',
            op: 'ltmStateBatch',
            promise: (async () => {
              const rows = await db.query.agentLongTermMemoryStates.findMany({
                where: inArray(agentLongTermMemoryStates.agentId, agentIds),
              });
              return rows;
            })(),
            timeoutMs: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            timeoutMessage: 'Admin LTM state batch read timed out',
            fallback: null,
          })
        : null;

    const longTermMemoryStateByAgentId = new Map<string, LongTermMemoryState | null>();
    if (ltmStateRows) {
      for (const row of ltmStateRows) {
        try {
          const parsed = longTermMemoryStateSchema.safeParse(JSON.parse(row.state));

          longTermMemoryStateByAgentId.set(
            row.agentId,
            parsed.success ? parsed.data : createEmptyLongTermMemoryState(),
          );
        } catch (err) {
      forgeDebug({ scope: 'agents-list', level: 'debug', message: 'parseLongTermMemoryState failed: ' + errorMsg(err) });
          longTermMemoryStateByAgentId.set(row.agentId, createEmptyLongTermMemoryState());
        }
      }
    }
    for (const id of agentIds) {
      if (!longTermMemoryStateByAgentId.has(id)) {
        longTermMemoryStateByAgentId.set(id, null);
      }
    }

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id) as
        | { runner?: { getSnapshot: () => unknown } }
        | undefined;
      const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;
      const recentSteps = recentStepsByAgentId.get(agent.id) ?? [];
      const runtimeMemory = runtimeMemoryByAgentId.get(agent.id) ?? null;
      const longTermMemoryState = longTermMemoryStateByAgentId.get(agent.id) ?? null;
      const latestThreadDetails = latestThreadDetailsByAgentId.get(agent.id) ?? {
        preview: null,
        toolBadge: null,
      };
      const executionState = agent.executionState ?? 'absent';

      const averageStepIntervalMs =
        recentSteps.length >= 2
          ? Math.round(
              recentSteps
                .slice(0, 6)
                .map((step, index, items) => {
                  if (index === items.length - 1) return null;
                  return Math.max(step.createdAt - items[index + 1].createdAt, 0);
                })
                .filter((v) => v !== null)
                .reduce((sum, v, _, arr) => sum + (v as number) / arr.length, 0),
            )
          : null;

      const firstStep = recentSteps[0] as
        | {
            createdAt?: number;
            inputTokens?: number;
            cachedInputTokens?: number;
            outputTokens?: number;
            costUsd?: number | null;
          }
        | undefined;
      const lastStepTokens = firstStep
        ? (firstStep.inputTokens ?? 0) +
          ((firstStep as AgentExecutionStep).cachedInputTokens ?? 0) +
          (firstStep.outputTokens ?? 0)
        : null;

      return {
        agentId: agent.id,
        name: agent.name ?? '',
        description: agent.description ?? null,
        role: (agent as Agent).roleId ?? null,
        executionState,
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
        roleName: (() => {
          const roleId = (agent as Agent).roleId;
          return roleId != null ? (roleMap.get(roleId)?.name ?? null) : null;
        })(),
        modelProfile: (() => {
          const id = (agent as Agent).modelProfileId;
          return id != null ? (profileMap.get(id)?.name ?? null) : null;
        })(),
        omModelProfile: (() => {
          const id = (agent as Agent).omModelProfileId;
          return id != null ? (profileMap.get(id)?.name ?? null) : null;
        })(),
        loaded: Boolean(loadedAgent),
        runner: runnerSnapshot,
        providerTypes: [],
        overview: {
          lastStepAt: firstStep?.createdAt ?? null,
          lastStepContextTokens: firstStep?.inputTokens ?? null,
          lastStepPreview: latestThreadDetails.preview,
          lastToolBadge: latestThreadDetails.toolBadge,
          lastStepTokens,
          lastStepCostUsd: firstStep?.costUsd ?? null,
          averageStepIntervalMs,
          unreadNotificationCount: unreadNotificationCountByAgentId.get(agent.id) ?? 0,
          om: runtimeMemory
            ? {
                generationCount: runtimeMemory.generationCount,
                checkpointGeneration: runtimeMemory.checkpointGeneration,
                recentRawTokenCount: runtimeMemory.metrics.recentRawTokenCount,
                recentRawTokenLimit: runtimeMemory.metrics.recentRawTokenLimit,
                overflowTokenCount: runtimeMemory.metrics.overflowTokenCount,
                overflowTokenLimit: runtimeMemory.metrics.observationTriggerTokenLimit,
                observationTokenCount: runtimeMemory.metrics.observationTokenCount,
                reflectionTriggerTokenLimit: runtimeMemory.metrics.reflectionTriggerTokenLimit,
                reflectionTokenCount: runtimeMemory.metrics.reflectionTokenCount,
                reflectionTokenLimit: runtimeMemory.metrics.reflectionBudget,
                checkpointTokenCount: runtimeMemory.metrics.checkpointTokenCount,
              }
            : null,
          ltm: {
            running: executionState === 'idle' && runtimeMemory !== null
              ? runtimeMemory.ltm?.running ?? false
              : false,
            queued: executionState === 'idle' && runtimeMemory !== null
              ? runtimeMemory.ltm?.queued ?? false
              : false,
            packageCount: longTermMemoryState?.packages.length ?? 0,
          },
        },
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      } as AgentListItem;
    });
  }

  async function getAgent(agentId: string): Promise<AgentDetail | null> {
    let agent;
    // eslint-disable-next-line prefer-const
    agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId) as
      | { runner?: { getSnapshot: () => unknown } }
      | undefined;
    const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;

    const [
      agentMcpRows,
      agentScheduleRows,
      recentSteps,
      recentNotifications,
      activeContractRows,
      allRoles,
      allProfiles,
    ] = await Promise.all([
      db.query.agentMcpConfigs.findMany({ where: eq(agentMcpConfigs.agentId, agentId) }),
      db.query.agentSchedules.findMany({ where: eq(agentSchedules.agentId, agentId) }),
      db.query.agentExecutionSteps.findMany({
        where: eq(agentExecutionSteps.agentId, agentId),
        orderBy: desc(agentExecutionSteps.createdAt),
        limit: RECENT_STEP_LIMIT,
      }),
      db.query.agentNotifications.findMany({
        where: eq(agentNotifications.agentId, agentId),
        orderBy: desc(agentNotifications.createdAt),
        limit: RECENT_NOTIFICATION_LIMIT,
      }),
      db.query.agentExecutionContracts.findMany({
        where: eq(agentExecutionContracts.agentId, agentId),
      }),
      db.query.agentRoles.findMany({ columns: { id: true, name: true, description: true } }),
      db.query.llmProfiles.findMany({ columns: { id: true, name: true, modelKey: true } }),
    ]);

    const mcpServerIds = agentMcpRows.map((r) => r.serverId).filter(Boolean);
    let agentMcpServerRows: any[];
    if (mcpServerIds.length > 0) {
      agentMcpServerRows = await db.query.mcpServerConfigs.findMany({
        where: inArray(mcpServerConfigs.id, mcpServerIds),
      });
    } else {
      agentMcpServerRows = [];
    }

    let spentUsd = 0;
    if (activeContractRows.length > 0) {
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(currentPeriodStart.getDate() - (currentPeriodStart.getDay() + 7));
      let steps;
      // eslint-disable-next-line prefer-const
      steps = await db.query.agentExecutionSteps.findMany({
        where: and(
          eq(agentExecutionSteps.agentId, agentId),
          gte(agentExecutionSteps.createdAt, Math.floor(currentPeriodStart.getTime() / 1000)),
        ),
        columns: { costUsd: true },
      });
      spentUsd = steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
    }

    const heartbeat = agentScheduleRows.find((s) => s.kind === 'heartbeat');
    const githubProvisioning = null;

    const recentSteps_ = recentSteps.map((step) => {
      const { id, ...rest } = step;
      return { ...rest, stepId: id };
    });

    const recentNotifications_ = recentNotifications.map((n) => ({
      notificationId: n.id,
      content: n.content,
      timestamp: n.createdAt,
      read: n.readAt !== null,
    }));

    const serverIdToLink = new Map(agentMcpRows.map((link) => [link.serverId, link]));

    const mcpServers = agentMcpServerRows.map((server) => {
      const link = serverIdToLink.get(server.id);
      return {
        configId: link?.id ?? null,
        serverId: server.id,
        name: server.name,
        description: server.description ?? undefined,
        transport: server.transport as 'stdio' | 'http_streamable',
        command: server.command ?? '',
        argsText: server.args ?? '',
        envVarsText: server.envVars ?? '',
        url: server.url ?? '',
        headersText: server.headers ?? '',
        isActive: link?.isActive === 1,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      };
    });

    const roleMap = new Map(allRoles.map((r) => [r.id, r]));
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));
    const agentRoleId = (agent as Agent).roleId;
    const agentModelProfileId = (agent as Agent).modelProfileId;
    const agentOmModelProfileId = (agent as Agent).omModelProfileId;

    const activeContractRow = activeContractRows[0] ?? null;

    return {
      id: agent.id,
      name: agent.name ?? null,
      description: agent.description ?? null,
      role: agentRoleId ?? null,
      roleName: (agentRoleId ?? '') !== '' ? (roleMap.get(agentRoleId ?? '')?.name ?? null) : null,
      modelProfile:
        (agentModelProfileId ?? '') !== ''
          ? (profileMap.get(agentModelProfileId ?? '')?.name ?? null)
          : null,
      omModelProfile:
        (agentOmModelProfileId ?? '') !== ''
          ? (profileMap.get(agentOmModelProfileId ?? '')?.name ?? null)
          : null,
      workspaceFilesystem: agent.workspaceFilesystem ?? null,
      lastExecutionError: agent.lastExecutionError ?? null,
      lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
      loaded: Boolean(loadedAgent),
      runner: runnerSnapshot,
      mcpConfigIds: agentMcpRows.map((r) => r.id),
      mcpServers,
      recentExecutionSteps: recentSteps_,
      recentNotifications: recentNotifications_,
      githubProvisioning,
      skills: skillsByAgentId.get(agent.id) ?? [],
      activeContract:
        activeContractRow !== null && activeContractRow !== undefined
          ? {
              contractId: activeContractRow.id,
              agentId: activeContractRow.agentId,
              agentName: agent.name ?? '',
              startsAt: activeContractRow.startsAt,
              endsAt: activeContractRow.endsAt,
              weeklyValueUsd: activeContractRow.budgetUsd,
              spentUsd,
              spentPercent:
                activeContractRow.budgetUsd > 0
                  ? (spentUsd / activeContractRow.budgetUsd) * 100
                  : 0,
              autoRenew: Boolean(activeContractRow.autoRenew),
            }
          : null,
      schedules: agentScheduleRows
        .filter((schedule) => schedule.kind === 'agent')
        .map((row): ScheduleSummary => toScheduleSummaryHelper(row)),
      heartbeat: heartbeat ? toScheduleSummaryHelper(heartbeat) : null,
    } as unknown as AgentDetail;
  }

  return { listAgents, getAgent };
}
