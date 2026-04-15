import { request } from './core';
import type {
  AgentConversationMessagesResponse,
  AgentDetail,
  AgentExecutionStepsResponse,
  AgentListItem,
  AgentRecentConversation,
  AgentRuntimeMemorySnapshot,
  AgentMcpServerInput,
  AgentSchedule,
  AgentThreadMessagesResponse,
  AdjustAgentContractBudgetInput,
  CreateScheduleInput,
  DeleteAgentSkillInput,
  HireAgentInput,
  HireAgentResult,
  TopUpAgentContractInput,
  UpdateAgentMcpServerInput,
  UpdateScheduleInput,
  UploadAgentSkillsInput,
  UpsertAgentProviderInput,
} from './types';

export function getAgents() {
  return request<AgentListItem[]>('/admin/agents');
}

export function getAgent(agentId: string) {
  return request<AgentDetail>(`/admin/agent?agentId=${encodeURIComponent(agentId)}`);
}

export function getAgentRecentConversations(agentId: string) {
  return request<AgentRecentConversation[]>(
    `/admin/agent/recent-conversations?agentId=${encodeURIComponent(agentId)}`,
  );
}

export function reloadAgent(agentId: string) {
  return request<{ success: true; agentId: string }>('/admin/agent/reload', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function forceAgentIdle(agentId: string) {
  return request<{ success: true; agentId: string }>('/admin/agent/force-idle', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function rewakeupAgent(agentId: string) {
  return request<{ success: true; agentId: string }>('/admin/agent/rewakeup', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function getAgentExecutionSteps(agentId: string, limit: number, offset: number) {
  return request<AgentExecutionStepsResponse>(
    `/admin/agent/execution-steps?agentId=${encodeURIComponent(agentId)}&limit=${limit}&offset=${offset}`,
  );
}

export function getAgentThreadMessages(agentId: string, page: number, perPage: number) {
  return request<AgentThreadMessagesResponse>(
    `/admin/agent/thread-messages?agentId=${encodeURIComponent(agentId)}&page=${page}&perPage=${perPage}`,
  );
}

export function getAgentLongTermMemoryThreadMessages(agentId: string, page: number, perPage: number) {
  return request<AgentThreadMessagesResponse>(
    `/admin/agent/ltm-thread-messages?agentId=${encodeURIComponent(agentId)}&page=${page}&perPage=${perPage}`,
  );
}

export function getAgentRuntimeMemory(agentId: string) {
  return request<AgentRuntimeMemorySnapshot>(
    `/admin/agent/runtime-memory?agentId=${encodeURIComponent(agentId)}`,
  );
}

export function getAgentConversationMessages(
  agentId: string,
  provider: string,
  targetKey: string,
  limit: number,
  offset: number,
) {
  return request<AgentConversationMessagesResponse>(
    `/admin/agent/conversation-messages?agentId=${encodeURIComponent(agentId)}&provider=${encodeURIComponent(provider)}&targetKey=${encodeURIComponent(targetKey)}&limit=${limit}&offset=${offset}`,
  );
}

export function upsertAgentProvider(input: UpsertAgentProviderInput) {
  return request<{ success: true; agentId: string; providerType: string }>('/admin/agent-provider/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteAgentProvider(agentId: string, providerType: 'discord' | 'email') {
  return request<{ success: true; agentId: string; providerType: string }>('/admin/agent-provider/delete', {
    method: 'POST',
    body: JSON.stringify({ agentId, providerType }),
  });
}

export function updateAgentConfig(input: {
  agentId: string;
  name: string;
  description?: string | null;
  instructions: string;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
  modelProfileId: string;
  omModelProfileId: string;
}) {
  return request<{ success: true; agentId: string }>('/admin/agent/update-config', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function changeAgentRole(input: {
  agentId: string;
  roleId: string;
}) {
  return request<{ success: true; agentId: string; roleId: string }>('/admin/agent/change-role', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAgentGitHubManifestConfig(input: {
  agentId: string;
  manifestConfig: NonNullable<AgentDetail['githubProvisioning']>['manifestConfig'];
}) {
  return request<NonNullable<AgentDetail['githubProvisioning']>>('/admin/agent/github-manifest-config/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function topUpAgentContract(input: TopUpAgentContractInput) {
  return request<{
    agentId: string;
    contractId: string;
    budgetUsd: number;
  }>('/admin/agent/contract/top-up', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function adjustAgentContractBudget(input: AdjustAgentContractBudgetInput) {
  return request<{
    agentId: string;
    contractId: string;
    previousBudgetUsd: number;
    newBudgetUsd: number;
    changeAmountUsd: number;
    changeType: 'none' | 'increase' | 'decrease';
  }>('/admin/agent/contract/adjust-budget', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function renewAgentContract(input: import('./finance-types').RenewAgentContractInput) {
  return request<{
    agentId: string;
    previousContractId: string;
    newContractId: string;
    previousBudgetUsd: number;
    previousSpentUsd: number;
    refundedUsd: number;
    newBudgetUsd: number;
    startsAt: number;
    endsAt: number;
  }>('/admin/agent/contract/renew', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function hireAgent(input: HireAgentInput) {
  return request<HireAgentResult>('/admin/agent/hire', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function terminateAgent(agentId: string) {
  return request<{ agentId: string }>('/admin/agent/terminate', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function createAgentMcpServer(input: AgentMcpServerInput) {
  return request<{ success: true; agentId: string; configId: string; serverId: string }>('/admin/agent-mcp/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAgentMcpServer(input: UpdateAgentMcpServerInput) {
  return request<{ success: true; agentId: string; configId: string; serverId: string }>('/admin/agent-mcp/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteAgentMcpServer(input: {
  agentId: string;
  configId: string;
  serverId: string;
}) {
  return request<{ success: true; agentId: string; configId: string; serverId: string }>('/admin/agent-mcp/delete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function assignAgentMcpServer(input: {
  agentId: string;
  serverId: string;
  isActive?: boolean;
}) {
  return request<{ success: true; agentId: string; configId: string; serverId: string }>('/admin/agent-mcp/assign', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setAgentMcpServerActive(input: {
  agentId: string;
  configId: string;
  isActive: boolean;
}) {
  return request<{ success: true; agentId: string; configId: string; isActive: boolean }>('/admin/agent-mcp/set-active', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function detachAgentMcpServer(input: {
  agentId: string;
  configId: string;
}) {
  return request<{ success: true; agentId: string; configId: string }>('/admin/agent-mcp/detach', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function uploadAgentSkills(input: UploadAgentSkillsInput) {
  return request<{ success: true; agentId: string; installedSkillNames: string[] }>('/admin/agent-skills/upload', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteAgentSkill(input: DeleteAgentSkillInput) {
  return request<{ success: true; agentId: string; skillName: string }>('/admin/agent-skills/delete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function installGlobalSkillForAgent(input: {
  agentId: string;
  skillName: string;
}) {
  return request<{ success: true; agentId: string; skillName: string }>('/admin/agent-skills/install-global', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function publishAgentSkillToGlobalCatalog(input: {
  agentId: string;
  skillName: string;
}) {
  return request<{ success: true; agentId: string; skillName: string }>('/admin/agent-skills/publish-global', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createSchedule(input: CreateScheduleInput) {
  return request<AgentSchedule>('/admin/agent-schedule/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSchedule(input: UpdateScheduleInput) {
  return request<AgentSchedule>('/admin/agent-schedule/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteSchedule(agentId: string, scheduleId: string) {
  return request<{ success: boolean }>('/admin/agent-schedule/delete', {
    method: 'POST',
    body: JSON.stringify({ agentId, scheduleId }),
  });
}
