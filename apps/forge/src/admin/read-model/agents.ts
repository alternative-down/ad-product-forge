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

import type {Database} from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import { createMicroErpReadModel } from '../../micro-erp/read-model';
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../../agents/ltm/recall';
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

import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;


type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

import { createAgentListReadModel } from './agents-list';
import type { AgentListItem, AgentReadModel } from './agents-types';


interface AgentsReadModelDeps {
  db: Database;
  finance: object;
  internalChat: InternalChatService;
  workspaceBasePath: string;
  systemSettings: object;
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
    const rows = await db.query.agents.findMany({ columns: { id: true, executionState: true, roleId: true } });
    const loadedAgents = registry.list().length;
    const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
    const runningAgents = rows.filter((r) => r.executionState === 'running').length;
    const absentAgents = rows.filter((r) => !r.executionState || r.executionState === 'absent').length;
    const activeContracts = await db.query.agentExecutionContracts.findMany({
      where: eq(agentExecutionContracts.isActive, 1),
      columns: { id: true },
    });
    const roles = new Set(rows.map((r) => r.roleId).filter(Boolean)).size;
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
    const [balanceResult, cashSummary, recentResult] = await Promise.all([
      finance.getCompanyCashBalance(),
      finance.getCompanyCashSummary(),
      finance.listCompanyCashMovements({ limit: RECENT_CASH_MOVEMENT_LIMIT }),
    ]);
    return {
      balanceUsd: balanceResult.balanceUsd,
      summary: { income: cashSummary.totalInUsd, expenses: cashSummary.totalOutUsd, net: cashSummary.netUsd },
      recentMovements: recentResult.items,
    };
  }

  // listAgents and getAgent delegated to agents-list submodule
  const agentListRM = createAgentListReadModel({
    db,
    registry,
    workspaceBasePath,
    systemSettings,
  });
  const listAgents = agentListRM.listAgents;
  const getAgent = agentListRM.getAgent;

  async function listAgentRecentConversations(agentId: string) {
    const rows = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!rows) return [];
    return await listRecentConversations(agentId, 10);
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
    return await listThreadMessages(workspaceBasePath, params.agentId, {
      page: params.page,
      perPage: params.perPage,
    });
  }

  async function listAgentLongTermMemoryThreadMessages(params: {
    agentId: string;
    page: number;
    perPage: number;
  }) {
    return await listThreadMessages(workspaceBasePath, params.agentId, {
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
    client.execute('PRAGMA foreign_keys = ON');
    const conversationStore = new LibsqlConversationStore({ client, tablePrefix: mastraAgentId });

    try {
      await migrateLegacyCheckpointedOmState({ db, agentId, threadId: mastraAgentId, conversationStore });
      const agentWorkspaceRoot = resolve(workspaceBasePath, agentId);
      const agentWorkspaceDir = agent.workspaceFilesystem?.basePath
        ? resolve(agentWorkspaceRoot, agent.workspaceFilesystem.basePath)
        : resolve(agentWorkspaceRoot, 'workspace');
      let agentContext: string | null = null;
      try {
        agentContext = (await readFile(resolve(agentWorkspaceDir, 'context.txt'), 'utf8')).trim() ?? null;
      } catch (err) {
        forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err instanceof Error ? err.message : String(err) } });
        agentContext = null;
      }
      const workingMemory = (await conversationStore.read({ threadId: mastraAgentId, resourceId: mastraAgentId }))?.workingMemory ?? null;
      const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId);
      const settings = await (systemSettings as ReturnType<typeof createSystemSettingsStore>).getSettings();
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
        ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err instanceof Error ? err.message : String(err) } }); return null; })
        : null;
      const persistedLtmState = await withTimeout(
        readLongTermMemoryState(db, agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        `Agent runtime memory persisted LTM state timed out for ${agentId}`,
      ).catch((err) => { forgeDebug({ scope: 'admin-read-model', level: 'error', message: '[safe-catch]', context: { error: err instanceof Error ? err.message : String(err) } }); return null; });
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
      createdAt: row.createdAt,
      activeObservationBlockCount: row.activeObservationBlockCount ?? null,
      activeReflectionBlockCount: row.activeReflectionBlockCount ?? null,
      rawMessageCount: row.rawMessageCount ?? null,
      recentRawMessageCount: row.recentRawMessageCount ?? null,
      recentRawTokenCount: row.recentRawTokenCount ?? null,
      recentRawTokenLimit: row.recentRawTokenLimit ?? null,
      overflowMessageCount: row.overflowMessageCount ?? null,
      overflowTokenCount: row.overflowTokenCount ?? null,
      observationTokenCount: row.observationTokenCount ?? null,
      observationTriggerTokenLimit: row.observationTriggerTokenLimit ?? null,
      reflectionTokenCount: row.reflectionTokenCount ?? null,
      reflectionTriggerTokenLimit: row.reflectionTriggerTokenLimit ?? null,
      checkpointTokenCount: row.checkpointTokenCount ?? null,
    }));
  }

  async function getAgentOmDebugExport(agentId: string) {
    const [agent, runtimeMemory, snapshots] = await Promise.all([
      getAgent(agentId),
      withTimeout(
        getAgentRuntimeMemory(agentId),
        ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
        'getAgentOmDebugExport: runtime memory timed out',
      ).catch((err) => {
        forgeDebug({ scope: 'admin-read-model-agents', level: 'warn', message: 'getAgentRuntimeStatus: agent not loaded', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
        return null;
      }),
      listRecentAgentHomeMetricSnapshots({ agentId, limit: 100 }),
    ]);
    if (!agent) return null;
    const ltm = await withTimeout(
      readLongTermMemoryState(db, agentId),
      ADMIN_OBSERVABILITY_READ_TIMEOUT_MS,
      'getAgentOmDebugExport: LTM state timed out',
    ).catch((err) => {
      forgeDebug({ scope: 'admin-read-model-agents', level: 'warn', message: 'getAgentRuntimeStatus: LTM recall not available', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      return null;
    });
    return {
      agent,
      runtimeMemory,
      snapshots,
      ltm,
    };
  }

  async function debugAgentLongTermMemoryRecallSearch(
    agentId: string,
    input: AgentLongTermMemoryRecallDebugSearchInput,
  ) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return null;
    const ltmRecall = await readLongTermMemoryRecallSnapshot(db, agentId, input);
    return { ltmRecall };
  }

  async function listAgentConversationMessages(params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) {
    const messages = await (internalChat as InternalChatService).listMessages({
      provider: params.provider,
      targetKey: params.targetKey,
      limit: params.limit,
      offset: params.offset,
    });
    return {
      items: messages.map((message: CommunicationMessageView) => ({ ...message, authorAgentId: null })),
      hasMore: false,
    };
  }

  async function listAgentContracts(agentId: string) {
    const rows = await db.query.agentExecutionContracts.findMany({
      where: eq(agentExecutionContracts.agentId, agentId),
      orderBy: desc(agentExecutionContracts.startsAt),
    });
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      budgetUsd: row.budgetUsd,
      autoRenew: row.autoRenew,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async function listAgentSchedules(agentId: string) {
    const rows = await db.query.agentSchedules.findMany({
      where: eq(agentSchedules.agentId, agentId),
      orderBy: desc(agentSchedules.createdAt),
    });
    return rows.map(toScheduleSummaryHelper);
  }

  async function listAgentNotifications(agentId: string) {
    const rows = await db.query.agentNotifications.findMany({
      where: eq(agentNotifications.agentId, agentId),
      orderBy: desc(agentNotifications.createdAt),
      limit: 50,
    });
    return rows.map((n) => ({
      id: n.id,
      content: n.content,
      createdAt: n.createdAt,
      readAt: n.readAt,
    }));
  }

  async function listAgentMcpServers(agentId: string) {
    const rows = await db.query.agentMcpConfigs.findMany({
      where: eq(agentMcpConfigs.agentId, agentId),
    });
    const serverIds = rows.map((r) => r.serverId).filter(Boolean);
    const servers = serverIds.length > 0
      ? await db.query.mcpServerConfigs.findMany({ where: inArray(mcpServerConfigs.id, serverIds) })
      : [];
    const serverIdToLink = new Map(rows.map((link) => [link.serverId, link]));
    return servers.map((server) => {
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