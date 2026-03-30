import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    provider: z.string().nullish().describe('The provider to send through. If not provided, the system will select an available provider.'),
    conversationKey: z
      .string()
      .optional()
      .describe(
        'Send inside an existing conversation by its conversation key. Use the exact conversationKey returned by list_conversations.',
      ),
    contactSlug: z
      .string()
      .optional()
      .describe(
        'Send to a known contact using the exact contact slug returned by list_contacts or get_contact. Without replyToMessageId, the provider will use direct messaging when supported.',
      ),
    content: z.string().min(1),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Optional message id to reply to. Use only a recent messageId from the same conversation. If unsure, omit it and send without reply.',
      ),
  })
  .refine(
    (input) =>
      Number(Boolean(input.conversationKey)) +
        Number(Boolean(input.contactSlug)) >=
      1,
    {
      message: 'Provide at least one of conversationKey or contactSlug.',
    },
  );

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) => {
      try {
        return await communication.sendMessage({
          provider: input.provider ?? undefined,
          conversationKey: input.conversationKey ?? undefined,
          contactSlug: input.contactSlug ?? undefined,
          content: input.content,
          replyToMessageId: input.replyToMessageId ?? undefined,
        });
      } catch (error) {
        if (error instanceof Error) {
          // Provide actionable hints based on error type
          if (error.message.includes('Provider not available')) {
            return {
              error: error.message,
              hint: 'Call list_contacts with filter="self" to see available providers, then specify provider in the request.',
            };
          }
          if (error.message.includes('does not belong to provider')) {
            return {
              error: error.message,
              hint: 'The conversation or message belongs to a different provider. Use the correct provider or omit it to let the system auto-select.',
            };
          }
          if (error.message.includes('Conversation not found')) {
            return {
              error: error.message,
              hint: 'The conversationKey provided does not exist. Use list_conversations to find a valid conversationKey, or use contactSlug instead.',
            };
          }
          if (error.message.includes('ambiguous')) {
            return {
              error: error.message,
              hint: 'Provide provider together with conversationKey when the same key may exist in multiple providers.',
            };
          }
          if (error.message.includes('no reachable recipients')) {
            return {
              error: error.message,
              hint: 'The group has no members to receive the message. Add members to the group using add_member_to_group before sending.',
            };
          }
          if (error.message.includes('No destination provided')) {
            return {
              error: error.message,
              hint: 'Provide at least one of: conversationKey or contactSlug to specify where to send the message.',
            };
          }
          if (error.message.includes('Failed to create conversation')) {
            return {
              error: error.message,
              hint: 'Could not create the conversation. Verify the conversationKey is valid and the provider is configured.',
            };
          }
          // Generic error with original message
          return {
            error: error.message,
            hint: 'Review the error message above and adjust your request accordingly.',
          };
        }
        // Unknown error type
        return {
          error: 'An unknown error occurred while sending the message',
          hint: 'Verify the provider is available and the destination (conversationKey or contactSlug) is valid.',
        };
      }
    },
  });
}
