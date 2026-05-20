import type { ConversationStore } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

function stripOperationalMemoryPrefix(text: string) {
  return text
    .trim()
    .replace(/^Checkpoint summary:\s*/i, '')
    .replace(/^Active reflection:\s*/i, '')
    .replace(/^Active observation:\s*/i, '')
    .trim();
}

export async function normalizeOperationalMemoryMessages(input: {
  threadId: string;
  conversationStore: ConversationStore;
}) {
  try {
    const messages = await input.conversationStore.listMessages({
      threadId: input.threadId,
      order: 'asc',
    });

    for (const message of messages) {
      if (!message.operationalMemoryType) {
        continue;
      }

      const normalizedParts = message.parts.map((part: { type?: string; text?: string }) => {
        if ((part.type !== 'text' && part.type !== 'reasoning') || typeof part.text !== 'string') {
          return part;
        }

        return {
          ...part,
          text: stripOperationalMemoryPrefix(part.text),
        };
      });
      const roleChanged = message.role !== 'assistant';
      const partsChanged = JSON.stringify(normalizedParts) !== JSON.stringify(message.parts);

      if (!roleChanged && !partsChanged) {
        continue;
      }

      await input.conversationStore.updateMessage({
        threadId: input.threadId,
        messageId: message.id,
        role: 'assistant',
        parts: normalizedParts as any,
      });
    }
  } catch (err) {
    forgeDebug({
      scope: 'normalize-opmem',
      level: 'error',
      message: 'normalizeOperationalMemoryMessages failed',
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
