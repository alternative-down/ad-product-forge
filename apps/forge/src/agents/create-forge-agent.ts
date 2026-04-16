import { Agent, type ToolsInput } from '@mastra/core/agent';
import {
  type InputProcessorOrWorkflow,
  type OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
import type { Tool } from '@mastra/core/tools';
import {
  createExternalAccountTools,
} from '@mastra-engine/core';
import { createAgentRuntimePlatform } from './agent-runtime-platform';
import { createAgentLongTermMemory } from './agent-long-term-memory';
import { createAgentRuntimeMemory } from './agent-runtime-memory';
import { buildAgentSystemPrompt } from './agent-runtime-prompt';
import type {
  CreateAgentConfig,
  CreateAgentOptions,
  InternalAgentRuntime,
} from './agent-runtime-types';

export async function createAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  options: CreateAgentOptions = {},
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const runtime = await createInternalAgentRuntime(config, options);
  return runtime.agent;
}

export async function createInternalAgentRuntime<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
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
    communication: config.communication,
    workspaceFilesystem: config.workspaceFilesystem,
    workspaceSandbox: config.workspaceSandbox,
    workspaceSkills: config.workspaceSkills,
    communicationDmFlushingEnabled: config.communicationDmFlushingEnabled,
    communicationGroupFlushingEnabled: config.communicationGroupFlushingEnabled,
  });
  const allAgentTools = {
    ...createExternalAccountTools(platform.communication),
    ...(config.tools ?? {}),
  } as Record<string, Tool<unknown, unknown>>;
  const omPricingModelKey = config.omPricingModelKey ?? config.pricingModelKey;
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
        agentWorkspacePath: platform.agentWorkspacePath,
        agentMemoryPath: platform.agentMemoryPath,
        storage: platform.storage,
        vector: platform.vector,
        threadId: platform.mastraId,
        resourceId: platform.mastraId,
        model: (config.omModel ?? config.model) as CreateAgentConfig['model'],
        pricingModelKey: omPricingModelKey,
        modelProfileId: config.omModelProfileId,
        contractStore: options.contractStore,
      })
    : null;

  const runtimeMemory = await createAgentRuntimeMemory({
    storage: platform.storage,
    vector: platform.vector,
    agentId: config.id,
    mastraId: platform.mastraId,
    agentWorkspacePath: platform.agentWorkspacePath,
    agentModel: config.model as CreateAgentConfig['model'],
    omModel: config.omModel as CreateAgentConfig['omModel'],
    agentMemoryPath: platform.agentMemoryPath,
    longTermMemory: options.longTermMemory,
    memoryLastMessagesFullEnabled: config.memoryLastMessagesFullEnabled,
    memoryLastMessagesCount: config.memoryLastMessagesCount,
    tokenCountFilterEnabled: config.tokenCountFilterEnabled,
    tokenCountFilterLimit: config.tokenCountFilterLimit,
    checkpointedOmEnabled: config.checkpointedOmEnabled,
    checkpointedOmTotalContextTokens: config.checkpointedOmTotalContextTokens,
    checkpointedOmRecentRawTokens: config.checkpointedOmRecentRawTokens,
    checkpointedOmRawObservationBatchTokens: config.checkpointedOmRawObservationBatchTokens,
    checkpointedOmObservationReflectionBatchTokens:
      config.checkpointedOmObservationReflectionBatchTokens,
    checkpointedOmObservationSupportTokens: config.checkpointedOmObservationSupportTokens,
    checkpointedOmReflectionSupportTokens: config.checkpointedOmReflectionSupportTokens,
    agentSystemPrompt: typeof agentSystemPrompt === 'string' ? agentSystemPrompt : undefined,
    onCheckpointAdvanced: longTermMemory?.onCheckpointAdvanced,
  });

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: agentSystemPrompt,
    model: config.model,
    tools: allAgentTools as TTools,
    workflows: config.workflows,
    workspace: platform.workspace,
    agents: config.agents,
    memory: runtimeMemory.memory,
    inputProcessors: runtimeMemory.inputProcessors as InputProcessorOrWorkflow[],
    outputProcessors: runtimeMemory.outputProcessors as OutputProcessorOrWorkflow[],
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
    communication: platform.communication,
    longTermMemoryRecall: runtimeMemory.longTermMemoryRecall,
    longTermMemory,
    onReceiveMessage: platform.communication.onReceiveMessage,
    async dispose() {
      await longTermMemory?.dispose();
      await platform.communication.dispose();
    },
  };
}

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  return createAgent(config, { longTermMemory: false });
}
