import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    provider: z.string().min(1),
    targetKey: z
      .string()
      .describe('Provider-specific destination key. The module does not interpret this value; it is passed directly to the selected provider.'),
    content: z.string().min(1),
    attachments: z.array(z.string()).optional().describe('Workspace file paths to send as attachments.'),
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
