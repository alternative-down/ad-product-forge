import type { Database } from '../../database/index';
import type { InternalChatService } from '../../communication/internal-chat-service';
import type { AgentLongTermMemoryRecallDebugSearchInput } from '../../agents/ltm/recall';
import {
  type CommunicationMessageView,
  type CommunicationProviderMessage,
} from '@forge-runtime/core';



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


