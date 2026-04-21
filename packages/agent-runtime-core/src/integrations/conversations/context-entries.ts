import type { StepContextEntry, StepContextPart } from '../../core/types.js';

import type { ConversationMessage } from './contracts.js';

export function createConversationMessageContextEntry(message: ConversationMessage): StepContextEntry {
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
      return [{
        type: 'image',
        mimeType: part.mimeType,
        bytes: part.bytes,
      }];
    }

    return [];
  });

  return {
    id: `conversation-message:${message.id}`,
    kind: 'conversation-message',
    title: buildConversationMessageTitle(message),
    text: [...textSegments, ...fileSegments].join('\n').trim() || undefined,
    content: content.length > 0 ? content : undefined,
  };
}

function buildConversationMessageTitle(message: ConversationMessage) {
  if (message.authorId) {
    return `${message.role} message from ${message.authorId}`;
  }

  return `${message.role} message`;
}
