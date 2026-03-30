import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    conversation: z
      .string()
      .describe(
        'Destination for the message. Use the exact conversationKey returned by list_conversations in the format <provider>:<value>, or use a contact slug returned by list_contacts/get_contact to start a direct message.',
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
          conversation: input.conversation,
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
              hint: 'Use the exact conversationKey returned by list_conversations in the format <provider>:<value>, or use a valid contact slug.',
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
              hint: 'Provide conversation using either a conversationKey from list_conversations or a contact slug from list_contacts/get_contact.',
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
          hint: 'Verify the destination conversation is valid and the provider is available.',
        };
      }
    },
  });
}
