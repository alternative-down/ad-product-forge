// ScheduleSummary: local mirror of the shape returned by
// apps/forge/src/admin/read-model/helpers.ts toScheduleSummary. Defined
// here to avoid a forge-admin → forge import; structural typing keeps both
// definitions in sync. Update both if you add or rename a field.
// See #6023.
export type ScheduleSummary = {
  scheduleId: string;
  kind: 'agent' | 'system' | 'heartbeat';
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number | string;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  isActive: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

import type {
  DiscordProviderCredentials,
  EmailProviderCredentials,
} from './agent-credentials';

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

  providers: Array<
    | {
        providerType: 'discord';

        createdAt: number;

        editable: boolean;

        credentials: DiscordProviderCredentials;
      }
    | {
        providerType: 'email';

        createdAt: number;

        editable: boolean;

        credentials: EmailProviderCredentials;
      }
  >;

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

  schedules: ScheduleSummary[];

  heartbeat: ScheduleSummary | null;

  recentNotifications: Array<{
    notificationId: string;

    content: string;

    timestamp: number;

    read: boolean;
  }>;
};
