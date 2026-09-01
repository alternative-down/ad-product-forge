import type { RuntimePlugin } from '../../core/plugins.js';
import type { RuntimeInput } from '../../core/types.js';

import type { ConversationStore } from './contracts.js';
import { createConversationMessageContextEntry } from './context-entries.js';
import { isConversationRuntimeInputPayload } from './runtime-input.js';

export type ConversationHistoryPluginOptions = {
  store: ConversationStore;
  maxMessages?: number;
  name?: string;
  selectThreadId?(pendingInputs: RuntimeInput[]): string | null;
};

export function createConversationHistoryPlugin(
  options: ConversationHistoryPluginOptions,
): RuntimePlugin {
  const maxMessages = options.maxMessages ?? 20;

  return {
    name: options.name ?? 'conversation-history',
    async provideContext(context) {
      const threadId =
        options.selectThreadId?.(context.pendingInputs) ??
        selectLatestConversationThreadId(context.pendingInputs);

      if (threadId == null) {
        return [];
      }

      const currentMessageIds = new Set(
        context.pendingInputs
          .map((input) =>
            isConversationRuntimeInputPayload(input.payload) ? input.payload.messageId : null,
          )
          .filter((messageId): messageId is string => Boolean(messageId)),
      );
      const messages = await options.store.listMessages({
        threadId,
        limit: maxMessages,
      });

      return messages
        .filter((message) => !currentMessageIds.has(message.id))
        .map(createConversationMessageContextEntry);
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
