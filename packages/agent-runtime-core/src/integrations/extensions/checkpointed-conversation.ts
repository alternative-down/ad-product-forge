import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput } from '../../core/types.js';
import type { CheckpointedConversationMemory } from '../memory/checkpointed-conversation-memory.js';

import { isConversationRuntimeInputPayload } from '../conversations/runtime-input.js';

export type CheckpointedConversationPluginOptions = {
  memory: CheckpointedConversationMemory;
  consolidateAfterStep?: boolean;
  selectThreadId?(pendingInputs: RuntimeInput[]): string | null;
};

export function createCheckpointedConversationPlugin(
  options: CheckpointedConversationPluginOptions,
): RuntimePlugin {
  return {
    name: 'checkpointed-conversation',
    async provideContext(context) {
      const threadId = options.selectThreadId?.(context.pendingInputs) ?? selectLatestConversationThreadId(context.pendingInputs);

      if (!threadId) {
        return [];
      }

      const currentMessageIds = new Set(
        context.pendingInputs
          .map((input) => isConversationRuntimeInputPayload(input.payload) ? input.payload.messageId : null)
          .filter((messageId): messageId is string => Boolean(messageId)),
      );
      const renderedContext = await options.memory.renderContext();

      return renderedContext.filter((entry) => {
        if (!entry.id.startsWith('conversation-message:')) {
          return true;
        }

        return !currentMessageIds.has(entry.id.replace('conversation-message:', ''));
      });
    },
    async onAfterStep() {
      if (options.consolidateAfterStep) {
        await options.memory.stabilize();
        return;
      }

      await options.memory.sync();
    },
  };
}

function selectLatestConversationThreadId(pendingInputs: RuntimeInput[]) {
  for (let index = pendingInputs.length - 1; index >= 0; index -= 1) {
    const payload = pendingInputs[index]?.payload;

    if (isConversationRuntimeInputPayload(payload)) {
      return payload.threadId;
    }
  }

  return null;
}
