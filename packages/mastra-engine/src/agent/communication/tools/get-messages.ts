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
    execute: async (input) => {
      try {
        return {
          messages: await communication.getMessages({
            conversationId: input.conversationId,
            limit: input.limit ?? 100,
          }),
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              error: error.message,
              hint: 'The conversation may not exist. Use list_conversations to find valid conversation IDs.',
            };
          }
          return {
            error: error.message,
            hint: 'Review the error message above and verify the conversationId is valid.',
          };
        }
        return {
          error: 'An unknown error occurred while fetching messages',
          hint: 'Verify the conversationId is valid and try again.',
        };
      }
    },
  });
}
