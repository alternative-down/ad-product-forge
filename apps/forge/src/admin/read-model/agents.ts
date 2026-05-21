import { desc, eq } from 'drizzle-orm';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';

import {
  agentExecutionContracts,
  agentExecutionSteps,
} from '../../database/schema';

import type {Database} from '../../database/index';
import type { MicroErpReadModel } from '../../micro-erp/read-model';
import type { InternalChatService } from '../../communication/internal-chat-service';

const RECENT_CASH_MOVEMENT_LIMIT = 10;

import type { AgentListItem, AgentReadModel } from './agents-types';
import { createAgentConversationsReadModel } from './agents-conversations';
import { createAgentMetricsReadModel } from './agents-metrics';
import { createAgentDetailReadModel } from './agents-detail';
import { createAgentListReadModel } from './agents-list';
import { createAgentDebugReadModel } from './agents-debug';
import { createAgentsRuntimeMemoryReadModel } from './agents-runtime-memory';

interface AgentsReadModelDeps {
  db: Database;
  finance: MicroErpReadModel;
  internalChat: InternalChatService;
  workspaceBasePath: string;
}

export function createAgentReadModel(deps: AgentsReadModelDeps): AgentReadModel {
  const {
    db,
    finance,
    internalChat,
    workspaceBasePath,
  } = deps;

  const registry = getInternalAgentRegistry();
   
  const registryWithSize = registry as unknown as { get(agentId: string): unknown; size: number };

  async function getDashboard() {
    const [totals, cash] = await Promise.all([getTotals(), getCashData()]);
    return { totals, cash };
  }

  async function getTotals() {
    const rows = await db.query.agents.findMany({ columns: { id: true, executionState: true, roleId: true } });

    const loadedAgents = registry.list().length;
    const idleAgents = rows.filter((r) => r.executionState === 'idle').length;
    const runningAgents = rows.filter((r) => r.executionState === 'running').length;
    const absentAgents = rows.filter((r) => r.executionState === null || r.executionState === undefined || r.executionState === 'absent').length;

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
    registry: registryWithSize,
    workspaceBasePath,
  });
  const { getAgentRuntimeMemory } = createAgentsRuntimeMemoryReadModel({
    db,
    registry: getInternalAgentRegistry(),
    workspaceBasePath,
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

  const debugRM = createAgentDebugReadModel({
    db,
    workspaceBasePath,
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
  listRecentAgentHomeMetricSnapshots,
  getAgentOmDebugExport,
  debugAgentLongTermMemoryRecallSearch,
  listAgentConversationMessages,
  listAgentContracts,
  listAgentSchedules,
  listAgentNotifications,
  listAgentMcpServers,
  listAgentLlmProfiles,
  getAgentRuntimeMemory,
};
}
