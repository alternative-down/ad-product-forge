import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const getMessagesInputSchema = z.object({
  provider: z
    .string()
    .min(1)
    .describe('Which provider the conversation belongs to, such as internal-chat, email, or discord.'),
  targetKey: z
    .string()
    .min(1)
    .describe('The conversation or destination key to read messages from in that provider.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe('Maximum number of recent messages to return.'),
});

export function createGetMessagesTool(communication: CommunicationModule) {
  return createTool({
    id: 'get_messages',
    description:
      'Read recent messages from one conversation in one provider. Returns the messages for the given provider and targetKey.',
    inputSchema: getMessagesInputSchema,
    execute: async (input) => {
      try {
        return {
          messages: await communication.getMessages({
            provider: input.provider,
            targetKey: input.targetKey,
            limit: input.limit ?? 100,
          }),
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Provider not available')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Use a provider configured for this agent.',
            };
          }
          if (error.message.includes('does not support reading messages')) {
            return {
              valid: false,
              error: error.message,
              hint: 'This provider does not support reading conversation history through the communication module.',
            };
          }
          if (error.message.includes('not found') || error.message.includes('does not exist')) {
            return {
              valid: false,
              error: error.message,
              hint: 'The targetKey may not exist for this provider. Use list_conversations when supported or verify the provider-specific key.',
            };
          }
          return {
            valid: false,
            error: error.message,
            hint: 'Verify the provider and targetKey are valid for that provider.',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while fetching messages',
          hint: 'Verify the provider and targetKey are correct and try again.',
        };
      }
    },
  });
}
