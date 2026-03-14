import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { communicationModule } from '../module';

const getMessagesInputSchema = z.object({
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

export function createGetMessagesTool(agentId: string) {
  return createTool({
    id: 'get_messages',
    description:
      'Read the messages from a single conversation. Returned unread messages are automatically marked as read.',
    inputSchema: getMessagesInputSchema,
    execute: async (input) => {
      const messages = await communicationModule.getMessages({
        agentId,
        conversationId: input.conversationId,
        limit: input.limit ?? 100,
      });

      return {
        messages: messages.map((message) => ({
          messageId: message.messageId,
          provider: message.provider,
          channelId: message.channelId,
          channelName: message.channelName,
          contactSlug: message.contactSlug,
          contactDisplayName: message.contactDisplayName,
          content: message.content,
          createdAt: message.createdAt,
        })),
      };
    },
  });
}
