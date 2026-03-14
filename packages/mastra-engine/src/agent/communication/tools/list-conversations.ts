import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { createCommunicationModule } from '../module';

const listConversationsInputSchema = z.object({
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export function createListConversationsTool(communication: ReturnType<typeof createCommunicationModule>) {
  return createTool({
    id: 'list_conversations',
    description:
      'List message conversations from the agent inbox. If unread preview messages are returned, they are automatically marked as read.',
    inputSchema: listConversationsInputSchema,
    execute: async (input) => ({
      conversations: await communication.listConversations({
        provider: input.provider,
        contactSlug: input.contactSlug,
        unread: input.unread,
        limit: input.limit ?? 20,
      }),
    }),
  });
}
