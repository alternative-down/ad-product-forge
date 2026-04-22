import type {
  RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

import { createCheckpointedConversationObserver } from './checkpointed-conversation-observer.js';
import { syncCheckpointedOmCompatibility } from './checkpointed-om-compatibility.js';
import { createForgeConversationMemory } from './memory.js';
import {
  createUpdateWorkingMemoryTool,
} from './runtime-working-memory.js';
import type { CreateRuntimeAgentSessionOptions } from './runtime-agent-session.js';
import { toolToRuntimeAction } from './tools.js';

const DEFAULT_CHECKPOINTED_OM_LIMITS = {
  totalContextTokens: 50_000,
  recentRawTokens: 10_000,
  rawObservationBatchTokens: 5_000,
  observationReflectionBatchTokens: 5_000,
};

export type RuntimeAgentSessionRuntime = {
  model: CreateRuntimeAgentSessionOptions['model'];
  assistantAuthorId?: string;
  conversationStore: CreateRuntimeAgentSessionOptions['conversationStore'];
  conversationMemory: ReturnType<typeof createForgeConversationMemory>['memory'];
  runtimeActions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  checkpointedOmStateStore?: CreateRuntimeAgentSessionOptions['checkpointedOmStateStore'];
  workingMemoryStore: CreateRuntimeAgentSessionOptions['workingMemoryStore'];
  syncState(): Promise<void>;
};

export async function createRuntimeAgentSessionRuntime(
  input: CreateRuntimeAgentSessionOptions,
): Promise<RuntimeAgentSessionRuntime> {
  const workingMemoryTool = input.workingMemoryTool ?? createUpdateWorkingMemoryTool({
    threadId: input.threadId,
    resourceId: input.resourceId,
    store: input.workingMemoryStore,
  });
  const checkpointedOmLimits = input.checkpointedOmLimits ?? DEFAULT_CHECKPOINTED_OM_LIMITS;
  const checkpointedOmEnabled = input.consolidateConversationOverflow ?? true;
  const conversationMemory = createForgeConversationMemory({
    threadId: input.threadId,
    conversationStore: input.conversationStore,
    stateStore: input.checkpointedStateStore,
    assistantAuthorId: input.assistantAuthorId,
    observer: checkpointedOmEnabled
      ? createCheckpointedConversationObserver({
        model: input.checkpointedOmModel ?? input.model,
        agentSystemPrompt: input.checkpointedOmSystemPrompt ?? input.system,
      })
      : undefined,
    recentMessageLimit: input.maxConversationMessages ?? 20,
    recentTokenLimit: checkpointedOmEnabled ? checkpointedOmLimits.recentRawTokens : undefined,
    observationTokenLimit:
      checkpointedOmEnabled ? checkpointedOmLimits.observationReflectionBatchTokens : undefined,
    overflowObservationTokenLimit:
      checkpointedOmEnabled ? checkpointedOmLimits.rawObservationBatchTokens : undefined,
    consolidateOverflow: checkpointedOmEnabled,
  });
  const runtimeActions = [
    toolToRuntimeAction(workingMemoryTool),
    ...(input.runtimeActions ?? []),
  ];

  return {
    model: input.model,
    assistantAuthorId: input.assistantAuthorId,
    conversationStore: input.conversationStore,
    conversationMemory: conversationMemory.memory,
    runtimeActions,
    checkpointedOmStateStore: input.checkpointedOmStateStore,
    workingMemoryStore: input.workingMemoryStore,
    async syncState() {
      if (checkpointedOmEnabled) {
        await conversationMemory.memory.stabilize();
      } else {
        await conversationMemory.memory.sync();
      }

      if (!input.checkpointedOmStateStore) {
        return;
      }

      await syncCheckpointedOmCompatibility({
        threadId: input.threadId,
        resourceId: input.resourceId,
        conversationStore: input.conversationStore,
        conversationMemory: conversationMemory.memory,
        stateStore: input.checkpointedOmStateStore,
        limits: checkpointedOmLimits,
        reflectionModel: input.checkpointedOmModel ?? input.model,
        agentSystemPrompt: input.checkpointedOmSystemPrompt ?? input.system,
        onCheckpointAdvanced: input.onCheckpointAdvanced,
      });
    },
  };
}
