import {
  forgeDebug,
  type CommunicationModule,
  createRuntimeAgentSession,
  createExternalAccountTools,
  type ToolsInput,
  toolsToRuntimeActions,
} from '@forge-runtime/core';
import { getDatabase } from '../database/client';
import { createAgentLongTermMemoryStore } from './ltm/store';
import { AgentRuntimeConfigFieldMissingError } from './create-forge-agent.errors';
import { createAgentRuntimePlatform } from './runtime/platform';
import { createAgentRuntimeMemory } from './runtime/memory';
import { buildAgentSystemPrompt } from './runtime/prompt';
import { createAgentMcpRuntimeActionSource } from './mcp/client-manager';
import { migrateLegacyCheckpointedOmState } from './migrate-legacy-checkpointed-om';
import type {
  CreateAgentConfig,
  CreateAgentOptions,
  InternalAgentRuntime,
  RuntimeAgent,
} from './runtime/types';

import type { CreateRuntimeAgentSessionOptions } from '@forge-runtime/core';

/**
 * Module-local debug helper for this file.
 * Bakes in scope=create-forge-agent so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 6 forgeDebug call-sites in this file all use scope=create-forge-agent
 *   - Inline pattern keeps TSC error count flat (replaces forgeDebug import)
 */
function createForgeAgentDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'create-forge-agent',
    level,
    message,
    context,
  });
}

function requireCheckpointedOmLimits(config: CreateAgentConfig) {
  if (config.checkpointedOmTotalContextTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmTotalContextTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmTotalContextTokens');
  }

  if (config.checkpointedOmRecentRawTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmRecentRawTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmRecentRawTokens');
  }

  if (config.checkpointedOmRawObservationBatchTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmRawObservationBatchTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmRawObservationBatchTokens');
  }

  if (config.checkpointedOmObservationReflectionBatchTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmObservationReflectionBatchTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmObservationReflectionBatchTokens');
  }

  if (config.checkpointedOmObservationSupportTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmObservationSupportTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmObservationSupportTokens');
  }

  if (config.checkpointedOmReflectionSupportTokens === undefined) {
    createForgeAgentDebug(
      'error',
      'buildAgentRuntimeConfig: checkpointedOmReflectionSupportTokens required',
    );
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmReflectionSupportTokens');
  }

  return {
    totalContextTokens: config.checkpointedOmTotalContextTokens,
    recentRawTokens: config.checkpointedOmRecentRawTokens,
    rawObservationBatchTokens: config.checkpointedOmRawObservationBatchTokens,
    observationReflectionBatchTokens: config.checkpointedOmObservationReflectionBatchTokens,
    observationSupportTokens: config.checkpointedOmObservationSupportTokens,
    reflectionSupportTokens: config.checkpointedOmReflectionSupportTokens,
  };
}

export async function createAgent<
  TAgentId extends string = string,
  TTools extends Record<string, unknown> = Record<string, unknown>,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  options: CreateAgentOptions = {},
): Promise<RuntimeAgent> {
  const runtime = await createInternalAgentRuntime(config, options);
  return runtime.agent;
}

