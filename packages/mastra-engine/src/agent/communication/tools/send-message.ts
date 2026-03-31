import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    conversationKey: z
      .string()
      .describe(
        'Destination for the message. Use the exact conversationKey returned by list_conversations for an existing conversation, or use <provider>:<contactSlug> to start a direct message with a known contact.',
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
        const result = await communication.sendMessage({
          conversationKey: input.conversationKey,
          content: input.content,
          replyToMessageId: input.replyToMessageId ?? undefined,
        });
        return {
          valid: true,
          ...result,
        };
      } catch (error) {
        if (error instanceof Error) {
          // Provide actionable hints based on error type
          if (error.message.includes('Provider not available')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Call list_contacts with filter="self" to see available providers, then use <provider>:<contactSlug> with one of those providers.',
            };
          }
          if (error.message.includes('does not belong to provider')) {
            return {
              valid: false,
              error: error.message,
              hint: 'The conversationKey or replyToMessageId points to a different provider. Use the conversationKey returned by list_conversations and a messageId from that same conversation.',
            };
          }
          if (error.message.includes('Conversation not found')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Use the exact conversationKey returned by list_conversations, or use <provider>:<contactSlug> for a known contact.',
            };
          }
          if (error.message.includes('Contact not found')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Use a known contact slug from list_contacts, prefixed as <provider>:<contactSlug>.',
            };
          }
          if (error.message.includes('no reachable recipients')) {
            return {
              valid: false,
              error: error.message,
              hint: 'The group has no members to receive the message. Add members to the group using add_member_to_group before sending.',
            };
          }
          if (error.message.includes('No destination provided')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Provide a conversationKey from list_conversations, or use <provider>:<contactSlug>.',
            };
          }
          if (error.message.includes('Failed to create conversation')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Could not create the conversation. Verify the conversation value is valid and the provider is configured.',
            };
          }
          // Generic error with original message
          return {
            valid: false,
            error: error.message,
            hint: 'Review the error message above and adjust your request accordingly.',
          };
        }
        // Unknown error type
        return {
          valid: false,
          error: 'An unknown error occurred while sending the message',
          hint: 'Verify the destination conversationKey is valid, or use <provider>:<contactSlug> for a known contact.',
        };
      }
    },
  });
}
