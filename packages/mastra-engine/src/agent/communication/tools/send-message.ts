import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';

const sendMessageInputSchema = z
  .object({
    provider: z.string().optional().describe('The provider to send through. If not provided, the agent will automatically select the best available provider.'),
    conversationId: z.string().optional().describe('Send inside an existing conversation by its internal conversation id.'),
    providerConversationKey: z
      .string()
      .optional()
      .describe(
        'Send inside an existing conversation by its provider conversation key. Prefer conversationId when available. Useful for internal chat groups and provider-native thread keys.',
      ),
    contactId: z
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
  .refine(
    (input) =>
      Number(Boolean(input.conversationId)) +
        Number(Boolean(input.providerConversationKey)) +
        Number(Boolean(input.contactId)) >=
      1,
    {
      message: 'Provide at least one of conversationId, providerConversationKey, or contactId.',
    },
  );

export function createSendMessageTool(communication: CommunicationModule) {
  return createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) =>
      communication.sendMessage({
        provider: input.provider,
        conversationId: input.conversationId,
        providerConversationKey: input.providerConversationKey,
        contactId: input.contactId,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
      }),
  });
}
