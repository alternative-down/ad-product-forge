import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { messageRouter } from '../message-router';

const sendMessageInputSchema = z
  .object({
    provider: z.string(),
    target: z.string().optional().describe('Send to a channel, thread, or conversation directly.'),
    contactSlug: z
      .string()
      .optional()
      .describe(
        'Send to a known contact. Without replyToMessageId, the provider will use direct messaging when supported.',
      ),
    content: z.string().min(1),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Optional message id to reply to. Use only a recent messageId from the same conversation. If unsure, omit it and send without reply.',
      ),
  })
  .refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
    message: 'Provide exactly one of target or contactSlug.',
  });

export function createSendMessageTool(agentId: string) {
  return createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input) =>
      messageRouter.sendMessage({
        agentId,
        provider: input.provider,
        target: input.target,
        contactSlug: input.contactSlug,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
      }),
  });
}
