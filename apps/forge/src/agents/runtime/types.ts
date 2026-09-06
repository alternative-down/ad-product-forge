import type {
  AgentConfig,
  AgentWakeEvent,
  CommunicationModule,
  CommunicationProvider,
  WorkspaceEmbedderId,
} from '@forge-runtime/core';

import type {
  WorkspaceFilesystemConfig,
  WorkspaceSandboxConfig,
  WorkspaceSkillsConfig,
} from '../../database/schema';
import type { LtmRecallSearchMode } from '../ltm/recall/types';
import type {
  AgentLongTermMemoryRecallDebugSearchInput,
  AgentLongTermMemoryRecallDebugSearchResult,
} from '../ltm/recall';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  _TTools extends Record<string, unknown> = Record<string, unknown>,
  _TOutput = undefined,
  _TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, _TTools, _TOutput, _TRequestContext> & {
  omModel?: unknown;
  pricingModelKey: string;
  omPricingModelKey?: string;
  modelProfileId?: string;
  omModelProfileId?: string;
  companyName?: string;
  companyContext?: string;
  communicationDmFlushingEnabled?: boolean;
  communicationGroupFlushingEnabled?: boolean;
  memoryLastMessagesFullEnabled?: boolean;
  memoryLastMessagesCount?: number;
  tokenCountFilterEnabled?: boolean;
  tokenCountFilterLimit?: number;
  checkpointedOmEnabled?: boolean;
  checkpointedOmTotalContextTokens?: number;
  checkpointedOmRecentRawTokens?: number;
  checkpointedOmRawObservationBatchTokens?: number;
  checkpointedOmObservationReflectionBatchTokens?: number;
  checkpointedOmObservationSupportTokens?: number;
  checkpointedOmReflectionSupportTokens?: number;
  ltmRecallScoreThreshold?: number;
  ltmRecallDocumentCount?: number;
  roleName?: string;
  roleDescription?: string;
  providers?: CommunicationProvider[];
  communication?: CommunicationModule;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  workspaceSkills?: WorkspaceSkillsConfig;
  workspaceEmbedder?: WorkspaceEmbedderId;
};

/** Union of all CreateForgeAgentConfig field names. */
export type RuntimeModelField = keyof CreateForgeAgentConfig;

/** Alias for tests that expect a schema-named type. */
export type CreateForgeAgentConfigSchema = CreateForgeAgentConfig;

export type CreateAgentOptions = {
  readRuntimeMemorySettings?: () => Promise<{
    checkpointedOmTotalContextTokens: number;
    checkpointedOmRecentRawTokens: number;
    checkpointedOmRawObservationBatchTokens: number;
    checkpointedOmObservationReflectionBatchTokens: number;
    checkpointedOmObservationSupportTokens: number;
    checkpointedOmReflectionSupportTokens: number;
    ltmRecallSearchMode: LtmRecallSearchMode;
    ltmRecallWorkspaceTopK: number;
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
};

export type RuntimeStepUsage = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
  };
};

export type RuntimeGenerateStepResult = {
  omTrace?: Array<{
    at: number;
    scope: string;
    phase: string;
    metrics?: Record<string, number | string | null>;
    detail?: Record<string, unknown> | null;
  }>;
  usage?: RuntimeStepUsage;
};

export type RuntimeIteration = {
  iteration: number;
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    id: string;
    name: string;
    result: unknown;
    error?: Error;
  }>;
  isFinal: boolean;
  finishReason: string;
  runId: string;
  threadId?: string;
  resourceId?: string;
  agentId: string;
  agentName: string;
  messages: unknown[];
};

export type RuntimeGenerateResult = {
  text: string;
  usage?: RuntimeStepUsage;
  finishReason?: string;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{
        parts?: unknown[];
      }>;
    };
  }>;
};

export type RuntimeAgentGenerateMessage =
  | string
  | Array<{
      role: 'assistant' | 'user';
      content: string;
    }>;

