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
  role: {
    roleId: string;
    name: string;
    description?: string | null;
  } | null;
  workspace: {
    autoSync: boolean;
    bm25: boolean;
    embedder: string | null;
    filesystem: string | null;
    sandbox: string | null;
  };
  loaded: boolean;
  runner: AgentListItem['runner'];
  providers: Array<{
    providerType: string;
    createdAt: number;
    editable: boolean;
    credentials: unknown;
  }>;
  mcpServers: Array<{
    configId: string;
    serverId: string;
    name: string;
    description?: string;
    transport: 'stdio' | 'http_streamable';
    command: string;
    argsText: string;
    envVarsText: string;
    url: string;
    headersText: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  skills: Array<{
    skillName: string;
    description?: string;
    fileCount: number;
    updatedAt: number;
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
  schedules: AgentSchedule[];
  heartbeat: AgentSchedule | null;
  recentNotifications: Array<{
    notificationId: string;
    content: string;
    timestamp: number;
    read: boolean;
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

export type HireAgentInput = {
  hiringRequest: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
};

export type HireAgentResult = {
  agentId: string;
  emailAddress: string | null;
  githubAppRegistrationUrl: string | null;
};

export type AgentMcpServerInput =
  | {
      agentId: string;
      name: string;
      description?: string;
      transport: 'stdio';
      command: string;
      argsText?: string;
      envVarsText?: string;
      isActive: boolean;
    }
  | {
      agentId: string;
      name: string;
      description?: string;
      transport: 'http_streamable';
      url: string;
      headersText?: string;
      isActive: boolean;
    };

export type UpdateAgentMcpServerInput = {
  configId: string;
  serverId: string;
} & AgentMcpServerInput;

export type UploadAgentSkillsInput = {
  agentId: string;
  archiveBase64: string;
};

export type DeleteAgentSkillInput = {
  agentId: string;
  skillName: string;
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
  authorAgentId?: string | null;
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

export type InternalChatExternalAccount = {
  accountId: string;
  slug: string;
  displayName: string;
  description: string;
};

export type InternalChatContact = {
  accountId: string;
  agentId?: string | null;
  slug: string;
  displayName: string;
  description: string;
  isAgent: boolean;
};

export type HomeInternalChatConversation = {
  conversationId: string;
  conversationKey: string;
  provider: 'internal-chat';
  type: 'dm' | 'group';
  name: string;
  participants: string[];
  updatedAt: number;
  messages: Array<{
    messageId: string;
    content: string;
    unread: boolean;
    authorDisplayName: string;
    createdAt: number;
  }>;
};

export type HomeInternalChatConversationMessage = {
  messageId: string;
  authorAccountId: string;
  authorAgentId?: string | null;
  authorDisplayName: string;
  content: string;
  createdAt: number;
  attachments: Array<{
    name: string;
    contentType?: string;
    sizeBytes?: number;
  }>;
};

export type HomeInternalChatConversationMessagesResponse = {
  items: HomeInternalChatConversationMessage[];
  hasMore: boolean;
};

export type HomeInternalChatGroupMember = {
  groupId: string;
  participantId: string;
  participantSlug: string;
  participantName: string;
  role: string;
  createdAt: string;
};

export type DiscordProviderCredentials = {
  token: string;
  channels: Array<{
    channelId: string;
    channelName?: string;
    respondToMentionsOnly: boolean;
  }>;
};

export type EmailProviderCredentials = {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
};

export type UpsertAgentProviderInput =
  | {
      agentId: string;
      providerType: 'discord';
      credentials: DiscordProviderCredentials;
    }
  | {
      agentId: string;
      providerType: 'email';
      credentials: EmailProviderCredentials;
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
