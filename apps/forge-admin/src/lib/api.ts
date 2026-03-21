export type AdminOverview = {
  totals: {
    agents: number;
    loadedAgents: number;
    idleAgents: number;
    runningAgents: number;
    functions: number;
    roles: number;
    activeContracts: number;
  };
  cash: {
    balanceUsd: number;
    summary: {
      periodStart: number;
      periodEnd: number;
      totalInUsd: number;
      totalOutUsd: number;
      netUsd: number;
      balanceUsd: number;
      scheduledInUsd: number;
      scheduledOutUsd: number;
    };
    recentMovements: Array<{
      id: string;
      type: string;
      direction: 'in' | 'out';
      amountUsd: number;
      description?: string;
      status: string;
      dueAt?: number;
      effectiveAt?: number;
      createdAt: number;
    }>;
  };
};

export type AgentListItem = {
  agentId: string;
  name: string;
  description?: string;
  executionState: 'idle' | 'running';
  functionId: string | null;
  functionName: string | null;
  model: string;
  omModel?: string;
  loaded: boolean;
  runner: {
    stopped: boolean;
    instant: boolean;
    executing: boolean;
    scheduled: boolean;
    backoffMs: number;
  } | null;
  providerTypes: string[];
  createdAt: number;
  updatedAt: number;
};

export type AgentSchedule = {
  scheduleId: string;
  kind: 'agent' | 'heartbeat';
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
  timezone: string;
  content: string;
  isActive: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type AgentDetail = {
  agentId: string;
  name: string;
  description?: string;
  instructions: string;
  executionState: 'idle' | 'running';
  model: string;
  omModel?: string;
  function: {
    functionId: string;
    name: string;
    description?: string;
    roleId: string | null;
    roleName: string | null;
  } | null;
  loaded: boolean;
  runner: AgentListItem['runner'];
  workspace: {
    autoSync: boolean;
    bm25: boolean;
    embedder: string;
    filesystem: unknown;
    sandbox: unknown;
  };
  providers: Array<{
    providerType: string;
    createdAt: number;
    editable: boolean;
    credentials: unknown;
  }>;
  activeContract: {
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyValueUsd: number;
    autoRenew: boolean;
  } | null;
  schedules: AgentSchedule[];
  heartbeat: AgentSchedule | null;
  recentExecutionSteps: Array<{
    stepId: string;
    kind: string;
    modelKey: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    costUsd: number;
    createdAt: number;
  }>;
  recentNotifications: Array<{
    notificationId: string;
    content: string;
    timestamp: number;
    read: boolean;
  }>;
  recentConversations: Array<{
    conversationId: string;
    provider: string;
    name?: string;
    contactSlug?: string;
    contactDisplayName?: string;
    updatedAt: string;
    messages: Array<{
      messageId: string;
      content: string;
      unread: boolean;
      authorDisplayName?: string;
      createdAt: string;
    }>;
  }>;
  createdAt: number;
  updatedAt: number;
};

export type UpdateAgentConfigInput = {
  agentId: string;
  name: string;
  description?: string | null;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
  workspaceEmbedder: string;
  workspaceFilesystemBasePath?: string | null;
  workspaceSandboxWorkingDirectory?: string | null;
};

export type UpsertAgentProviderInput = {
  agentId: string;
  providerType: 'discord' | 'email';
  credentials: unknown;
};

export type AgentFunction = {
  functionId: string;
  name: string;
  description?: string;
  roleId: string | null;
  createdAt: number;
  updatedAt: number;
  assignedAgentCount: number;
};

export type HireAgentInput = {
  requestedFunction: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
};

export type HireAgentResult = {
  agentId: string;
  emailAddress: string;
  githubAppRegistrationUrl: string;
};

export type RoleListResponse = {
  availableToolIds: string[];
  items: Array<{
    roleId: string;
    name: string;
    description?: string;
    assignedFunctionCount: number;
    toolIds: string[];
    workflowIds: string[];
    createdAt: number;
    updatedAt: number;
  }>;
};

export type CreateScheduleInput = {
  agentId: string;
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: string;
  timezone: string;
  content: string;
};

export type UpdateScheduleInput = {
  agentId: string;
  scheduleId: string;
  name?: string;
  description?: string | null;
  scheduleType?: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: string | null;
  timezone?: string;
  content?: string;
  isActive?: boolean;
};

async function request<TResponse>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Keep HTTP fallback.
    }

    throw new Error(message);
  }

  return response.json() as Promise<TResponse>;
}

export function getOverview() {
  return request<AdminOverview>('/admin/overview');
}

export function listAgents() {
  return request<AgentListItem[]>('/admin/agents');
}

export function getAgent(agentId: string) {
  return request<AgentDetail>(`/admin/agent?agentId=${encodeURIComponent(agentId)}`);
}

export function listFunctions() {
  return request<AgentFunction[]>('/admin/functions');
}

export function listRoles() {
  return request<RoleListResponse>('/admin/roles');
}

export function wakeAgent(agentId: string) {
  return request<{ success: true }>('/admin/agent/wake', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export function reloadAgent(agentId: string) {
  return request<{ success: true; agentId: string }>('/admin/agent/reload', {
    method: 'POST',
    body: JSON.stringify({ agentId }),
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

export function changeAgentFunction(agentId: string, functionId: string) {
  return request<{
    agentId: string;
    functionId: string;
    functionName: string;
    changedBy: string;
  }>('/admin/agent/change-function', {
    method: 'POST',
    body: JSON.stringify({ agentId, functionId }),
  });
}

export function updateAgentConfig(input: UpdateAgentConfigInput) {
  return request<{ success: true; agentId: string }>('/admin/agent/update-config', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function upsertAgentProvider(input: UpsertAgentProviderInput) {
  return request<{ success: true; agentId: string; providerType: string }>(
    '/admin/agent-provider/upsert',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteAgentProvider(agentId: string, providerType: 'discord' | 'email') {
  return request<{ success: true; agentId: string; providerType: string }>(
    '/admin/agent-provider/delete',
    {
      method: 'POST',
      body: JSON.stringify({ agentId, providerType }),
    },
  );
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

export function addRoleToolPermission(roleId: string, toolId: string) {
  return request<{ roleId: string; toolId: string }>('/admin/role-tool-permission/add', {
    method: 'POST',
    body: JSON.stringify({ roleId, toolId }),
  });
}

export function removeRoleToolPermission(roleId: string, toolId: string) {
  return request<{ roleId: string; toolId: string; success: boolean }>(
    '/admin/role-tool-permission/remove',
    {
      method: 'POST',
      body: JSON.stringify({ roleId, toolId }),
    },
  );
}