export type RuntimeAgentGenerateOptions = {
  runId?: string;
  maxSteps?: number;
  savePerStep?: boolean;
  abortSignal?: AbortSignal;
  system?: string;
  memory?: {
    thread: string;
    resource: string;
    options: {
      lastMessages: number;
    };
  };
  providerOptions?: Record<string, unknown>;
  prepareStep?: (input: { stepNumber: number }) => Promise<void> | void;
  onStepFinish?: (stepResult: RuntimeGenerateStepResult) => Promise<void> | void;
  onIterationComplete?: (iteration: RuntimeIteration) =>
    | Promise<{
        continue?: boolean;
        feedbackMessages?: Array<{ role: 'assistant' | 'user'; content: string }>;
      } | void>
    | {
        continue?: boolean;
        feedbackMessages?: Array<{ role: 'assistant' | 'user'; content: string }>;
      }
    | void;
};

export type RuntimeAgent = {
  generate(
    prompt: RuntimeAgentGenerateMessage,
    options?: RuntimeAgentGenerateOptions,
  ): Promise<RuntimeGenerateResult>;
  stabilizeMemory?(): Promise<{
    overflowTokenCount: number;
    needsMoreOverflowWork: boolean;
  }>;
};

export type RuntimeWorkspaceFilesystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string | Uint8Array | Buffer>;
  writeFile(path: string, content: Uint8Array | Buffer | string): Promise<unknown>;
};

export type RuntimeWorkspace = {
  filesystem: RuntimeWorkspaceFilesystem | null;
};

export type InternalAgentRuntime<
  TAgentId extends string = string,
  _TTools extends Record<string, unknown> = Record<string, unknown>,
  _TOutput = undefined,
  _TRequestContext extends Record<string, unknown> | unknown = unknown,
> = {
  id: TAgentId;
  mastraId: string;
  pricingModelKey: string;
  modelProfileId?: string;
  omPricingModelKey: string;
  omModelProfileId?: string;
  agent: RuntimeAgent;
  workspace: RuntimeWorkspace;
  communication: CommunicationModule;
  longTermMemoryRecall: {
    initialize(): Promise<void>;
    refreshIndex(): Promise<void>;
    recallFromStep(input: {
      step: unknown;
      steps: unknown[];
      threadId: string | null;
      resourceId?: string;
    }): Promise<string | null>;
    debugSearch(
      input: AgentLongTermMemoryRecallDebugSearchInput,
    ): Promise<AgentLongTermMemoryRecallDebugSearchResult>;
    dispose?(): Promise<void>;
  };
  onReceiveMessage(handler: (event: AgentWakeEvent) => void): void;
  dispose(): Promise<void>;
};

export interface CreateAgentConfig<
  TAgentId extends string = string,
  _TTools extends Record<string, unknown> = Record<string, unknown>,
  _TOutput = undefined,
  _TRequestContext extends Record<string, unknown> | unknown = unknown,
> extends Pick<
  CreateForgeAgentConfig<TAgentId, _TTools, _TOutput, _TRequestContext>,
  | 'id'
  | 'name'
  | 'description'
  | 'instructions'
  | 'model'
  | 'pricingModelKey'
  | 'tools'
  | 'agents'
  | 'omModel'
  | 'omPricingModelKey'
  | 'modelProfileId'
  | 'omModelProfileId'
  | 'companyName'
  | 'companyContext'
  | 'communicationDmFlushingEnabled'
  | 'communicationGroupFlushingEnabled'
  | 'memoryLastMessagesFullEnabled'
  | 'memoryLastMessagesCount'
  | 'tokenCountFilterEnabled'
  | 'tokenCountFilterLimit'
  | 'checkpointedOmEnabled'
  | 'checkpointedOmTotalContextTokens'
  | 'checkpointedOmRecentRawTokens'
  | 'checkpointedOmRawObservationBatchTokens'
  | 'checkpointedOmObservationReflectionBatchTokens'
  | 'checkpointedOmObservationSupportTokens'
  | 'checkpointedOmReflectionSupportTokens'
  | 'ltmRecallScoreThreshold'
  | 'ltmRecallDocumentCount'
  | 'roleName'
  | 'roleDescription'
  | 'providers'
  | 'communication'
  | 'workspaceFilesystem'
  | 'workspaceSandbox'
  | 'workspaceSkills'
  | 'workspaceEmbedder'
> {
  workspaceBasePath: string;
}
