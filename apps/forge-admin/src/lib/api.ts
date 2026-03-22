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

export type AdminFinance = {
  balanceUsd: number;
  summary: AdminOverview['cash']['summary'];
  movements: {
    items: AdminOverview['cash']['recentMovements'];
    total: number;
  };
  recurringPayables: Array<{
    payableId: string;
    name: string;
    description?: string;
    amountUsd: number;
    recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    nextDueAt: number;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
};

export type AgentListItem = {
  agentId: string;
  name: string;
  description?: string;
  executionState: 'idle' | 'running';
  functionId: string | null;
  functionName: string | null;
  modelProfile: {
    profileId: string;
    label: string;
    providerType: string;
    modelId: string;
  } | null;
  omModelProfile: {
    profileId: string;
    label: string;
    providerType: string;
    modelId: string;
  } | null;
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
  modelProfile: AgentListItem['modelProfile'];
  omModelProfile: AgentListItem['omModelProfile'];
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
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
    contractCostMultiplier: number;
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

export type SystemIntegration =
  | {
      providerType: 'migadu';
      isEnabled: boolean;
      config: {
        apiUser: string;
        apiKey: string;
      };
      createdAt: number;
      updatedAt: number;
    }
  | {
      providerType: 'coolify';
      isEnabled: boolean;
      config: {
        baseUrl: string;
        adminToken: string;
        applicationsBaseDomain?: string;
      };
      createdAt: number;
      updatedAt: number;
    }
  | {
      providerType: 'github';
      isEnabled: boolean;
      config: {
        organization: string;
        appHomeUrl: string;
      };
      createdAt: number;
      updatedAt: number;
    };

export type LlmProfile = {
  profileId: string;
  slug: string;
  label: string;
  providerType: 'openai-codex' | 'claude-max' | 'minimax';
  modelId: string;
  pricingModelKey: string;
  oauthModelKey: string;
  apiKey: string | null;
  hasApiKey: boolean;
  contractCostMultiplier: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SystemLlmDefaults = {
  primaryProfileId: string;
  omProfileId: string;
  hiringRhProfileId: string;
  createdAt: number;
  updatedAt: number;
};

export type SystemLlmResponse = {
  defaults: SystemLlmDefaults;
  profiles: LlmProfile[];
  supportedProviders: Array<{
    providerType: 'openai-codex' | 'claude-max' | 'minimax';
    label: string;
    modelIds: string[];
  }>;
};

export type SystemOauthState = {
  storePath: string;
  providers: Array<{
    providerId: 'openai-codex' | 'anthropic';
    sourcePath: string;
    sourcePresent: boolean;
    synced: boolean;
    hasRefresh: boolean;
    expiresAt: number | null;
    accountId: string | null;
  }>;
};

export type SyncOauthResult = {
  state: SystemOauthState;
  results: Array<{
    providerId: 'openai-codex' | 'anthropic';
    synced: boolean;
    error?: string;
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

export type UpsertSystemIntegrationInput =
  | {
      providerType: 'migadu';
      isEnabled: boolean;
      config: {
        apiUser: string;
        apiKey: string;
      };
    }
  | {
      providerType: 'coolify';
      isEnabled: boolean;
      config: {
        baseUrl: string;
        adminToken: string;
        applicationsBaseDomain?: string;
      };
    }
  | {
      providerType: 'github';
      isEnabled: boolean;
      config: {
        organization: string;
        appHomeUrl: string;
      };
    };

export type UpsertLlmProfileInput = {
  profileId?: string;
  slug: string;
  label: string;
  providerType: 'openai-codex' | 'claude-max' | 'minimax';
  modelId: string;
  apiKey?: string | null;
  contractCostMultiplier: number;
  isEnabled: boolean;
};

export type UpdateSystemLlmDefaultsInput = {
  primaryProfileId: string;
  omProfileId: string;
  hiringRhProfileId: string;
};

export type CreateInvestmentInput = {
  amountUsd: number;
  description?: string;
  effectiveAt?: string;
};

export type CreatePayableInput =
  | {
      kind: 'single';
      name: string;
      description?: string;
      amountUsd: number;
      dueAt: string;
    }
  | {
      kind: 'recurring';
      name: string;
      description?: string;
      amountUsd: number;
      dueAt: string;
      recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    };

export class AdminApiKeyError extends Error {
  constructor(message = 'Invalid admin API key') {
    super(message);
    this.name = 'AdminApiKeyError';
  }
}

const ADMIN_API_KEY_STORAGE_KEY = 'forgeAdminApiKey';
const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

function stripTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getConfiguredApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_FORGE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return stripTrailingSlash(configuredBaseUrl);
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.startsWith('forge-admin.')) {
    return `${protocol}//forge.${hostname.slice('forge-admin.'.length)}`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${port || '3011'}`;
  }

  return '';
}

const API_BASE_URL = getConfiguredApiBaseUrl();

export function getStoredAdminApiKey() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(ADMIN_API_KEY_STORAGE_KEY)?.trim() ?? '';
}

export function setStoredAdminApiKey(value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextValue = value.trim();

  if (nextValue) {
    window.localStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, nextValue);
  } else {
    window.localStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
  }
}

function buildApiUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL}${path}`;
}

async function request<TResponse>(path: string, init?: RequestInit) {
  const adminApiKey = getStoredAdminApiKey();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(adminApiKey ? { [ADMIN_API_KEY_HEADER]: adminApiKey } : {}),
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

    if (response.status === 401) {
      throw new AdminApiKeyError(message);
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

export function listSystemIntegrations() {
  return request<SystemIntegration[]>('/admin/system/integrations');
}

export function getFinance() {
  return request<AdminFinance>('/admin/finance');
}

export function getSystemLlm() {
  return request<SystemLlmResponse>('/admin/system/llm');
}

export function getSystemOauth() {
  return request<SystemOauthState>('/admin/system/oauth');
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
  return request<{ roleId: string; toolId: string }>(
    '/admin/role-tool-permission/remove',
    {
      method: 'POST',
      body: JSON.stringify({ roleId, toolId }),
    },
  );
}

export function upsertSystemIntegration(input: UpsertSystemIntegrationInput) {
  return request<SystemIntegration>('/admin/system/integration/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteSystemIntegration(providerType: 'migadu' | 'coolify' | 'github') {
  return request<{ success: true; providerType: 'migadu' | 'coolify' | 'github' }>(
    '/admin/system/integration/delete',
    {
      method: 'POST',
      body: JSON.stringify({ providerType }),
    },
  );
}

export function upsertLlmProfile(input: UpsertLlmProfileInput) {
  return request<LlmProfile>('/admin/system/llm/profile/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteLlmProfile(profileId: string) {
  return request<{ success: true; profileId: string }>('/admin/system/llm/profile/delete', {
    method: 'POST',
    body: JSON.stringify({ profileId }),
  });
}

export function updateSystemLlmDefaults(input: UpdateSystemLlmDefaultsInput) {
  return request<SystemLlmDefaults>('/admin/system/llm/defaults/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncSystemOauth(providerId: 'openai-codex' | 'anthropic' | 'all') {
  return request<SyncOauthResult>('/admin/system/oauth/sync', {
    method: 'POST',
    body: JSON.stringify({ providerId }),
  });
}

export function createInvestment(input: CreateInvestmentInput) {
  return request<{ success: true }>('/admin/finance/investment/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createPayable(input: CreatePayableInput) {
  return request<{ kind: 'single' | 'recurring'; entryId: string; payableId?: string }>(
    '/admin/finance/payable/create',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function postPlannedLedgerEntry(entryId: string, effectiveAt?: string) {
  return request<{ entryId: string; status: 'posted'; effectiveAt: number }>(
    '/admin/finance/ledger/post',
    {
      method: 'POST',
      body: JSON.stringify({ entryId, effectiveAt }),
    },
  );
}

export function cancelPlannedLedgerEntry(entryId: string) {
  return request<{ entryId: string; status: 'canceled' }>(
    '/admin/finance/ledger/cancel',
    {
      method: 'POST',
      body: JSON.stringify({ entryId }),
    },
  );
}

export function setRecurringPayableActive(payableId: string, isActive: boolean) {
  return request<{ payableId: string; isActive: boolean }>(
    '/admin/finance/recurring-payable/set-active',
    {
      method: 'POST',
      body: JSON.stringify({ payableId, isActive }),
    },
  );
}
