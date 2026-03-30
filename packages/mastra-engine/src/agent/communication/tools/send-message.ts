import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    conversationKey: z
      .string()
      .describe(
        'Destination for the message in the format <provider>:<value>. Use the exact conversationKey returned by list_conversations, or use <provider>:<contactSlug> to start a direct message with a known contact.',
      ),
    content: z.string().min(1),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Optional message id to reply to. Use only a recent messageId from the same conversation. If unsure, omit it and send without reply.',
      ),
  })
  ;

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) => {
      try {
        return await communication.sendMessage({
          conversationKey: input.conversationKey,
          content: input.content,
          replyToMessageId: input.replyToMessageId ?? undefined,
        });
      } catch (error) {
        if (error instanceof Error) {
          // Provide actionable hints based on error type
          if (error.message.includes('Provider not available')) {
            return {
              error: error.message,
              hint: 'Call list_contacts with filter="self" to see available providers, then use conversationKey with a valid <provider>:<value> prefix.',
            };
          }
          if (error.message.includes('does not belong to provider')) {
            return {
              error: error.message,
              hint: 'The conversationKey or replyToMessageId points to a different provider. Use a matching <provider>:<value> prefix and messageId from the same conversation.',
            };
          }
          if (error.message.includes('Conversation not found')) {
            return {
              error: error.message,
              hint: 'Use the exact conversationKey returned by list_conversations in the format <provider>:<value>, or use <provider>:<contactSlug> for a known contact.',
            };
          }
          if (error.message.includes('Contact not found')) {
            return {
              error: error.message,
              hint: 'Use a known contact slug from list_contacts, prefixed as <provider>:<contactSlug>.',
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
              hint: 'Provide conversationKey in the format <provider>:<value>.',
            };
          }
          if (error.message.includes('Failed to create conversation')) {
            return {
              error: error.message,
              hint: 'Could not create the conversation. Verify the conversation value is valid and the provider is configured.',
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
          hint: 'Verify the destination conversationKey is valid and uses the format <provider>:<value>.',
        };
      }
    },
  });
}
