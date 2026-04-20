export type AgentListItem = {
  agentId: string;
  name: string;
  description?: string;
  executionState: 'idle' | 'running' | 'absent';
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
  overview: {
    lastStepAt: number | null;
    lastStepContextTokens: number | null;
    lastStepPromptTokens: number | null;
    lastStepCachedContextTokens: number | null;
    lastStepPreview: string | null;
    lastToolBadge: {
      icon: string;
      label: string;
    } | null;
    lastStepTokens: number | null;
    lastStepCostUsd: number | null;
    averageStepIntervalMs: number | null;
    unreadNotificationCount: number;
    om: {
      generationCount: number;
      checkpointGeneration: number | null;
      recentRawTokenCount: number;
      recentRawTokenLimit: number;
      overflowTokenCount: number;
      overflowTokenLimit: number;
      observationTokenCount: number;
      observationTokenLimit: number;
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
  wakeWhenRunning: boolean;
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
  executionState: 'idle' | 'running' | 'absent';
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
    manifestConfig: {
      permissions: {
        administration: boolean;
        contents: boolean;
        issues: boolean;
        metadata: boolean;
        organization_projects: boolean;
        pull_requests: boolean;
        repository_projects: boolean;
        workflows: boolean;
      };
      events: {
        push: boolean;
        pull_request: boolean;
        pull_request_review: boolean;
        issues: boolean;
        issue_comment: boolean;
        repository: boolean;
        workflow_run: boolean;
      };
    };
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
};

export type AgentRecentConversation = {
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
};

export type AgentRuntimeMemorySnapshot = {
  workingMemory: string | null;
  agentContext: string | null;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  observations: string | null;
  reflection: string | null;
  generationCount: number;
  updatedAt: number;
  lastObservedAt: number | null;
  checkpointGeneration: number | null;
  checkpointSummary: string | null;
  checkpointUpdatedAt: number | null;
  ltmRecall: {
    status: 'hit' | 'miss' | 'error';
    query: string;
    resultIds: string[];
    resultCount: number;
    resultScores: number[];
    graphHit: boolean;
    stepsJson: string;
    updatedAt: number;
    lastInitAt: number | null;
    searchMode: string;
    topK: number;
    graphTopK: number;
    graphThreshold: number;
    graphRandomWalkSteps: number;
    indexPaths: string[];
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
    error: string | null;
  } | null;
  ltm: {
    running: boolean;
    queued: boolean;
    lastRunAt: number | null;
    lastRunError: string | null;
    lastRunErrorAt: number | null;
    lastWrittenPackageId: string | null;
    lastWrittenAt: number | null;
    packageCount: number;
  } | null;
  metrics: {
    rawMessageCount: number;
    recentRawMessageCount: number;
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowMessageCount: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    activeObservationBlockCount: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    activeReflectionBlockCount: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
    checkpointSummaryUpToGeneration: number | null;
    latestThreadMessageAt: number | null;
  };
};

export type AgentLongTermMemoryRecallDebugSearchResult = {
  query: string;
  topK: number;
  searchMode: 'hybrid' | 'vector' | 'bm25';
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
  lastInitAt: number | null;
  workspaceCanBm25: boolean;
  workspaceCanVector: boolean;
  workspaceCanHybrid: boolean;
  availableIndexes: string[];
  activeIndexName: string;
  activeIndexStats: {
    dimension: number;
    count: number;
    metric: string | null;
  } | null;
  queryEmbedding: number[];
  queryEmbeddingDimension: number;
  workspaceFormattedContext: string;
  workspaceResults: Array<{
    id: string;
    content: string;
    score: number | null;
    relativePercent: number | null;
  }>;
  vectorResults: Array<{
    id: string;
    score: number;
    metadataJson: string | null;
    document: string | null;
  }>;
  graphHit: boolean;
  graphQuery: string;
  graphDimension: number;
  graphIncludeSources: boolean;
  graphContext: string;
  graphRelevantContextRaw: string | null;
  graphSourcesCount: number;
  graphSourcesJson: string | null;
  graphRawJson: string | null;
  graphError: string | null;
  injectedSystemMessage: string | null;
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

export type CreateScheduleInput = {
  agentId: string;
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: string;
  timezone: string;
  content: string;
  wakeWhenRunning?: boolean;
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
  wakeWhenRunning?: boolean;
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
