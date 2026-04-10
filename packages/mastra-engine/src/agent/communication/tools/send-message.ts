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
    action: z
      .enum(['send', 'send_with_attachments'])
      .describe('Use send for a plain message. Use send_with_attachments when the message must include workspace file paths.'),
    send: z
      .object({
        content: z
          .string()
          .min(1)
          .describe('The exact message text to actually deliver to the recipient.'),
      })
      .nullish()
      .describe('Provide this object only when action is send.'),
    sendWithAttachments: z
      .object({
        content: z
          .string()
          .min(1)
          .describe('The exact message text to actually deliver to the recipient together with the attachments.'),
        attachments: z
          .array(z.string())
          .nullish()
          .describe('Required workspace file paths to send with the message. Pass an array of string paths. Do not pass null.'),
      })
      .nullish()
      .describe('Provide this object only when action is send_with_attachments.'),
  })
  ;

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description:
      'Actually deliver a message through a provider. Use this both to continue an existing conversation and to start a new one when that provider supports it. Writing plain text in your response does not send anything. A message is only delivered when this tool is called successfully. The result confirms delivery with provider, targetKey, and messageId, and may also include unread messages that were still pending in that conversation.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) => {
      try {
        if (input.action === 'send') {
          if (!input.send) {
            return {
              valid: false,
              error: 'send is required when action is send',
              hint: 'Provide send.content for a plain message.',
            };
          }

          const result = await communication.sendMessage({
            provider: input.provider,
            targetKey: input.targetKey,
            content: input.send.content,
          });
          return result;
        }

        if (!input.sendWithAttachments) {
          return {
            valid: false,
            error: 'sendWithAttachments is required when action is send_with_attachments',
            hint: 'Provide sendWithAttachments.content and sendWithAttachments.attachments.',
          };
        }

        if (!input.sendWithAttachments.attachments || input.sendWithAttachments.attachments.length === 0) {
          return {
            valid: false,
            error: 'sendWithAttachments.attachments is required when action is send_with_attachments',
            hint: 'Pass an array of workspace file paths in sendWithAttachments.attachments.',
          };
        }

        const result = await communication.sendMessage({
          provider: input.provider,
          targetKey: input.targetKey,
          content: input.sendWithAttachments.content,
          attachments: input.sendWithAttachments.attachments,
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
