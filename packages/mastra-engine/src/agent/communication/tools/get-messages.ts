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
    .describe('The targetKey of the conversation you want to read. Use the same targetKey returned by list_conversations, or another key that this provider accepts.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe('Maximum number of recent messages to return.'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('How many most-recent messages to skip before returning results. Use this to page through older messages.'),
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional text filter. Only messages containing this text will be returned.'),
  dateFrom: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional start of the time window. Use an ISO date or date-time, such as 2026-04-01 or 2026-04-01T09:00:00Z.'),
  dateTo: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional end of the time window. Use an ISO date or date-time, such as 2026-04-01 or 2026-04-01T18:00:00Z.'),
});

export function createGetMessagesTool(communication: CommunicationModule) {
  return createTool({
    id: 'get_messages',
    description:
      'Read recent messages from one conversation. Use the provider and targetKey of the conversation you want to inspect. Returns the messages from that conversation.',
    inputSchema: getMessagesInputSchema,
    execute: async (input) => {
      try {
        return {
          messages: await communication.getMessages({
            provider: input.provider,
            targetKey: input.targetKey,
            limit: input.limit ?? 100,
            offset: input.offset ?? 0,
            query: input.query ?? undefined,
            dateFrom: input.dateFrom ?? undefined,
            dateTo: input.dateTo ?? undefined,
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
