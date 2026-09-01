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
import type { CheckpointedOmCheckpointPackageInput } from './ltm/store';
import { createAgentRuntimePlatform } from './runtime/platform';
import { createAgentLongTermMemory } from './agent-long-term-memory';
import { createAgentRuntimeMemory } from './runtime/memory';
import { buildAgentSystemPrompt } from './runtime/prompt';
import { createAgentMcpRuntimeActionSource } from './mcp/client-manager';
import { migrateLegacyCheckpointedOmState } from './migrate-legacy-checkpointed-om';
import { normalizeOperationalMemoryMessages } from './normalize-operational-memory-messages';
import type {
  CreateAgentConfig,
  CreateAgentOptions,
  InternalAgentRuntime,
  RuntimeAgent,
} from './runtime/types';

import type {
  CreateRuntimeAgentSessionOptions,
} from '@forge-runtime/core';

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
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmTotalContextTokens required');
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmTotalContextTokens');
  }

  if (config.checkpointedOmRecentRawTokens === undefined) {
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmRecentRawTokens required');
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmRecentRawTokens');
  }

  if (config.checkpointedOmRawObservationBatchTokens === undefined) {
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmRawObservationBatchTokens required');
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmRawObservationBatchTokens');
  }

  if (config.checkpointedOmObservationReflectionBatchTokens === undefined) {
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmObservationReflectionBatchTokens required');
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmObservationReflectionBatchTokens');
  }

  if (config.checkpointedOmObservationSupportTokens === undefined) {
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmObservationSupportTokens required');
    throw new AgentRuntimeConfigFieldMissingError('checkpointedOmObservationSupportTokens');
  }

  if (config.checkpointedOmReflectionSupportTokens === undefined) {
    createForgeAgentDebug('error', 'buildAgentRuntimeConfig: checkpointedOmReflectionSupportTokens required');
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

/**
 * Adapter: bridges longTermMemory.onCheckpointAdvanced (CheckpointedOmCheckpointPackageInput)
 * to the runtime's CreateRuntimeAgentSessionOptions.onCheckpointAdvanced signature.
 *
 * The two signatures describe the same conceptual event but have diverged in shape:
 * - Runtime expects expanded reflection/observation records with token counts and stable IDs
 * - LTM accepts a leaner payload with raw content strings and millisecond timestamps
 *
 * This adapter maps the runtime's expanded input into the LTM payload format
 * (text -> content, string ISO timestamps -> number millis). The reverse fields
 * (recordId, generationCount, tokenCount, blockId, lastObservedAt, reflectedGeneration)
 * are intentionally dropped - the LTM writer does not consume them.
 *
 * Per #6498 resolution: removes the `(longTermMemory as any)` cast that hid the
 * signature drift between `packages/forge-runtime-core` and `apps/forge/src/agents/ltm/store`.
 */
function adaptLtmOnCheckpointAdvanced(
  longTermMemory: ReturnType<typeof createAgentLongTermMemory> | null | undefined,
): CreateRuntimeAgentSessionOptions['onCheckpointAdvanced'] {
  const ltmCallback = longTermMemory?.onCheckpointAdvanced;
  if (!ltmCallback) return undefined;
  return async (input) => {
    const parseDate = (iso: string): number | undefined => {
      const ts = Date.parse(iso);
      return Number.isFinite(ts) ? ts : undefined;
    };
    const payload: CheckpointedOmCheckpointPackageInput = {
      threadId: input.threadId,
      toGeneration: input.toGeneration,
      fromGeneration: input.fromGeneration,
      reflections: input.reflections.map((r) => ({
        content: r.text,
        createdAt: parseDate(r.createdAt),
      })),
      observations: input.observations.map((o) => ({
        content: o.text,
        createdAt: parseDate(o.createdAt),
      })),
      checkpointSummary: {
        text: input.checkpointSummary.text,
        updatedAt: parseDate(input.checkpointSummary.updatedAt) ?? 0,
      },
    };
    await ltmCallback(payload);
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
  const configuredTools = (config.tools ?? {}) as ToolsInput;
  const mcpRuntimeActionSource = createAgentMcpRuntimeActionSource(config.id);
  const allAgentTools: ToolsInput = {
    ...createExternalAccountTools(platform.communication as CommunicationModule),
    ...configuredTools,
  };
  const omPricingModelKey = config.omPricingModelKey ?? config.pricingModelKey;
  await migrateLegacyCheckpointedOmState({
    db: getDatabase(),
    agentId: config.id,
    threadId: platform.mastraId,
    conversationStore: platform.conversationStore,
  });
  await normalizeOperationalMemoryMessages({
    threadId: platform.mastraId,
    conversationStore: platform.conversationStore,
  });
  const longTermMemoryStore = createAgentLongTermMemoryStore(getDatabase(), {
    agentId: config.id,
  });
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
  const longTermMemory = (options.longTermMemory ?? false) && !!options.contractStore
      ? createAgentLongTermMemory({
          agentId: config.id,
          agentName: config.name,
          agentDescription: config.description,
          roleName: config.roleName,
          roleDescription: config.roleDescription,
          instructions: typeof config.instructions === 'string' ? config.instructions : '',
          agentWorkspacePath: platform.agentWorkspacePath,
          agentMemoryPath: platform.agentMemoryPath,
          threadId: platform.mastraId,
          resourceId: platform.mastraId,
          model: (config.omModel ?? config.model) as never,
          pricingModelKey: omPricingModelKey,
          modelProfileId: config.omModelProfileId,
          contractStore: options.contractStore,
          conversationStore: platform.conversationStore,
          workspaceActions: platform.workspaceActions,
          workspaceEmbedder: config.workspaceEmbedder,
          persistenceStore: longTermMemoryStore,
        })
      : null;

  const runtimeMemory = await createAgentRuntimeMemory({
    agentId: config.id,
    mastraId: platform.mastraId,
    agentWorkspacePath: platform.agentWorkspacePath,
    agentModel: config.model as never,
    omModel: config.omModel as never,
    agentMemoryPath: platform.agentMemoryPath,
    longTermMemory: options.longTermMemory,
    memoryLastMessagesFullEnabled: config.memoryLastMessagesFullEnabled,
    memoryLastMessagesCount: config.memoryLastMessagesCount,
    ltmRecallScoreThreshold: config.ltmRecallScoreThreshold,
    ltmRecallDocumentCount: config.ltmRecallDocumentCount,
    workspaceEmbedder: config.workspaceEmbedder,
    conversationStore: platform.conversationStore,
    checkpointedOmLimits: {
      recentRawTokens: config.checkpointedOmRecentRawTokens,
    },
    persistenceStore: longTermMemoryStore,
    readRuntimeMemorySettings: options.readRuntimeMemorySettings,
  });

  longTermMemory?.attachRecallIndexRefresh(
    runtimeMemory.longTermMemoryRecall
      ? () => runtimeMemory.longTermMemoryRecall!.refreshIndex()
      : null,
  );

  mcpRuntimeActionSource.start();
  const checkpointedOmLimits = requireCheckpointedOmLimits(config);

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
    onCheckpointAdvanced: adaptLtmOnCheckpointAdvanced(longTermMemory),
    runtimeActions: [...platform.workspaceActions, ...toolsToRuntimeActions(allAgentTools)],
    loadRuntimeActions: () => mcpRuntimeActionSource.getActions(),
    consolidateConversationOverflow: config.checkpointedOmEnabled === true,
  } satisfies CreateRuntimeAgentSessionOptions);

  await longTermMemory?.start();

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
    longTermMemory: longTermMemory,
    onReceiveMessage: platform.communication.onReceiveMessage,
    async dispose() {
      const cleanupResults = await Promise.allSettled([
        runtimeMemory.longTermMemoryRecall?.dispose?.(),
        longTermMemory?.dispose(),
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
  return await createAgent(config, { longTermMemory: false });
}
