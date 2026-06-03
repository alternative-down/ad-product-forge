import type { RuntimeObserver } from '../../core/observers.js';
import { getStepMessageText } from '../../core/step-output.js';

import type { ConversationStore } from './contracts.js';
import { isConversationRuntimeInputPayload } from './runtime-input.js';

export type ConversationRuntimeObserverOptions = {
  store: ConversationStore;
  authorId?: string;
  threadId?: string;
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

      const threadId =
        payload != null && isConversationRuntimeInputPayload(payload) ? payload.threadId : options.threadId;

      if (threadId == null) {
        return;
      }

      const messageText = getStepMessageText(context.record);
      const toolInvocations = context.record.modelResponse.actionRequests.map((actionRequest) => ({
        toolName: actionRequest.name,
        args: actionRequest.input,
      }));
      const toolResults = context.record.actionResults.map((actionResult) => ({
        toolName: actionResult.name,
        result: actionResult.output,
      }));

      if (!messageText && toolInvocations.length === 0 && toolResults.length === 0) {
        return;
      }

      await options.store.appendMessage({
        id: `${context.record.id}:assistant`,
        threadId,
        role: 'assistant',
        authorId: options.authorId,
        parts: messageText
          ? [
              {
                type: 'text' as const,
                text: messageText,
              },
            ]
          : [],
        metadata: {
          runtimeId: context.snapshot.runtimeId,
          stepId: context.record.id,
          stepNumber: context.record.stepNumber,
          toolInvocations,
          toolResults,
        },
        createdAt: context.record.finishedAt,
      });
    },
  };
}
