const ADMIN_API_KEY_HEADER = 'x-forge-admin-api-key';

import { getStoredAdminSecret } from '@/lib/admin-secret';

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

function buildApiUrl(path: string) {
  const baseUrl = getConfiguredApiBaseUrl();

  if (!baseUrl) {
    return path;
  }

  return `${baseUrl}${path}`;
}

async function request<TResponse>(path: string, init?: RequestInit) {
  const secret = getStoredAdminSecret();
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(secret ? { [ADMIN_API_KEY_HEADER]: secret } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = 'Não foi possível concluir a operação.';

    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<TResponse>;
}

export type SystemSettings = {
  companyName: string;
  companyContext: string;
  stepDelayEnabled: boolean;
};

export type AgentListItem = {
  agentId: string;
  name: string;
  description?: string;
  executionState: 'idle' | 'running';
  roleId: string | null;
  roleName: string | null;
  modelProfile: {
    profileId: string;
    name: string;
    modelKey: string;
  } | null;
  omModelProfile: {
    profileId: string;
    name: string;
    modelKey: string;
  } | null;
  loaded: boolean;
  runner: {
    stopped: boolean;
    instant: boolean;
    executing: boolean;
    scheduled: boolean;
    backoffMs: number;
    nextStepAt: number | null;
    estimatedDelayMs: number | null;
    lastWakeStartedAt: number | null;
    wake: {
      pending: boolean;
      waitingForIdle: boolean;
      firstPendingAt: number | null;
      nextTriggerAt: number | null;
    };
  } | null;
  providerTypes: string[];
  createdAt: number;
  updatedAt: number;
};

export type AgentDetail = {
  agentId: string;
  name: string;
  description?: string;
  instructions: string;
  executionState: 'idle' | 'running';
  role: {
    roleId: string;
    name: string;
    description?: string | null;
  } | null;
  providers: Array<{
    providerType: string;
    createdAt: number;
    editable: boolean;
    credentials: unknown;
  }>;
  githubProvisioning: {
    agentId: string;
    status: 'pending' | 'created' | 'active';
    registrationUrl: string;
    installUrl?: string;
  } | null;
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
  recentExecutionSteps: Array<{
    stepId: string;
    llmProfileId: string;
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
  recentConversations: Array<{
    conversationId: string;
    conversationKey: string;
    provider: string;
    type: string;
    name?: string;
    participants: string[];
    updatedAt: number;
    messages: Array<{
      messageId: string;
      content: string;
      unread: boolean;
      authorDisplayName: string;
      createdAt: number;
    }>;
  }>;
};

export type AgentExecutionStepsResponse = {
  items: AgentDetail['recentExecutionSteps'];
  hasMore: boolean;
};

export type AgentThreadMessage = {
  id: string;
  role: string;
  createdAt: number;
  threadId: string | null;
  resourceId: string | null;
  type: string | null;
  content: {
    content?: string;
    reasoning?: string;
    parts?: Array<Record<string, unknown>>;
    toolInvocations?: Array<Record<string, unknown>>;
  };
};

export type AgentThreadMessagesResponse = {
  items: AgentThreadMessage[];
  hasMore: boolean;
};

export type AgentConversationMessage = {
  messageId: string;
  provider: string;
  authorId: string;
  targetKey: string;
  content: string;
  attachments?: unknown[];
  unread: boolean;
  createdAt: string;
  authorDisplayName: string;
};

export type AgentConversationMessagesResponse = {
  items: AgentConversationMessage[];
  hasMore: boolean;
};

export type LlmProfile = {
  profileId: string;
  name: string;
  modelKey: string;
  baseUrl: string | null;
  apiKey: string;
  contractCostMultiplier: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SystemLlmResponse = {
  defaults: {
    primaryProfileId: string;
    omProfileId: string;
    hiringRhProfileId: string;
    createdAt: number;
    updatedAt: number;
  } | null;
  profiles: LlmProfile[];
  prices: Array<{
    modelKey: string;
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
    createdAt: number;
    updatedAt: number;
  }>;
};

export type UpsertLlmProfileInput = {
  profileId?: string;
  name: string;
  modelKey: string;
  baseUrl?: string | null;
  apiKey: string;
  contractCostMultiplier: number;
  isEnabled: boolean;
};

export type UpsertLlmModelPriceInput = {
  modelKey: string;
  inputPerMillionUsd: number;
  inputCachePerMillionUsd: number;
  outputPerMillionUsd: number;
};

export type UpdateLlmDefaultsInput = {
  primaryProfileId: string;
  omProfileId: string;
  hiringRhProfileId: string;
};

export type SystemIntegrationProviderType = 'github' | 'coolify' | 'migadu' | 'minimax';

export type RoleItem = {
  roleId: string;
  name: string;
  description?: string | null;
  assignedAgentCount: number;
  toolIds: string[];
  workflowIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RolesResponse = {
  availableToolIds: string[];
  availableWorkflowIds: string[];
  items: RoleItem[];
};

export type AdminFinance = {
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
  movements: {
    items: Array<{
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

export type FinanceContractsResponse = {
  items: Array<{
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyValueUsd: number;
    autoRenew: boolean;
  }>;
};

export type TopUpAgentContractInput = {
  agentId: string;
  amountUsd: number;
};

export type AdjustAgentContractBudgetInput = {
  agentId: string;
  newBudgetUsd: number;
};

export type SystemIntegration =
  | {
      providerType: 'github';
      isEnabled: boolean;
      createdAt: number;
      updatedAt: number;
      config: {
        organization: string;
        appHomeUrl: string;
      } | null;
    }
  | {
      providerType: 'coolify';
      isEnabled: boolean;
      createdAt: number;
      updatedAt: number;
      config: {
        baseUrl: string;
        adminToken: string;
        serverId: string;
        destinationId: string;
        applicationsBaseDomain?: string;
      } | null;
    }
  | {
      providerType: 'migadu';
      isEnabled: boolean;
      createdAt: number;
      updatedAt: number;
      config: {
        apiUser: string;
        apiKey: string;
      } | null;
    }
  | {
      providerType: 'minimax';
      isEnabled: boolean;
      createdAt: number;
      updatedAt: number;
      config: {
        apiKey: string;
      } | null;
    };

export function getSystemSettings() {
  return request<SystemSettings>('/admin/system/settings');
}

export function getAgents() {
  return request<AgentListItem[]>('/admin/agents');
}

export function getAgent(agentId: string) {
  return request<AgentDetail>(`/admin/agent?agentId=${encodeURIComponent(agentId)}`);
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

export function getSystemIntegrations() {
  return request<SystemIntegration[]>('/admin/system/integrations');
}

export function upsertSystemSettings(input: SystemSettings) {
  return request<SystemSettings>('/admin/system/settings/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSystemLlm() {
  return request<SystemLlmResponse>('/admin/system/llm');
}

export function upsertLlmProfile(input: UpsertLlmProfileInput) {
  return request<LlmProfile>('/admin/system/llm/profile/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function upsertLlmModelPrice(input: UpsertLlmModelPriceInput) {
  return request<UpsertLlmModelPriceInput>('/admin/system/llm/price/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLlmDefaults(input: UpdateLlmDefaultsInput) {
  return request<UpdateLlmDefaultsInput>('/admin/system/llm/defaults/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function upsertSystemIntegration(
  input:
    | {
        providerType: 'github';
        isEnabled: boolean;
        config: {
          organization: string;
          appHomeUrl: string;
        };
      }
    | {
        providerType: 'coolify';
        isEnabled: boolean;
        config: {
          baseUrl: string;
          adminToken: string;
          serverId: string;
          destinationId: string;
          applicationsBaseDomain?: string;
        };
      }
    | {
        providerType: 'migadu';
        isEnabled: boolean;
        config: {
          apiUser: string;
          apiKey: string;
        };
      }
    | {
        providerType: 'minimax';
        isEnabled: boolean;
        config: {
          apiKey: string;
        };
      },
) {
  return request<SystemIntegration>('/admin/system/integration/upsert', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getRoles() {
  return request<RolesResponse>('/admin/roles');
}

export function getFinance() {
  return request<AdminFinance>('/admin/finance');
}

export function getFinanceContracts() {
  return request<FinanceContractsResponse>('/admin/finance/contracts');
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

export function createRole(input: {
  name: string;
  description?: string;
}) {
  return request<RoleItem>('/admin/role/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRole(input: {
  roleId: string;
  name?: string;
  description?: string | null;
}) {
  return request<RoleItem>('/admin/role/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteRole(roleId: string) {
  return request<{ success?: boolean; roleId?: string }>('/admin/role/delete', {
    method: 'POST',
    body: JSON.stringify({ roleId }),
  });
}

export function addRoleToolPermission(input: {
  roleId: string;
  toolId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-tool-permission/add', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeRoleToolPermission(input: {
  roleId: string;
  toolId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-tool-permission/remove', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function validateAdminSecret(secret: string) {
  const response = await fetch(buildApiUrl('/admin/overview'), {
    headers: {
      'content-type': 'application/json',
      [ADMIN_API_KEY_HEADER]: secret.trim(),
    },
  });

  if (response.ok) {
    return {
      valid: true as const,
      message: null,
    };
  }

  let message = 'Não foi possível validar a chave.';

  try {
    const payload = (await response.json()) as { error?: string };
    message = payload.error ?? message;
  } catch {
    // Keep default message.
  }

  return {
    valid: false as const,
    message,
  };
}
