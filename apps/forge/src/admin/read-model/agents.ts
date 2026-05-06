import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import {
  agentExecutionContracts,
  agentExecutionSteps,
  agentHomeMetricSnapshots,
  agentMcpConfigs,
  agentNotifications,
  agentRoles,
  agentSchedules,
  agents,
  llmProfiles,
  mcpServerConfigs,
} from '../../database/schema';
import { createClient } from '@libsql/client';
import { readLongTermMemoryState, readLongTermMemoryRecallSnapshot } from './helpers-ltm';
import { migrateLegacyCheckpointedOmState } from '../../agents/migrate-legacy-checkpointed-om';
import { closeLibsqlClient, listRecentConversations, listThreadMessages } from './conversation-helpers';
import {
  formatWorkingMemoryValue,
  isTextPart,
  toScheduleSummary as toScheduleSummaryHelper,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
} from './helpers';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';
import { listAgentWorkspaceSkills } from '../../agents/workspace-skills';
import type { Database } from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import { createMicroErpReadModel } from '../../micro-erp/read-model';
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../agents/ltm/recall';
import type { InternalChatService } from '../../communication/internal-chat-service';
import { forgeDebug } from '@forge-runtime/core';
import {
  toMastraSafeIdentifier,
  LibsqlConversationStore,
  readOperationalMemoryState,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';
import { withTimeout } from '../../utils/async';

import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants.js';
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;


type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

export interface AgentReadModel {
  getDashboard: () => Promise<{
    totals: {
      agents: number;
      loadedAgents: number;
      idleAgents: number;
      runningAgents: number;
      absentAgents: number;
      roles: number;
      activeContracts: number;
    };
    cash: {
      balanceUsd: number;
      summary: { income: number; expenses: number; net: number };
      recentMovements: unknown[];
    };
  }>;
  listAgents: () => Promise<unknown[]>;
  getAgent: (agentId: string) => Promise<unknown>;
  listAgentRecentConversations: (agentId: string) => Promise<unknown>;
  listAgentExecutionSteps: (input: { agentId: string; limit: number; offset: number }) => Promise<unknown>;
  listAgentThreadMessages: (params: { agentId: string; page: number; perPage: number }) => Promise<unknown>;
  listAgentLongTermMemoryThreadMessages: (params: { agentId: string; page: number; perPage: number }) => Promise<unknown>;
  getAgentRuntimeMemory: (agentId: string) => Promise<unknown>;
  listRecentAgentHomeMetricSnapshots: (input: { agentId: string; limit: number }) => Promise<unknown[]>;
  getAgentOmDebugExport: (agentId: string) => Promise<unknown>;
  debugAgentLongTermMemoryRecallSearch: (agentId: string, input: AgentLongTermMemoryRecallDebugSearchInput) => Promise<unknown>;
  listAgentConversationMessages: (params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) => Promise<unknown>;
  // Sub-resource queries for fragmented routes (#1587)
  listAgentContracts: (agentId: string) => Promise<unknown>;
  listAgentSchedules: (agentId: string) => Promise<unknown>;
  listAgentNotifications: (agentId: string) => Promise<unknown>;
  listAgentMcpServers: (agentId: string) => Promise<unknown>;
  listAgentLlmProfiles: (agentId: string) => Promise<unknown>;
}

interface AgentsReadModelDeps {
  db: Database;
  finance: ReturnType<typeof createMicroErpReadModel>;
  internalChat: InternalChatService;
  workspaceBasePath: string;
  systemSettings: ReturnType<typeof createSystemSettingsStore>;
}

export function createAgentReadModel(deps: AgentsReadModelDeps): AgentReadModel {
  const {
    db,
    finance,
    internalChat,
    workspaceBasePath,
    systemSettings,
  } = deps;

  const registry = getInternalAgentRegistry();

  async function getDashboard() {
    const [totals, cash] = await Promise.all([getTotals(), getCashData()]);
    return { totals, cash };
  }

  async function getTotals() {
    const rows = await db.query.agents.findMany({ columns: { id: true, executionState: true, role: true } });
    const loadedAgents = registry.size;
    const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
    const runningAgents = rows.filter((r) => r.executionState === 'running').length;
    const absentAgents = rows.filter((r) => !r.executionState || r.executionState === 'absent').length;
    const activeContracts = await db.query.agentExecutionContracts.findMany({
      where: eq(agentExecutionContracts.isActive, true),
      columns: { id: true },
    });
    const roles = new Set(rows.map((r) => r.role).filter(Boolean)).size;
    return {
      agents: rows.length,
      loadedAgents,
      idleAgents,
      runningAgents,
      absentAgents,
      roles,
      activeContracts: activeContracts.length,
    };
  }

  async function getCashData() {
    const [balanceResult, recentResult] = await Promise.all([
      finance.getCompanyCashBalance(),
      finance.listCompanyCashMovements({ limit: RECENT_CASH_MOVEMENT_LIMIT }),
    ]);
    return {
      balanceUsd: balanceResult.balanceUsd,
      summary: { income: 0, expenses: 0, net: 0 },
      recentMovements: recentResult.items,
    };
  }

  async function listAgents(): Promise<import('./index').AgentListItem[]> {
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

    const recentStepsByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await db.query.agentExecutionSteps.findMany({
            where: and(
              eq(agentExecutionSteps.agentId, agent.id),
              eq(agentExecutionSteps.kind, 'agent-step'),
            ),
            orderBy: [desc(agentExecutionSteps.createdAt)],
            limit: 6,
          }),
        ] as const),
      ),
    );

    const runtimeMemoryByAgentId = new Map(
      await Promise.all(
        agentRows.map(async (agent) => [
          agent.id,
          await withTimeout(
            getAgentRuntimeMemory(agent.id),
            ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
            `Admin runtime memory read timed out for ${agent.id}`,
          ).catch((error) => {
            forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load runtime memory', context: { agentId: agent.id, error } });
            return null;
          }),
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
          ).catch(() => ({ items: [], hasMore: false }));

          let preview = null;
          let toolBadge = null;

          for (const message of threadMessages.items) {
            if (message.role !== 'assistant') continue;
            preview ??= extractLatestMessagePreview(message.content);
            toolBadge ??= extractLatestMessageToolBadge(message.content);
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
          ).catch((error) => {
            forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load LTM state', context: { agentId: agent.id, error } });
            return null;
          }),
        ] as const),
      ),
    );

    return agentRows.map((agent) => {
      const loadedAgent = registry.get(agent.id);
      const runnerSnapshot = loadedAgent?.runner.getSnapshot() ?? null;
      const recentSteps = recentStepsByAgentId.get(agent.id) ?? [];
      const lastStep = recentSteps[0] ?? null;
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
                return Math.max(step.createdAt - items[index + 1].createdAt, 0);
              })
              .filter((v) => v !== null)
              .reduce((sum, v, _, arr) => sum + v / arr.length, 0),
          )
        : null;

      return {
        agentId: agent.id,
        name: agent.name ?? '',
        description: agent.description ?? undefined,
        role: agent.role ?? null,
        executionState,
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
        roleName: agent.roleId ? (roleMap.get(agent.roleId)?.name ?? null) : null,
        modelProfile: agent.modelProfileId ? (profileMap.get(agent.modelProfileId)?.id ?? null) : null,
        omModelProfile: agent.omModelProfileId ? (profileMap.get(agent.omModelProfileId)?.id ?? null) : null,
        loaded: Boolean(loadedAgent),
        runner: runnerSnapshot,
        providerTypes: [],
        overview: {
          lastStepAt: lastStep?.createdAt ?? null,
          lastStepContextTokens: lastStep?.inputTokens ?? null,
          lastStepPreview: latestThreadDetails.preview,
          lastToolBadge: latestThreadDetails.toolBadge,
          lastStepTokens: lastStep
            ? lastStep.inputTokens + (lastStep.cachedInputTokens ?? 0) + lastStep.outputTokens
            : null,
          lastStepCostUsd: lastStep?.costUsd ?? null,
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
            running: executionState === 'idle' ? (loadedAgent?.runtime?.longTermMemory?.readSnapshot()?.running ?? false) : false,
            queued: executionState === 'idle' ? (loadedAgent?.runtime?.longTermMemory?.readSnapshot()?.queued ?? false) : false,
            packageCount: longTermMemoryState?.packages.length ?? 0,
          },
        },
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      };
    });
  }

  async function getAgent(agentId: string) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId);
    const runnerSnapshot = loadedAgent?.runner.getSnapshot() ?? null;

    const [agentMcpRows, agentScheduleRows, recentSteps, recentNotifications, activeContractRows, agentRoles, llmProfiles] = await Promise.all([
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
    // The most-recent contract drives billing; compute spentUsd over the last 7 days
    if (activeContractRows.length > 0) {
      const currentPeriodStart = new Date();
      currentPeriodStart.setDate(currentPeriodStart.getDate() - (currentPeriodStart.getDay() + 7));
      const steps = await db.query.agentExecutionSteps.findMany({
        where: and(
          eq(agentExecutionSteps.agentId, agentId),
          gte(agentExecutionSteps.createdAt, currentPeriodStart.toISOString()),
        ),
        columns: { costUsd: true },
      });
      spentUsd = steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
    }

    const heartbeat = agentScheduleRows.find((s) => s.kind === 'heartbeat');

    const githubProvisioning = loadedAgent?.runtime?.github ? {
      installed: true,
      repositories: [],
    } : null;

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

    // Build serverId -> agentMcpConfig map so each server in the response
    // carries the correct configId (link.id) and isActive (link.isActive)
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
    // Build role map (agentRoles rows were already fetched in Promise.all)
    const roleMap = new Map(
      agentRoles?.map((r) => [r.id, r]) ?? []
    );
    const profileMap = new Map(
      llmProfiles?.map((p) => [p.id, p]) ?? []
    );

    const roleRow = agent.roleId ? roleMap.get(agent.roleId) : null;
    const modelProfileRow = agent.modelProfileId ? profileMap.get(agent.modelProfileId) : null;
    const omModelProfileRow = agent.omModelProfileId ? profileMap.get(agent.omModelProfileId) : null;

    const activeContractRow = activeContractRows[0] ?? null;

    return {
      agentId: agent.id,
      name: agent.name ?? '',
      description: agent.description ?? undefined,
      instructions: agent.instructions ?? '',
      executionState: agent.executionState ?? 'absent',
      lastExecutionError: agent.lastExecutionError ?? null,
      lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      role: roleRow ? {
        roleId: roleRow.id,
        name: roleRow.name,
        description: roleRow.description ?? null,
      } : null,
      modelProfile: modelProfileRow ? {
        profileId: modelProfileRow.id,
        name: modelProfileRow.name,
        modelKey: modelProfileRow.modelKey,
      } : null,
      omModelProfile: omModelProfileRow ? {
        profileId: omModelProfileRow.id,
        name: omModelProfileRow.name,
        modelKey: omModelProfileRow.modelKey,
      } : null,
      workspace: {
        autoSync: Boolean(agent.workspaceAutoSync),
        bm25: Boolean(agent.workspaceBm25),
        embedder: agent.workspaceEmbedder ?? null,
        filesystem: typeof agent.workspaceFilesystem === 'object' && agent.workspaceFilesystem !== null
          ? JSON.stringify(agent.workspaceFilesystem)
          : null,
        sandbox: typeof agent.workspaceSandbox === 'object' && agent.workspaceSandbox !== null
          ? JSON.stringify(agent.workspaceSandbox)
          : null,
      },
      loaded: Boolean(loadedAgent),
      runner: runnerSnapshot,
      providers: [],
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
      heartbeat: heartbeat ? toScheduleSummaryHelper(heartbeat) : null,
    };
  }

  async function listAgentRecentConversations(agentId: string) {
    const rows = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!rows) return [];
    return listRecentConversations(agentId, 10);
  }

  async function listAgentExecutionSteps(input: { agentId: string; limit: number; offset: number }) {
    const rows = await db.query.agentExecutionSteps.findMany({
      where: eq(agentExecutionSteps.agentId, input.agentId),
      orderBy: desc(agentExecutionSteps.createdAt),
      limit: input.limit,
      offset: input.offset,
    });
    return rows.map((row) => {
      const { id, ...rest } = row;
      return { ...rest, stepId: id };
    });
  }

  async function listAgentThreadMessages(params: { agentId: string; page: number; perPage: number }) {
    return listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    return listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
      threadId: toMastraSafeIdentifier(`${params.agentId}_long_term_memory`),
      tablePrefix: toMastraSafeIdentifier(params.agentId),
    });
  }

  async function getAgentRuntimeMemory(agentId: string) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;

    const loadedAgent = registry.get(agentId);
    const mastraAgentId = toMastraSafeIdentifier(agentId);
    const agentDatabasePath = resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({ url: `file:${agentDatabasePath}` });
    const conversationStore = new LibsqlConversationStore({ client, tablePrefix: mastraAgentId });

    try {
      await migrateLegacyCheckpointedOmState({ db, agentId, threadId: mastraAgentId, conversationStore });
      const agentWorkspaceRoot = resolve(workspaceBasePath, agentId);
      const agentWorkspaceDir = agent.workspaceFilesystem?.basePath
        ? resolve(agentWorkspaceRoot, agent.workspaceFilesystem.basePath)
        : resolve(agentWorkspaceRoot, 'workspace');
      const agentContextPath = resolve(agentWorkspaceDir, 'AGENT_CONTEXT.md');
      const agentContext = await import('node:fs/promises')
        .then((fs) => fs.readFile(agentContextPath, 'utf8'))
        .then((content) => content.trim() ?? null)
        .catch((err) => {
          forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err } });
          return null;
        });
      const workingMemory = (await conversationStore.read({ threadId: mastraAgentId, resourceId: mastraAgentId }))?.workingMemory ?? null;
      const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
      const settings = await systemSettings.getSettings();
      const operationalMemoryState = await readOperationalMemoryState({
        threadId: mastraAgentId,
        store: conversationStore,
        recentTokenLimit: settings.checkpointedOmRecentRawTokens,
      });
      const checkpointSummaryMessage = operationalMemoryState.checkpointSummaryMessage;
      const checkpointSummaryText = checkpointSummaryMessage?.parts
        .filter(isTextPart)
        .map((part) => part.text!.trim())
        .filter(Boolean)
        .join('\n') ?? null;
      const reflection = operationalMemoryState.reflectionMessages
        .map((message) =>
          message.parts
            .filter(isTextPart)
            .map((part) => part.text!.trim())
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');
      const observations = operationalMemoryState.observationMessages
        .map((message) =>
          message.parts
            .filter(isTextPart)
            .map((part) => part.text!.trim())
            .filter(Boolean)
            .join('\n'))
        .filter(Boolean)
        .join('\n');
      const generationCount = checkpointSummaryMessage?.operationalMemoryGeneration ?? 0;
      const updatedAt = operationalMemoryState.metrics.latestThreadMessageAt
        ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt)
        : null;
      const lastObservedAt = operationalMemoryState.observationMessages.length
        ? Date.parse(operationalMemoryState.observationMessages.at(-1)?.createdAt ?? '')
        : null;
      const runtimeLtmSnapshot = loadedAgent?.runtime.longTermMemory
        ? await withTimeout(
          loadedAgent.runtime.longTermMemory.readSnapshot(),
          ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
          `Agent runtime memory LTM snapshot timed out for ${agentId}`,
        ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err } }); return null; })
        : null;
      const persistedLtmState = await withTimeout(
        readLongTermMemoryState(db, agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        `Agent runtime memory persisted LTM state timed out for ${agentId}`,
      ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err } }); return null; });
      const ltm = (runtimeLtmSnapshot
        ? {
          ...runtimeLtmSnapshot,
          running: agent.executionState === 'idle' ? runtimeLtmSnapshot.running : false,
          queued: agent.executionState === 'idle' ? runtimeLtmSnapshot.queued : false,
        }
        : null) ?? (persistedLtmState
        ? {
          running: false,
          queued: false,
          lastRunAt: persistedLtmState.lastRunAt ? Date.parse(persistedLtmState.lastRunAt) : null,
          lastRunError: persistedLtmState.lastRunError,
          lastRunErrorAt: persistedLtmState.lastRunErrorAt ? Date.parse(persistedLtmState.lastRunErrorAt) : null,
          lastWrittenPackageId: persistedLtmState.lastWrittenPackageId,
          lastWrittenAt: persistedLtmState.lastWrittenAt ? Date.parse(persistedLtmState.lastWrittenAt) : null,
          packageCount: persistedLtmState.packages.length,
        }
        : null);

      return {
        workingMemory: formatWorkingMemoryValue(workingMemory),
        agentContext,
        executionState: agent.executionState as 'idle' | 'running' | 'absent',
        lastExecutionError: agent.lastExecutionError ?? null,
        lastExecutionErrorAt: agent.lastExecutionErrorAt ?? null,
        observations,
        reflection,
        generationCount,
        updatedAt,
        lastObservedAt,
        checkpointMessageId: checkpointSummaryMessage?.id ?? null,
        checkpointGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
        checkpointSummary: checkpointSummaryText,
        checkpointUpdatedAt: checkpointSummaryMessage?.createdAt
          ? Date.parse(checkpointSummaryMessage.createdAt)
          : null,
        ltmRecall: ltmRecall
          ? {
            status: ltmRecall.status,
            query: ltmRecall.query,
            resultIds: ltmRecall.resultIds,
            resultCount: ltmRecall.resultCount,
            resultScores: ltmRecall.resultScores,
            graphHit: ltmRecall.graphHit,
            stepsJson: ltmRecall.stepsJson,
            updatedAt: Date.parse(ltmRecall.updatedAt),
            lastInitAt: ltmRecall.lastInitAt ? Date.parse(ltmRecall.lastInitAt) : null,
            searchMode: ltmRecall.searchMode,
            topK: ltmRecall.topK,
            graphTopK: ltmRecall.graphTopK,
            graphThreshold: ltmRecall.graphThreshold,
            graphRandomWalkSteps: ltmRecall.graphRandomWalkSteps,
            indexPaths: ltmRecall.indexPaths,
            workspaceFileCount: ltmRecall.workspaceFileCount,
            memoryFileCount: ltmRecall.memoryFileCount,
            checkpointFileCount: ltmRecall.checkpointFileCount,
            error: ltmRecall.error,
          }
        : null,
        ltm,
        metrics: {
          rawMessageCount: operationalMemoryState.metrics.rawMessageCount,
          recentRawMessageCount: operationalMemoryState.metrics.recentRawMessageCount,
          recentRawTokenCount: operationalMemoryState.metrics.recentRawTokenCount,
          recentRawTokenLimit: settings.checkpointedOmRecentRawTokens,
          overflowMessageCount: operationalMemoryState.metrics.overflowMessageCount,
          overflowTokenCount: operationalMemoryState.metrics.overflowTokenCount,
          observationTriggerTokenLimit: settings.checkpointedOmRawObservationBatchTokens,
          activeObservationBlockCount: operationalMemoryState.observationMessages.length,
          observationTokenCount: operationalMemoryState.metrics.observationTokenCount,
          reflectionTriggerTokenLimit: settings.checkpointedOmObservationReflectionBatchTokens,
          activeReflectionBlockCount: operationalMemoryState.reflectionMessages.length,
          reflectionTokenCount: operationalMemoryState.metrics.reflectionTokenCount,
          reflectionBudget: Math.max(
            0,
            settings.checkpointedOmTotalContextTokens
              - settings.checkpointedOmRecentRawTokens
              - settings.checkpointedOmRawObservationBatchTokens
              - settings.checkpointedOmObservationReflectionBatchTokens,
          ),
          checkpointTokenCount: operationalMemoryState.metrics.checkpointTokenCount,
          checkpointSummaryUpToGeneration: checkpointSummaryMessage?.operationalMemoryGeneration ?? null,
          latestThreadMessageAt: operationalMemoryState.metrics.latestThreadMessageAt
            ? Date.parse(operationalMemoryState.metrics.latestThreadMessageAt)
            : null,
        },
      };
    } finally {
      await closeLibsqlClient(client);
    }
  }

  async function listRecentAgentHomeMetricSnapshots(input: { agentId: string; limit: number }) {
    const rows = await db.query.agentHomeMetricSnapshots.findMany({
      where: eq(agentHomeMetricSnapshots.agentId, input.agentId),
      orderBy: [desc(agentHomeMetricSnapshots.createdAt)],
      limit: input.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      stepId: row.stepId,
      stepCreatedAt: row.stepCreatedAt,
      createdAt: row.createdAt,
      snapshot: row.snapshot,
    }));
  }

  async function getAgentOmDebugExport(agentId: string) {
    const [agent, runtimeMemory] = await Promise.all([
      getAgent(agentId),
      getAgentRuntimeMemory(agentId),
    ]);
    if (!agent || !runtimeMemory) return null;
    const snapshots = await listRecentAgentHomeMetricSnapshots({ agentId, limit: 20 });
    return { agent, runtimeMemory, metricSnapshots: snapshots };
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    input: AgentLongTermMemoryRecallDebugSearchInput,
  ) {
    const loadedAgent = registry.get(agentId);
    if (!loadedAgent) throw new Error(`Agent is not loaded: ${agentId}`);
    if (!loadedAgent.runtime.longTermMemoryRecall) throw new Error(`Long-term memory recall is not available for agent: ${agentId}`);
    const result = await loadedAgent.runtime.longTermMemoryRecall.debugSearch(input);
    return { ...result, lastInitAt: result.lastInitAt ? new Date(result.lastInitAt).getTime() : null };
  }

  async function listAgentConversationMessages(params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) {
    if (params.provider === 'internal-chat') {
      const messages = await internalChat.getMessages({
        agentId: params.agentId,
        conversationKey: params.targetKey,
        limit: params.limit,
        offset: params.offset,
      });
      const accounts = await internalChat.listAccounts();
      const agentIdByAccountId = new Map(accounts.map((account) => [account.id, account.agentId ?? null]));
      return {
        items: messages.map((message: CommunicationProviderMessage) => ({
          ...message,
          authorAgentId: message.authorId ? (agentIdByAccountId.get(message.authorId) ?? null) : null,
        })),
        hasMore: messages.length === params.limit,
      };
    }
    const runtime = registry.get(params.agentId)?.runtime;
    if (!runtime) return { items: [], hasMore: false };
    const messages = await runtime.communication.getMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    });
    return {
      items: messages.map((message: CommunicationMessageView) => ({ ...message, authorAgentId: null })),
      hasMore: messages.length === params.limit,
    };
  }

  // ─── Fragmented agent detail routes (#1587) ─────────────────────────────
  async function listAgentContracts(agentId: string) {
    return db.query.agentExecutionContracts.findMany({
      where: eq(agentExecutionContracts.agentId, agentId),
    });
  }

  async function listAgentSchedules(agentId: string) {
    return db.query.agentSchedules.findMany({
      where: eq(agentSchedules.agentId, agentId),
    });
  }

  async function listAgentNotifications(agentId: string) {
    const rows = await db.query.agentNotifications.findMany({
      where: eq(agentNotifications.agentId, agentId),
      orderBy: desc(agentNotifications.createdAt),
      limit: RECENT_NOTIFICATION_LIMIT,
    });
    return rows.map((n) => ({
      notificationId: n.id,
      content: n.content,
      timestamp: n.createdAt,
      read: n.readAt !== null,
    }));
  }

  async function listAgentMcpServers(agentId: string) {
    const agentMcpRows = await db.query.agentMcpConfigs.findMany({
      where: eq(agentMcpConfigs.agentId, agentId),
    });
    if (agentMcpRows.length === 0) return { servers: [] };

    const serverIds = agentMcpRows.map((r) => r.serverId).filter(Boolean);
    const agentMcpServerRows = await db.query.mcpServerConfigs.findMany({
      where: inArray(mcpServerConfigs.id, serverIds),
    });

    const serverIdToLink = new Map(agentMcpRows.map((link) => [link.serverId, link]));
    return {
      servers: agentMcpServerRows.map((server) => {
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
      }),
    };
  }

  async function listAgentLlmProfiles(agentId: string) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { modelProfileId: true, omModelProfileId: true },
    });
    if (!agent) return { profiles: [] };

    const profileIds = [agent.modelProfileId, agent.omModelProfileId].filter(Boolean);
    if (profileIds.length === 0) return { profiles: [] };

    const profiles = await db.query.llmProfiles.findMany({
      where: inArray(llmProfiles.id, profileIds),
      columns: { id: true, name: true, modelKey: true },
    });
    return { profiles };
  }

  return {
    getDashboard,
    listAgents,
    getAgent,
    listAgentRecentConversations,
    listAgentExecutionSteps,
    listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages,
    getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots,
    getAgentOmDebugExport,
    debugAgentLongTermMemoryRecallSearch,
    listAgentConversationMessages,
    listAgentContracts,
    listAgentSchedules,
    listAgentNotifications,
    listAgentMcpServers,
    listAgentLlmProfiles,
  };
}
