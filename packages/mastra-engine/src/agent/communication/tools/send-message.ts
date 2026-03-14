import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { agentAccounts } from '../agent-accounts';
import { agentContacts } from '../agent-contacts';
import { accountDeliveries } from '../account-deliveries';
import { messageStore } from '../message-store';

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
    execute: async (input) => {
      const account = await agentAccounts.getAgentProviderAccount(agentId, input.provider);

      if (!account) {
        throw new Error(`Provider not found for agent: ${input.provider}`);
      }

      const replyToMessageId = input.replyToMessageId?.trim() || undefined;
      const repliedMessage = replyToMessageId
        ? await messageStore.findMessage(account.accountId, replyToMessageId)
        : null;
      let target = input.target;

      if (input.contactSlug) {
        const contact = await agentContacts.getAgentContact(agentId, input.contactSlug);
        if (!contact) {
          throw new Error(`Contact not found: ${input.contactSlug}`);
        }

        const identity = contact.accounts.find((current) => current.provider === input.provider);
        if (!identity) {
          throw new Error(`No ${input.provider} identity found for contact: ${input.contactSlug}`);
        }

        if (replyToMessageId) {
          target = repliedMessage?.channelId;
          if (!target) {
            throw new Error(`No message context found for reply: ${replyToMessageId}`);
          }
        } else {
          target = identity.externalUserId || identity.username;
          if (!target) {
            throw new Error(`No direct identity found for contact: ${input.contactSlug}`);
          }
        }
      }

      if (!target) {
        throw new Error(`Target not resolved for provider: ${input.provider}`);
      }

      if (input.provider === 'internal-chat' && replyToMessageId && !repliedMessage) {
        throw new Error(`Unknown internal-chat replyToMessageId: ${replyToMessageId}`);
      }

      if (
        input.provider === 'internal-chat' &&
        replyToMessageId &&
        repliedMessage?.channelId &&
        repliedMessage.channelId !== target
      ) {
        throw new Error(
          `replyToMessageId ${replyToMessageId} belongs to channel ${repliedMessage.channelId}, but target ${target} was requested.`,
        );
      }

      const delivery = accountDeliveries.get(account.accountId);
      if (!delivery) {
        throw new Error(`No active delivery registered for provider: ${input.provider}`);
      }

      const sent = await delivery({
        target,
        contactSlug: input.contactSlug,
        content: input.content,
        replyToMessageId,
      });
      const messageId = sent.messageId || `out:${Date.now()}`;

      await messageStore.saveOutboundMessage({
        accountId: account.accountId,
        provider: input.provider,
        messageId,
        channelId: sent.channelId || target,
        content: input.content,
        contactSlug: input.contactSlug,
        replyToMessageId,
      });

      return {
        success: true,
        messageId,
      };
    },
  });
}
