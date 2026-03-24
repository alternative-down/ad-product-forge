import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    provider: z.string(),
    conversationId: z.string().optional().describe('Send inside an existing conversation by its internal conversation id.'),
    contactSlug: z
      .string()
      .optional()
      .describe(
        'Send to a known contact using the exact contact.slug returned by list_contacts or get_contact. Without replyToMessageId, the provider will use direct messaging when supported.',
      ),
    content: z.string().min(1),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Optional message id to reply to. Use only a recent messageId from the same conversation. If unsure, omit it and send without reply.',
      ),
  })
  .refine((input) => Number(Boolean(input.conversationId)) + Number(Boolean(input.contactSlug)) === 1, {
    message: 'Provide exactly one of conversationId or contactSlug.',
  });

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) =>
      communication.sendMessage({
        provider: input.provider,
        conversationId: input.conversationId,
        contactSlug: input.contactSlug,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
      }),
  });
}
