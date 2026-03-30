import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const getMessagesInputSchema = z.object({
  conversationKey: z.string(),
  provider: z.string().optional(),
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
            provider: input.provider ?? undefined,
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
          if (error.message.includes('ambiguous')) {
            return {
              error: error.message,
              hint: 'Provide provider together with conversationKey when the same key may exist in multiple providers.',
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
