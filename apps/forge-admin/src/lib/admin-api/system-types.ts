export type SystemSettings = {
  companyName: string;
  companyContext: string;
  stepDelayEnabled: boolean;
  communicationDmFlushingEnabled: boolean;
  communicationGroupFlushingEnabled: boolean;
  memoryLastMessagesFullEnabled: boolean;
  memoryLastMessagesCount: number;
  tokenCountFilterEnabled: boolean;
  tokenCountFilterLimit: number;
  checkpointedOmEnabled: boolean;
  checkpointedOmTotalContextTokens: number;
  checkpointedOmRecentRawTokens: number;
  checkpointedOmRawObservationBatchTokens: number;
  checkpointedOmObservationReflectionBatchTokens: number;
  checkpointedOmObservationSupportTokens: number;
  checkpointedOmReflectionSupportTokens: number;
};

export type SystemMcpServer = {
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
};

export type SystemSkill = {
  skillName: string;
  description?: string;
  fileCount: number;
  updatedAt: number;
  source: 'bundled' | 'custom';
  editable: boolean;
};

export type UpsertSystemMcpServerInput =
  | {
      serverId?: string;
      name: string;
      description?: string;
      transport: 'stdio';
      command: string;
      argsText?: string;
      envVarsText?: string;
      url?: string;
      headersText?: string;
      isActive: boolean;
    }
  | {
      serverId?: string;
      name: string;
      description?: string;
      transport: 'http_streamable';
      url: string;
      headersText?: string;
      command?: string;
      argsText?: string;
      envVarsText?: string;
      isActive: boolean;
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
