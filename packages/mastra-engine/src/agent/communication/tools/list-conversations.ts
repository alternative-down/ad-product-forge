import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const listConversationsInputSchema = z.object({
  provider: z.string().optional(),
  contactId: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export function createListConversationsTool(communication: CommunicationModule) {
  return createTool({
    id: 'list_conversations',
    description:
      'List message conversations from the agent inbox. Returns both conversationId and providerConversationKey. Use conversationId first for send_message/get_messages. If unread preview messages are returned, they are automatically marked as read.',
    inputSchema: listConversationsInputSchema,
    execute: async (input) => ({
      conversations: await communication.listConversations({
        provider: input.provider,
        contactId: input.contactId,
        unread: input.unread,
        limit: input.limit ?? 20,
      }),
    }),
  });
}
