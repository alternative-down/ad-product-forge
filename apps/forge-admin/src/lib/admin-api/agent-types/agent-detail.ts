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
