import {} from '@forge-runtime/core';

import { type AgentListItem, type AgentDetail } from './agents-list';
import { type AgentConversationListItem } from './agents-conversations';
import { type AgentRuntimeMemoryOutput } from './agents-runtime-memory';
import { type AgentExecutionStep } from '../../database/schema-agents';
import { type ScheduleSummary } from './helpers';

/** Shared execution state for all agent read models */
export const AGENT_EXECUTION_STATES = ['idle', 'running', 'absent'] as const;
export type AgentExecutionState = (typeof AGENT_EXECUTION_STATES)[number];

/** Paginated result for listAgentExecutionSteps — derived from AgentExecutionStep schema */
export interface ListAgentExecutionStepsResult {
  items: Array<Omit<AgentExecutionStep, 'id'> & { stepId: string }>;
  hasMore: boolean;
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
  listAgents: () => Promise<AgentListItem[]>;
  getAgent: (agentId: string) => Promise<AgentDetail | null>;
  listAgentRecentConversations: (agentId: string) => Promise<AgentConversationListItem[]>;
  listAgentExecutionSteps: (input: {
    agentId: string;
    limit: number;
    offset: number;
  }) => Promise<ListAgentExecutionStepsResult>;
  listAgentThreadMessages: (params: {
    agentId: string;
    page: number;
    perPage: number;
  }) => Promise<unknown>;
  getAgentRuntimeMemory: (agentId: string) => Promise<AgentRuntimeMemoryOutput | null>;
  listRecentAgentHomeMetricSnapshots: (input: {
    agentId: string;
    limit: number;
  }) => Promise<unknown[]>;
  getAgentOmDebugExport: (agentId: string) => Promise<unknown>;
  listAgentConversationMessages: (params: {
    agentId: string;
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
  }) => Promise<unknown>;
  // Sub-resource queries for fragmented routes (#1587)
  listAgentContracts: (agentId: string) => Promise<unknown>;
  listAgentSchedules: (agentId: string) => Promise<ScheduleSummary[]>;
  listAgentNotifications: (agentId: string) => Promise<unknown>;
  listAgentMcpServers: (agentId: string) => Promise<unknown>;
  listAgentLlmProfiles: (agentId: string) => Promise<unknown>;
}
