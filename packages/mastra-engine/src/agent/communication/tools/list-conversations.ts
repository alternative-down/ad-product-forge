import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listConversationsInputSchema = z.object({
  provider: z
    .string()
    .optional()
    .describe('Optional provider filter. Leave empty to list conversations from every provider that supports conversation listing.'),
  unread: z
    .boolean()
    .optional()
    .describe('If true, return only conversations with unread messages.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Maximum number of conversations to return.'),
});

export function createListConversationsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_conversations',
    description:
      'List conversations you can continue through the communication tools. Returns provider, targetKey, name, participants, unread count, and latest message preview when available.',
    inputSchema: listConversationsInputSchema,
    execute: async (input) => {
      try {
        return {
          conversations: await communication.listConversations({
            provider: input.provider,
            unread: input.unread,
            limit: input.limit ?? 20,
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const hint = message.includes('Provider does not support listing conversations')
          ? 'This provider does not support listing conversations through the communication module.'
          : message.includes('Provider not available')
            ? 'Use a provider configured for this agent.'
            : 'Try again in a moment. If the problem persists, verify the selected provider is available.';
        return {
          valid: false,
          error: message,
          hint,
        };
      }
    },
  });
}
