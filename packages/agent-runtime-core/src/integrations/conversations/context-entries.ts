import type { StepContextEntry, StepContextPart } from '../../core/types.js';

import type { ConversationMessage } from './contracts.js';

export function createConversationMessageContextEntry(
  message: ConversationMessage,
): StepContextEntry {
  const textSegments = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);
  const fileSegments = message.parts
    .filter((part) => part.type === 'file')
    .map((part) => `[File ${part.name} ${part.mimeType}]`);
  const content = message.parts.flatMap((part): StepContextPart[] => {
    if (part.type === 'text') {
      return [];
    }

    if (part.type === 'image') {
      return [
        {
          type: 'image',
          mimeType: part.mimeType,
          bytes: part.bytes,
        },
      ];
    }

    return [];
  });

  return {
    id: `conversation-message:${message.id}`,
    kind: `conversation-message:${message.role}`,
    title: buildConversationMessageTitle(message),
    text: [...textSegments, ...fileSegments].join('\n').trim() || undefined,
    content: content.length > 0 ? content : undefined,
    data: normalizeConversationMessageData(message.metadata),
  };
}

function buildConversationMessageTitle(message: ConversationMessage) {
  if (message.authorId != null) {
    return `${message.role} message from ${message.authorId}`;
  }

  return `${message.role} message`;
}

function normalizeConversationMessageData(metadata: ConversationMessage['metadata']) {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const toolInvocations = Array.isArray(metadata.toolInvocations)
    ? metadata.toolInvocations
        .filter(
          (value): value is { toolName: string; args?: unknown } =>
            typeof value === 'object' &&
            value !== null &&
            'toolName' in value &&
            typeof value.toolName === 'string',
        )
        .map((toolInvocation) => ({
          toolName: toolInvocation.toolName,
          args: isPlainObject(toolInvocation.args) ? toolInvocation.args : {},
        }))
    : [];
  const toolResults = Array.isArray(metadata.toolResults)
    ? metadata.toolResults
        .filter(
          (value): value is { toolName: string; result?: unknown } =>
            typeof value === 'object' &&
            value !== null &&
            'toolName' in value &&
            typeof value.toolName === 'string',
        )
        .map((toolResult) => ({
          toolName: toolResult.toolName,
          result: toolResult.result,
        }))
    : [];

  if (toolInvocations.length === 0 && toolResults.length === 0) {
    return undefined;
  }

  return {
    toolInvocations,
    toolResults,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
