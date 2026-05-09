import { logger } from './logger.js';
import type {
  RuntimeActionDefinition,
} from 'agent-runtime-core/integrations';

import { createOperationalMemoryConversationObserver } from './operational-memory-conversation-observer.js';
import { createForgeConversationMemory, type ForgeConversationMemory } from './memory.js';
import { readOperationalMemoryState } from './operational-memory-state.js';
import { countTokens } from 'agent-runtime-core';
import type { CreateRuntimeAgentSessionOptions } from './runtime-agent-session.js';
import { toolToRuntimeAction } from './tools.js';
import { LibsqlTodoStore, createUpdateTodosAction } from './libsql-todo-store.js';
import { RuntimePlanMode, createPlanModeActions } from './runtime-plan-mode.js';

export type RuntimeAgentSessionRuntime = {
  model: CreateRuntimeAgentSessionOptions['model'];
  assistantAuthorId?: string;
  conversationStore: CreateRuntimeAgentSessionOptions['conversationStore'];
  conversationMemory: ForgeConversationMemory;
  workingMemoryStore?: CreateRuntimeAgentSessionOptions['workingMemoryStore'];
  getRuntimeActions(): Promise<Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>>;
  syncState(input?: {
    diagnostics?: {
      record(event: {
        at: number;
        scope: string;
        phase: string;
        metrics?: Record<string, number | string | null>;
        detail?: Record<string, unknown> | null;
      }): void;
    };
  }): Promise<void>;
};

function requireOperationalMemoryOmLimits(
  input: CreateRuntimeAgentSessionOptions,
) {
  if (!input.checkpointedOmLimits) {
    throw new Error('Operational OM limits are required when conversation overflow consolidation is enabled.');
  }

  return input.checkpointedOmLimits;
}

  // eslint-disable-next-line @typescript-eslint/require-await
export async function createRuntimeAgentSessionRuntime(
  input: CreateRuntimeAgentSessionOptions,
): Promise<RuntimeAgentSessionRuntime> {
  const checkpointedOmEnabled = input.consolidateConversationOverflow === true;
  const checkpointedOmLimits = checkpointedOmEnabled ? requireOperationalMemoryOmLimits(input) : undefined;

  const conversationMemory = createForgeConversationMemory({
    threadId: input.threadId,
    conversationStore: input.conversationStore,
    assistantAuthorId: input.assistantAuthorId,
    observer: checkpointedOmEnabled
      ? createOperationalMemoryConversationObserver({
        model: input.checkpointedOmModel ?? input.model,
        agentSystemPrompt: input.checkpointedOmSystemPrompt ?? input.system,
        loadSupportText: checkpointedOmEnabled
          ? async () => {
            const state = await readOperationalMemoryState({
              threadId: input.threadId,
              store: input.conversationStore,
              recentTokenLimit: checkpointedOmLimits!.recentRawTokens,
            });

            return takeSupportText(
              state.observationMessages.map((message) =>
                message.parts
                  .filter((part): part is Extract<typeof part, { type: 'text' | 'reasoning' }> =>
                    part.type === 'text' || part.type === 'reasoning')
                  .map((part) => part.text.trim())
                  .filter(Boolean)
                  .join('\n')),
              checkpointedOmLimits!.observationSupportTokens,
            );
          }
          : undefined,
      })
      : undefined,
    recentTokenLimit: checkpointedOmEnabled ? checkpointedOmLimits!.recentRawTokens : undefined,
    overflowObservationTokenLimit:
      checkpointedOmEnabled ? checkpointedOmLimits!.rawObservationBatchTokens : undefined,
    consolidateOverflow: checkpointedOmEnabled,
  });
  const staticRuntimeActions = input.workingMemoryTool
    ? [toolToRuntimeAction(input.workingMemoryTool), ...(input.runtimeActions ?? [])]
    : (input.runtimeActions ?? []);
  let todoUpdateTodosAction: RuntimeActionDefinition<Record<string, unknown>, unknown> | undefined;
  if (input.todoStore) {
    const todoLib = new LibsqlTodoStore({ client: input.todoStore.client as unknown, tablePrefix: input.todoStore.tablePrefix ?? 'forge_runtime' });
    todoUpdateTodosAction = createUpdateTodosAction(todoLib, input.threadId, input.resourceId);
  }

  const planMode = input.planMode ?? new RuntimePlanMode({ agentMemoryPath: input.threadId });
  let stepCounter = 0;
  const planModeActions = createPlanModeActions({
    planMode,
    getCurrentStepNumber: () => stepCounter,
  });


  return {
    model: input.model,
    assistantAuthorId: input.assistantAuthorId,
    conversationStore: input.conversationStore,
    conversationMemory,
    async getRuntimeActions() {
      stepCounter++;
      let dynamicRuntimeActions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>> = [];

      if (input.loadRuntimeActions) {
        try {
          dynamicRuntimeActions = await input.loadRuntimeActions();
        } catch (error) {
          logger.warn('runtime', 'Failed to load dynamic runtime actions', { error });
        }
      }

      const allActions = [
        ...staticRuntimeActions,
        ...(todoUpdateTodosAction ? [todoUpdateTodosAction] : []),
        ...dynamicRuntimeActions,
        planModeActions.enterPlanMode,
        planModeActions.exitPlanMode,
      ];
      const isReadOnly = planMode.isInPlanMode;
      return isReadOnly ? planMode.filterReadOnlyActions(allActions) : allActions;
    },
    async syncState(options) {
      options?.diagnostics?.record({
        at: Date.now(),
        scope: 'om',
        phase: 'sync-state-start',
      });

      if (checkpointedOmEnabled) {
        await conversationMemory.memory.stabilize({
          diagnostics: options?.diagnostics,
        });
      } else {
        await conversationMemory.memory.sync({
          diagnostics: options?.diagnostics,
        });
      }

      options?.diagnostics?.record({
        at: Date.now(),
        scope: 'om',
        phase: 'sync-state-after-conversation-memory',
      });

      if (!checkpointedOmLimits) {
        options?.diagnostics?.record({
          at: Date.now(),
          scope: 'om',
          phase: 'sync-state-finished',
        });
        return;
      }


      options?.diagnostics?.record({
        at: Date.now(),
        scope: 'om',
        phase: 'sync-state-finished',
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
  return Math.max(1, countTokens(text));
}
