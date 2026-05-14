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
import { readLongTermMemoryState, readLongTermMemoryRecallSnapshot } from './helpers-ltm';
import { closeLibsqlClient, listRecentConversations, listThreadMessages } from './conversation-helpers';
import {
  toScheduleSummary as toScheduleSummaryHelper,
  extractLatestMessagePreview,
  extractLatestMessageToolBadge,
} from './helpers';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';
import { listAgentWorkspaceSkills } from '../../agents/workspace-skills';

import type {Database} from '../../database/index';
import { createSystemSettingsStore } from '../../system-settings/store';
import { createMicroErpReadModel } from '../../micro-erp/read-model';
import type { InternalChatService } from '../../communication/internal-chat-service';
import { forgeDebug } from '@forge-runtime/core';
import {
  toMastraSafeIdentifier,
  LibsqlConversationStore,
  readOperationalMemoryState,
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';

import { ADMIN_OBSERVABILITY_READ_TIMEOUT_MS } from './constants';
const RECENT_CASH_MOVEMENT_LIMIT = 10;
const RECENT_STEP_LIMIT = 10;
const RECENT_NOTIFICATION_LIMIT = 10;


import { createAgentListReadModel } from './agents-list';
import { createAgentConversationsReadModel } from './agents-conversations';
import { createAgentMetricsReadModel } from './agents-metrics';
import { createAgentDetailReadModel } from './agents-detail';
import { createAgentDebugReadModel } from './agents-debug';
import { createAgentsRuntimeMemoryReadModel } from './agents-runtime-memory';
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
    let rows;
      rows = await db.query.agents.findMany({ columns: { id: true, executionState: true, roleId: true } });

    const loadedAgents = registry.list().length;
    const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
    const runningAgents = rows.filter((r) => r.executionState === 'running').length;
    const absentAgents = rows.filter((r) => !r.executionState || r.executionState === 'absent').length;

    let activeContracts;
      activeContracts = await db.query.agentExecutionContracts.findMany({
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
  const conversationsRM = createAgentConversationsReadModel({
    db,
    workspaceBasePath,
    internalChat,
  });
  const metricsRM = createAgentMetricsReadModel({ db });
  const { listRecentAgentHomeMetricSnapshots } = metricsRM;
  const detailRM = createAgentDetailReadModel({ db });
  const {
    listAgentContracts,
    listAgentSchedules,
    listAgentNotifications,
    listAgentMcpServers,
    listAgentLlmProfiles,
  } = detailRM;

  const agentListRM = createAgentListReadModel({
    db,
    registry,
    workspaceBasePath,
    systemSettings,
  });
  const listAgents = agentListRM.listAgents;
  const getAgent = agentListRM.getAgent;
  const {
    listAgentRecentConversations,
    listAgentConversationMessages,
    listAgentThreadMessages,
    listAgentLongTermMemoryThreadMessages,
  } = conversationsRM;

  async function listAgentExecutionSteps(input: { agentId: string; limit: number; offset: number }) {
    let rows;
      rows = await db.query.agentExecutionSteps.findMany({
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



  const debugRM = createAgentDebugReadModel({
    db,
    getAgent,
    
    getAgentRuntimeMemory,
    listRecentAgentHomeMetricSnapshots,
  });
  const {
    getAgentOmDebugExport,
    debugAgentLongTermMemoryRecallSearch,
  } = debugRM;

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
