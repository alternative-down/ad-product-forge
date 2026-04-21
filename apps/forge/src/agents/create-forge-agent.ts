import {
  type CommunicationModule,
  createRuntimeAgentSession,
  createExternalAccountTools,
  type ToolsInput,
  toolsToRuntimeActions,
} from '@forge-runtime/core';
import { getDatabase } from '../database';
import { createAgentCheckpointedOmStateStore } from './checkpointed-om-state-store';
import { createAgentRuntimePlatform } from './agent-runtime-platform';
import { createAgentLongTermMemory } from './agent-long-term-memory';
import { createAgentRuntimeMemory } from './agent-runtime-memory';
import { buildAgentSystemPrompt } from './agent-runtime-prompt';
import type {
  CreateAgentConfig,
  CreateAgentOptions,
  InternalAgentRuntime,
  RuntimeAgent,
} from './agent-runtime-types';

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
  const allAgentTools: ToolsInput = {
    ...createExternalAccountTools(platform.communication as CommunicationModule),
    ...configuredTools,
  };
  const omPricingModelKey = config.omPricingModelKey ?? config.pricingModelKey;
  const checkpointedOmStateStore = createAgentCheckpointedOmStateStore(getDatabase(), {
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
  const longTermMemory = options.longTermMemory && options.contractStore
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
        checkpointedOmStateStore,
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
    checkpointedOmStateStore,
    readRuntimeMemorySettings: options.readRuntimeMemorySettings,
  });

  longTermMemory?.attachRecallIndexRefresh(
    runtimeMemory.longTermMemoryRecall
      ? () => runtimeMemory.longTermMemoryRecall!.refreshIndex()
      : null,
  );

  const agent = await createRuntimeAgentSession({
    agentId: config.id,
    agentName: config.name,
    threadId: platform.mastraId,
    resourceId: platform.mastraId,
    assistantAuthorId: config.id,
    model: config.model as never,
    system: typeof agentSystemPrompt === 'string' ? agentSystemPrompt : undefined,
    conversationStore: platform.conversationStore,
    checkpointedStateStore: platform.conversationStore,
    workingMemoryStore: platform.conversationStore,
    checkpointedOmStateStore,
    onCheckpointAdvanced: longTermMemory?.onCheckpointAdvanced,
    runtimeActions: [
      ...platform.workspaceActions,
      ...toolsToRuntimeActions(allAgentTools),
    ],
    maxConversationMessages: config.memoryLastMessagesFullEnabled
      ? Number.MAX_SAFE_INTEGER
      : config.memoryLastMessagesCount,
    consolidateConversationOverflow: config.checkpointedOmEnabled,
  });

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
    longTermMemory,
    onReceiveMessage: platform.communication.onReceiveMessage,
    async dispose() {
      const cleanupResults = await Promise.allSettled([
        runtimeMemory.longTermMemoryRecall?.dispose?.(),
        longTermMemory?.dispose(),
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
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
): Promise<RuntimeAgent> {
  return createAgent(config, { longTermMemory: false });
}
