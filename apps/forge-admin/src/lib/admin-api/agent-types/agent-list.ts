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

};