export async function createInternalAgentRuntime<
  TAgentId extends string = string,
  TTools extends Record<string, unknown> = Record<string, unknown>,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  options: CreateAgentOptions = {},
): Promise<InternalAgentRuntime<TAgentId, TTools, TOutput, TRequestContext>> {
  const checkpointedOmLimits = requireCheckpointedOmLimits(config);
  const runtimeStartedAt = Date.now();
  const logStage = (stage: string, startedAt: number, context?: Record<string, unknown>) => {
    createForgeAgentDebug('info', `runtime initialization: ${stage}`, {
      agentId: config.id,
      durationMs: Date.now() - startedAt,
      elapsedMs: Date.now() - runtimeStartedAt,
      ...context,
    });
  };

  createForgeAgentDebug('info', 'runtime initialization started', {
    agentId: config.id,
    checkpointedOmEnabled: config.checkpointedOmEnabled === true,
  });
  let stageStartedAt = Date.now();
  createForgeAgentDebug('info', 'runtime initialization: platform starting', {
    agentId: config.id,
  });
  const platform = await createAgentRuntimePlatform({
    agentId: config.id,
    workspaceBasePath: config.workspaceBasePath,
    providers: config.providers,
    communication: config.communication as CommunicationModule | undefined,
    workspaceFilesystem: config.workspaceFilesystem,
    workspaceSandbox: config.workspaceSandbox,
    workspaceSkills: config.workspaceSkills,
    communicationDmFlushingEnabled: config.communicationDmFlushingEnabled,
    communicationGroupFlushingEnabled: config.communicationGroupFlushingEnabled,
  });
  logStage('platform created', stageStartedAt);
  const configuredTools = (config.tools ?? {}) as ToolsInput;
  const mcpRuntimeActionSource = createAgentMcpRuntimeActionSource(config.id);
  const allAgentTools: ToolsInput = {
    ...createExternalAccountTools(platform.communication as CommunicationModule),
    ...configuredTools,
  };
  const omPricingModelKey = config.omPricingModelKey ?? config.pricingModelKey;
  stageStartedAt = Date.now();
  createForgeAgentDebug(
    'info',
    'runtime initialization: legacy operational memory migration starting',
    {
      agentId: config.id,
    },
  );
  await migrateLegacyCheckpointedOmState({
    db: getDatabase(),
    agentId: config.id,
    threadId: platform.mastraId,
    conversationStore: platform.conversationStore,
  });
  logStage('legacy operational memory migration checked', stageStartedAt);
  const agentSystemPrompt = buildAgentSystemPrompt({
    agentId: config.id,
    agentSlug: platform.mastraId,
    agentName: config.name,
    agentDescription: config.description,
    roleName: config.roleName,
    roleDescription: config.roleDescription,
    instructions: config.instructions,
    companyName: config.companyName,
    companyContext: config.companyContext,
  });
  const recallStore = createAgentLongTermMemoryStore(getDatabase(), { agentId: config.id });
  stageStartedAt = Date.now();
  createForgeAgentDebug('info', 'runtime initialization: semantic recall starting', {
    agentId: config.id,
  });
  const runtimeMemory = await createAgentRuntimeMemory({
    agentId: config.id,
    mastraId: platform.mastraId,
    agentWorkspacePath: platform.agentWorkspacePath,
    agentMemoryPath: platform.agentMemoryPath,
    ltmRecallScoreThreshold: config.ltmRecallScoreThreshold,
    ltmRecallDocumentCount: config.ltmRecallDocumentCount,
    workspaceEmbedder: config.workspaceEmbedder,
    conversationStore: platform.conversationStore,
    checkpointedOmLimits: {
      recentRawTokens: config.checkpointedOmRecentRawTokens,
    },
    persistenceStore: recallStore,
    readRuntimeMemorySettings: options.readRuntimeMemorySettings,
  });
  logStage('semantic recall created', stageStartedAt);
  mcpRuntimeActionSource.start();

  stageStartedAt = Date.now();
  createForgeAgentDebug('info', 'runtime initialization: runtime session starting', {
    agentId: config.id,
  });
  const agent = await createRuntimeAgentSession({
    agentId: config.id,
    agentName: config.name,
    threadId: platform.mastraId,
    resourceId: platform.mastraId,
    assistantAuthorId: config.id,
    model: config.model as never,
    system: typeof agentSystemPrompt === 'string' ? agentSystemPrompt : undefined,
    conversationStore: platform.conversationStore,
    checkpointedOmLimits,
    checkpointedOmModel: (config.omModel ?? config.model) as never,
    checkpointedOmSystemPrompt:
      typeof agentSystemPrompt === 'string' ? agentSystemPrompt : undefined,
    runtimeActions: [...platform.workspaceActions, ...toolsToRuntimeActions(allAgentTools)],
    loadRuntimeActions: () => mcpRuntimeActionSource.getActions(),
    consolidateConversationOverflow: config.checkpointedOmEnabled === true,
  } satisfies CreateRuntimeAgentSessionOptions);
  logStage('runtime session created', stageStartedAt, {
    runtimeActionCount: platform.workspaceActions.length + Object.keys(allAgentTools).length,
  });

  createForgeAgentDebug('info', 'runtime initialization completed', {
    agentId: config.id,
    durationMs: Date.now() - runtimeStartedAt,
  });

  return {
    id: config.id,
    mastraId: platform.mastraId,
    pricingModelKey: config.pricingModelKey,
    modelProfileId: config.modelProfileId,
    omPricingModelKey,
    omModelProfileId: config.omModelProfileId,
    agent,
    workspace: platform.workspace,
    communication: platform.communication as CommunicationModule,
    longTermMemoryRecall: runtimeMemory.longTermMemoryRecall,
    onReceiveMessage: platform.communication.onReceiveMessage,
    async dispose() {
      const cleanupResults = await Promise.allSettled([
        runtimeMemory.longTermMemoryRecall.dispose?.(),
        mcpRuntimeActionSource.dispose(),
        platform.communication.dispose(),
        platform.dispose(),
      ]);
      const rejectedResult = cleanupResults.find((result) => result.status === 'rejected');

      if (rejectedResult?.status === 'rejected') {
        throw rejectedResult.reason;
      }
    },
  };
}

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends Record<string, unknown> = Record<string, unknown>,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>): Promise<RuntimeAgent> {
  return await createAgent(config);
}
