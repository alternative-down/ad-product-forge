/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { type RuntimeInput } from 'agent-runtime-core';
import {
  createTextStepContextEntry,
  isConversationRuntimeInputPayload,
  type StepContextEntry,
  type ConversationRuntimeInputPayload,
} from 'agent-runtime-core/integrations';

const INTERNAL_RUNTIME_INPUT_TYPES = new Set([
  'forge-provider-options',
  'forge-system-instruction',
]);

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; mimeType: string; bytes: Uint8Array };
// FilePart used for type documentation; kept for future extensibility
type _FilePart = { type: 'file'; mimeType: string; name: string; bytes: Uint8Array };
// ReasoningPart used for type documentation
type _ReasoningPart = { type: 'reasoning'; text: string };

export function createConversationRuntimeContextFormatter() {
  return {
    formatInput(runtimeInput: RuntimeInput): StepContextEntry | null {
      if (INTERNAL_RUNTIME_INPUT_TYPES.has(runtimeInput.type)) {
        return null;
      }

      if (isConversationRuntimeInputPayload(runtimeInput.payload)) {
        const payload = runtimeInput.payload as ConversationRuntimeInputPayload;
        const parts = payload.parts as unknown[];

        const textParts = parts.filter(
          (p): p is TextPart => (p as { type: string }).type === 'text',
        );
        const text = textParts
          .map((p) => p.text.trim())
          .filter(Boolean)
          .join('\n')
          .trim();

        const imageParts = parts.filter(
          (p): p is ImagePart => (p as { type: string }).type === 'image',
        );
        const content = imageParts.map((p) => ({
          type: 'image' as const,
          mimeType: p.mimeType,
          bytes: p.bytes,
        }));

        return {
          id: `conversation-message:${payload.messageId}`,
          kind: `input:conversation-message:${payload.role}`,
          title: payload.authorId
            ? `${payload.role} message from ${payload.authorId}`
            : `${payload.role} message`,
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
      };
    },
  };
}
