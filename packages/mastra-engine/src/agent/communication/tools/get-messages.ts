import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const getMessagesInputSchema = z.object({
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

export function createGetMessagesTool(communication: CommunicationModule) {
  return createTool({
    id: 'get_messages',
    description:
      'Read the messages from a single conversation. Returned unread messages are automatically marked as read.',
    inputSchema: getMessagesInputSchema,
    execute: async (input) => ({
      messages: await communication.getMessages({
        conversationId: input.conversationId,
        limit: input.limit ?? 100,
      }),
    }),
  });
}
