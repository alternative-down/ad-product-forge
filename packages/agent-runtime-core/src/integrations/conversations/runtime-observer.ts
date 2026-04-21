import type { RuntimeObserver } from '../../core/observers.js';
import { getStepMessageText } from '../../core/step-output.js';

import type { ConversationStore } from './contracts.js';
import { isConversationRuntimeInputPayload } from './runtime-input.js';

export type ConversationRuntimeObserverOptions = {
  store: ConversationStore;
  authorId?: string;
  name?: string;
};

export function createConversationRuntimeObserver(
  options: ConversationRuntimeObserverOptions,
): RuntimeObserver {
  return {
    name: options.name ?? 'conversation-runtime-observer',
    async onAfterStep(context) {
      const latestConversationInput = [...context.record.inputs]
        .reverse()
        .find((input) => isConversationRuntimeInputPayload(input.payload));
      const payload = latestConversationInput?.payload;

      if (!payload || !isConversationRuntimeInputPayload(payload)) {
        return;
      }

      const messageText = getStepMessageText(context.record);

      if (!messageText) {
        return;
      }

      await options.store.appendMessage({
        id: `${context.record.id}:assistant`,
        threadId: payload.threadId,
        role: 'assistant',
        authorId: options.authorId,
        parts: [{
          type: 'text',
          text: messageText,
        }],
        metadata: {
          runtimeId: context.snapshot.runtimeId,
          stepId: context.record.id,
          stepNumber: context.record.stepNumber,
        },
        createdAt: context.record.finishedAt,
      });
    },
  };
}
