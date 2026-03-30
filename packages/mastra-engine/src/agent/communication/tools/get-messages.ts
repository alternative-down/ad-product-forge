import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const getMessagesInputSchema = z.object({
  conversationKey: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

export function createGetMessagesTool(communication: CommunicationModule) {
  return createTool({
    id: 'get_messages',
    description:
      'Read the messages from a single conversation by conversationKey. Returned unread messages are automatically marked as read.',
    inputSchema: getMessagesInputSchema,
    execute: async (input) => {
      try {
        return {
          messages: await communication.getMessages({
            conversationKey: input.conversationKey,
            limit: input.limit ?? 100,
          }),
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              error: error.message,
              hint: 'The conversation may not exist. Use list_conversations to find a valid conversationKey.',
            };
          }
          return {
            error: error.message,
            hint: 'Review the error message above and verify the conversationKey is valid.',
          };
        }
        return {
          error: 'An unknown error occurred while fetching messages',
          hint: 'Verify the conversationKey is valid and try again.',
        };
      }
    },
  });
}
