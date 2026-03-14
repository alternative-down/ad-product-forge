import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { communicationModule } from '../module';

const listConversationsInputSchema = z.object({
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

export function createListConversationsTool(agentId: string) {
  return createTool({
    id: 'list_conversations',
    description:
      'List message conversations from the agent inbox. If unread preview messages are returned, they are automatically marked as read.',
    inputSchema: listConversationsInputSchema,
    execute: async (input) => {
      const conversations = await communicationModule.listConversations({
        agentId,
        provider: input.provider,
        contactSlug: input.contactSlug,
        unread: input.unread,
        limit: input.limit ?? 20,
      });

      return {
        conversations: conversations.map((conversation) => ({
          conversationId: conversation.conversationId,
          provider: conversation.provider,
          channelId: conversation.channelId,
          channelName: conversation.channelName,
          contactSlug: conversation.contactSlug,
          contactDisplayName: conversation.contactDisplayName,
          latestMessageAt: conversation.latestMessageAt,
          unreadCount: conversation.unreadCount,
          messages: conversation.messages.map((message) => ({
            messageId: message.messageId,
            provider: message.provider,
            channelId: message.channelId,
            channelName: message.channelName,
            contactSlug: message.contactSlug,
            contactDisplayName: message.contactDisplayName,
            content: message.content,
            createdAt: message.createdAt,
          })),
        })),
      };
    },
  });
}
