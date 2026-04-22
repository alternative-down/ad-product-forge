import {
  createTextStepContextEntry,
  isConversationRuntimeInputPayload,
  type StepContextEntry,
} from 'agent-runtime-core/integrations';

export function createConversationRuntimeContextFormatter() {
  return {
    formatInput(runtimeInput: {
      id: string;
      type: string;
      payload: unknown;
    }) {
      if (isConversationRuntimeInputPayload(runtimeInput.payload)) {
        const text = runtimeInput.payload.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text.trim())
          .filter(Boolean)
          .join('\n')
          .trim();
        const content = runtimeInput.payload.parts
          .filter((part) => part.type === 'image')
          .map((part) => ({
            type: 'image' as const,
            mimeType: part.mimeType,
            bytes: part.bytes,
          }));

        return {
          id: `conversation-message:${runtimeInput.payload.messageId}`,
          kind: `input:conversation-message:${runtimeInput.payload.role}`,
          title: runtimeInput.payload.authorId
            ? `${runtimeInput.payload.role} message from ${runtimeInput.payload.authorId}`
            : `${runtimeInput.payload.role} message`,
          text: text || undefined,
          content: content.length > 0 ? content : undefined,
        };
      }

      return createTextStepContextEntry({
        id: runtimeInput.id,
        kind: `input:${runtimeInput.type}`,
        title: `Input ${runtimeInput.type}`,
        text: JSON.stringify(runtimeInput.payload, null, 2),
      });
    },
    formatActionResults(previousStepNumber: number, actionResults: unknown[]) {
      return {
        id: `action-results:${previousStepNumber}`,
        kind: 'action-results',
        title: 'Previous action results',
        data: actionResults,
        content: [],
      } satisfies StepContextEntry;
    },
  };
}
