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
  observationSupportTokens: 2_000,
  reflectionSupportTokens: 2_000,
};

export type RuntimeAgentSessionRuntime = {
  model: CreateRuntimeAgentSessionOptions['model'];
  assistantAuthorId?: string;
  conversationStore: CreateRuntimeAgentSessionOptions['conversationStore'];
  conversationMemory: ReturnType<typeof createForgeConversationMemory>['memory'];
  checkpointedOmStateStore?: CreateRuntimeAgentSessionOptions['checkpointedOmStateStore'];
  workingMemoryStore: CreateRuntimeAgentSessionOptions['workingMemoryStore'];
  getRuntimeActions(): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
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
        loadSupportText: input.checkpointedOmStateStore
          ? async () => {
            const state = await input.checkpointedOmStateStore!.loadState({
              threadId: input.threadId,
              resourceId: input.resourceId,
            });

            if (!state) {
              return null;
            }

            return takeSupportText(
              state.observationBlocks
                .filter((block) => block.reflectedGeneration === null)
                .map((block) => block.text),
              checkpointedOmLimits.observationSupportTokens ?? DEFAULT_CHECKPOINTED_OM_LIMITS.observationSupportTokens,
            );
          }
          : undefined,
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
  const staticRuntimeActions = [
    toolToRuntimeAction(workingMemoryTool),
    ...(input.runtimeActions ?? []),
  ];

  return {
    model: input.model,
    assistantAuthorId: input.assistantAuthorId,
    conversationStore: input.conversationStore,
    conversationMemory: conversationMemory.memory,
    checkpointedOmStateStore: input.checkpointedOmStateStore,
    workingMemoryStore: input.workingMemoryStore,
    async getRuntimeActions() {
      let dynamicRuntimeActions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [];

      if (input.loadRuntimeActions) {
        try {
          dynamicRuntimeActions = await input.loadRuntimeActions();
        } catch (error) {
          console.warn('[RuntimeAgentSession] Failed to load dynamic runtime actions:', error);
        }
      }

      return [
        ...staticRuntimeActions,
        ...dynamicRuntimeActions,
      ];
    },
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

function takeSupportText(observations: string[], tokenLimit: number) {
  if (tokenLimit <= 0) {
    return '';
  }

  const selected: string[] = [];
  let usedTokens = 0;

  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const text = observations[index]?.trim();

    if (!text) {
      continue;
    }

    const tokenCount = estimateTokenCount(text);

    if (usedTokens + tokenCount > tokenLimit) {
      break;
    }

    selected.unshift(text);
    usedTokens += tokenCount;
  }

  return selected.join('\n');
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
