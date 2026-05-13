/**
 * Agent List Read Model — Phase 3 of #2467
 * Extracted from admin/read-model/agents.ts
 * Contains: listAgents, getAgent
 * 
 * Backward-compatible: agents.ts re-exports types and delegates to this module
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import {
  agentExecutionContracts,
  agentExecutionSteps,
  agentNotifications,
  agentMcpConfigs,
  agentRoles,
  agentSchedules,
  agents,
  llmProfiles,
  mcpServerConfigs,
} from '../../database/schema';
import { readLongTermMemoryState, readLongTermMemoryRecallSnapshot } from './helpers-ltm';
import { listThreadMessages } from './conversation-helpers';
import {
  formatWorkingMemoryValue,
  isTextPart,
  toScheduleSummary as toScheduleSummaryHelper,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
} from './helpers';
import { listAgentWorkspaceSkills } from '../../agents/workspace-skills';

import type { Database } from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import { toMastraSafeIdentifier, readOperationalMemoryState, LibsqlConversationStore, type CommunicationMessageView } from '@forge-runtime/core';
import { withTimeout } from '../../utils/async';
import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';

const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;

export interface AgentListItem {
  agentId: string;
  name: string;
  description: string | null;
  role: string | null;
  executionState: string;
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
} | null;

export function createAgentListReadModel(deps: AgentListReadModelDeps): AgentListReadModel {
  const { db, registry, workspaceBasePath } = deps;
  const systemSettings = createSystemSettingsStore({ db });

  async function getRuntimeMemoryForAgent(agentId: string): Promise<RuntimeMemoryOutput> {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId) as { runtime?: { longTermMemory?: { readSnapshot: () => Promise<unknown> } } } | undefined;
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');

    let client: { url: string };
    try {
      const { createClient } = await import('@libsql/client');
      const c = createClient({ url: `file:${agentDatabasePath}` });
      c.execute('PRAGMA foreign_keys = ON');
      client = { url: `file:${agentDatabasePath}` };
    } catch {
      return null;
    }

    const conversationStore = new LibsqlConversationStore({ client: client as any, tablePrefix: mastraAgentId });
    const settings = await systemSettings.getSettings();

    const operationalMemoryState = await readOperationalMemoryState({
      threadId: mastraAgentId,
      store: conversationStore,
      recentTokenLimit: settings.checkpointedOmRecentRawTokens,
    });
    const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
    const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;

    const runtimeLtmSnapshot = loadedAgent?.runtime?.longTermMemory
      ? await withTimeout(
          loadedAgent.runtime.longTermMemory.readSnapshot(),
          ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
          `Agent runtime memory LTM snapshot timed out for ${agentId}`,
        ).catch(() => null)
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
    };
  }

  async function listAgents(): Promise<AgentListItem[]> {
    const [agentRows, unreadNotificationRows, allRoles, allProfiles] = await Promise.all([
      db.query.agents.findMany({ orderBy: (fields, { asc }) => [asc(fields.name)] }),
      db
        .select({ agentId: agentNotifications.agentId, count: sql<number>`count(*)` })
        .from(agentNotifications)
        .where(sql`${agentNotifications.readAt} is null`)
        .groupBy(agentNotifications.agentId).all(),
      db.query.agentRoles.findMany(),
      db.query.llmProfiles.findMany(),
    ]);

    const unreadNotificationCountByAgentId = new Map(
      unreadNotificationRows.map((row) => [row.agentId, row.count]),
    );
    const roleMap = new Map(allRoles.map((r) => [r.id, r]));
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

    // Batch query: single query for all agents instead of N queries (fixes N+1)
    const recentStepsRows = agentRows.length > 0
      ? await db.query.agentExecutionSteps.findMany({
          where: and(
            inArray(agentExecutionSteps.agentId, agentRows.map((a) => a.id)),
            eq(agentExecutionSteps.kind, 'agent-step'),
          ),
          orderBy: [desc(agentExecutionSteps.createdAt)],
        })
      : [];

    // Collect up to 6 steps per agent (ordered desc, so newest-first slice is correct)
    const recentStepsByAgentId = new Map<string, typeof recentStepsRows>();
    for (const step of recentStepsRows) {
      const existing = recentStepsByAgentId.get(step.agentId) ?? [];
      if (existing.length < 6) {
        existing.push(step);
        recentStepsByAgentId.set(step.agentId, existing);
      }
    }

    const runtimeMemoryByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await withTimeout(
            getRuntimeMemoryForAgent(agent.id),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin runtime memory read timed out for ${agent.id}`,
          ).catch(() => null),
        ] as const),
      ),
    );

    const latestThreadDetailsByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => {
          const threadMessages = await withTimeout(
            listThreadMessages(workspaceBasePath, agent.id, { page: 0, perPage: 8 }),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin latest thread details read timed out for ${agent.id}`,
          ).catch(() => ({ items: [] as Array<{ role: string; content: unknown }>, hasMore: false }));

          let preview: string | null = null;
          let toolBadge: string | null = null;

          for (const message of threadMessages.items) {
            if (message.role !== 'assistant') continue;
            const content = message.content as unknown[];
            preview ??= extractLatestMessagePreview(content as Parameters<typeof extractLatestMessagePreview>[0]);
            const tb = extractLatestMessageToolBadge(content as Parameters<typeof extractLatestMessageToolBadge>[0]);
            toolBadge ??= tb ? (tb.label ?? null) : null;
            if (preview) break;
          }

          return [agent.id, { preview, toolBadge }] as const;
        }),
      ),
    );

    const longTermMemoryStateByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await withTimeout(
            readLongTermMemoryState(db, agent.id),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin LTM state read timed out for ${agent.id}`,
          ).catch(() => null),
        ] as const),
      ),
    );

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id) as { runner?: { getSnapshot: () => unknown } } | undefined;
      const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;
      const recentSteps = recentStepsByAgentId.get(agent.id) ?? [];
      const runtimeMemory = runtimeMemoryByAgentId.get(agent.id) ?? null;
      const longTermMemoryState = longTermMemoryStateByAgentId.get(agent.id) ?? null;
      const latestThreadDetails = latestThreadDetailsByAgentId.get(agent.id) ?? { preview: null, toolBadge: null };
      const executionState = agent.executionState ?? 'absent';

      const averageStepIntervalMs = recentSteps.length >= 2
        ? Math.round(
            recentSteps
              .slice(0, 6)
              .map((step, index, items) => {
                if (index === items.length - 1) return null;
                return Math.max(step.createdAt - (items[index + 1] as { createdAt: number }).createdAt, 0);
              })
              .filter((v) => v !== null)
              .reduce((sum, v, _, arr) => sum + (v as number) / arr.length, 0),
          )
        : null;

      const firstStep = recentSteps[0] as { createdAt?: number; inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; costUsd?: number | null } | undefined;
      const lastStepTokens = firstStep
        ? (firstStep.inputTokens ?? 0) + ((firstStep as { cachedInputTokens?: number }).cachedInputTokens ?? 0) + (firstStep.outputTokens ?? 0)
        : null;

      return {
        agentId: agent.id,
        name: agent.name ?? '',
        description: agent.description ?? null,
        role: (agent as { roleId?: string }).roleId ?? null,
        executionState,
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
        roleName: (agent as { roleId?: string }).roleId ? (roleMap.get((agent as { roleId: string }).roleId)?.name ?? null) : null,
        modelProfile: (agent as { modelProfileId?: string }).modelProfileId ? (profileMap.get((agent as { modelProfileId: string }).modelProfileId)?.name ?? null) : null,
        omModelProfile: (agent as { omModelProfileId?: string }).omModelProfileId ? (profileMap.get((agent as { omModelProfileId: string }).omModelProfileId)?.name ?? null) : null,
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
            running: executionState === 'idle' ? false : false,
            queued: executionState === 'idle' ? false : false,
            packageCount: longTermMemoryState?.packages.length ?? 0,
          },
        },
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      } as AgentListItem;
    });
  }

  async function getAgent(agentId: string): Promise<AgentDetail | null> {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId) as { runner?: { getSnapshot: () => unknown } } | undefined;
    const runnerSnapshot = loadedAgent?.runner?.getSnapshot?.() ?? null;

    const [agentMcpRows, agentScheduleRows, recentSteps, recentNotifications, activeContractRows, allRoles, allProfiles] = await Promise.all([
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
    const agentMcpServerRows = mcpServerIds.length > 0
      ? await db.query.mcpServerConfigs.findMany({ where: inArray(mcpServerConfigs.id, mcpServerIds) })
      : [];

    let spentUsd = 0;
    if (activeContractRows.length > 0) {
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(currentPeriodStart.getDate() - (currentPeriodStart.getDay() + 7));
      const steps = await db.query.agentExecutionSteps.findMany({
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
    const agentRoleId = (agent as { roleId?: string }).roleId;
    const agentModelProfileId = (agent as { modelProfileId?: string }).modelProfileId;
    const agentOmModelProfileId = (agent as { omModelProfileId?: string }).omModelProfileId;

    const activeContractRow = activeContractRows[0] ?? null;

    return {
      id: agent.id,
      name: agent.name ?? null,
      description: agent.description ?? null,
      executionState: agent.executionState ?? 'absent',
      role: agentRoleId ?? null,
      roleName: agentRoleId ? (roleMap.get(agentRoleId)?.name ?? null) : null,
      modelProfile: agentModelProfileId ? (profileMap.get(agentModelProfileId)?.name ?? null) : null,
      omModelProfile: agentOmModelProfileId ? (profileMap.get(agentOmModelProfileId)?.name ?? null) : null,
      workspaceFilesystem: (agent as { workspaceFilesystem?: { basePath: string } | null }).workspaceFilesystem ?? null,
      lastExecutionError: agent.lastExecutionError ?? null,
      lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
      loaded: Boolean(loadedAgent),
      runner: runnerSnapshot,
      mcpConfigIds: agentMcpRows.map((r) => r.id),
      mcpServers,
      recentExecutionSteps: recentSteps_,
      recentNotifications: recentNotifications_,
      githubProvisioning,
      skills: await listAgentWorkspaceSkills(workspaceBasePath, agent),
      activeContract: activeContractRow ? {
        contractId: activeContractRow.id,
        agentId: activeContractRow.agentId,
        agentName: agent.name ?? '',
        startsAt: activeContractRow.startsAt,
        endsAt: activeContractRow.endsAt,
        weeklyValueUsd: activeContractRow.budgetUsd,
        spentUsd,
        spentPercent: activeContractRow.budgetUsd > 0 ? (spentUsd / activeContractRow.budgetUsd) * 100 : 0,
        autoRenew: Boolean(activeContractRow.autoRenew),
      } : null,
      schedules: agentScheduleRows
        .filter((schedule) => schedule.kind === 'agent')
        .map(toScheduleSummaryHelper),
      heartbeat: heartbeat ? toScheduleSummaryHelper(heartbeat) as unknown : null,
    } as unknown as AgentDetail;
  }

  return { listAgents, getAgent };
}