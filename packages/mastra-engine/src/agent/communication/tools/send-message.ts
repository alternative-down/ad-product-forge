import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    provider: z
      .string()
      .min(1)
      .describe('Which communication provider to use, such as internal-chat, email, or discord.'),
    targetKey: z
      .string()
      .describe('Who or where to send the message in that provider. Use the targetKey returned by list_contacts or list_conversations. Examples: an internal-chat agentId, slug, or group id, an email address, or a Discord username/channel id.'),
    content: z
      .string()
      .min(1)
      .describe('The message text to send.'),
    attachments: z
      .array(z.string())
      .optional()
      .describe('Optional file paths from your workspace to send together with the message.'),
  })
  ;

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description:
      'Send a message through a provider. Use this both to continue an existing conversation and to start a new one when that provider supports it. Returns the sent message information, including the provider, targetKey, and messageId.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) => {
      try {
        const result = await communication.sendMessage({
          provider: input.provider,
          targetKey: input.targetKey,
          content: input.content,
          attachments: input.attachments,
        });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Provider not available')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Use a provider configured for this agent, such as internal-chat, email, or discord.',
            };
          }
          if (error.message.includes('does not support')) {
            return {
              valid: false,
              error: error.message,
              hint: 'This provider does not support sending to this kind of targetKey. Use a key that the provider accepts.',
            };
          }
          if (error.message.includes('Attachment path is outside the workspace')) {
            return {
              valid: false,
              error: error.message,
              hint: 'Use only attachment paths inside the agent workspace.',
            };
          }
          if (error.message.includes('ENOENT')) {
            return {
              valid: false,
              error: error.message,
              hint: 'One of the attachment paths does not exist in the workspace.',
            };
          }
          return {
            valid: false,
            error: error.message,
            hint: 'Verify the provider and targetKey. The targetKey must be valid for that specific provider.',
          };
        }
        return {
          valid: false,
          error: 'An unknown error occurred while sending the message',
          hint: 'Verify the provider and targetKey are correct for the selected provider.',
        };
      }
    },
  });
}
