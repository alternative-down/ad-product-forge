import { z } from 'zod';

import { messageStore } from './message-store';

const sendMessageSchema = z
  .object({
    agentId: z.string(),
    provider: z.string(),
    target: z.string().optional(),
    contactSlug: z.string().optional(),
    content: z.string().min(1),
    replyToMessageId: z.string().optional(),
  })
  .refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
    message: 'Provide exactly one of target or contactSlug',
  });

type SenderInput = {
  target: string;
  contactSlug?: string;
  content: string;
  replyToMessageId?: string;
};

type SenderResult = {
  messageId?: string;
  channelId?: string;
};

export function createMessageRouter() {
  const senders = new Map<string, (input: SenderInput) => Promise<SenderResult>>();

  function registerSender(accountId: string, sender: (input: SenderInput) => Promise<SenderResult>) {
    senders.set(accountId, sender);
  }

  function unregisterSender(accountId: string) {
    senders.delete(accountId);
  }

  async function sendMessage(rawInput: unknown) {
    const input = sendMessageSchema.parse(rawInput);
    const account = await messageStore.getAgentProviderAccount(input.agentId, input.provider);

    if (!account) {
      throw new Error(`Provider not found for agent: ${input.provider}`);
    }

    const replyToMessageId = input.replyToMessageId?.trim() || undefined;
    const repliedMessage = replyToMessageId
      ? await messageStore.findMessage(account.accountId, replyToMessageId)
      : null;
    let target = input.target;

    if (input.contactSlug) {
      const contact = await messageStore.findContact(input.agentId, input.contactSlug);
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

    const sender = senders.get(account.accountId);
    if (!sender) {
      throw new Error(`No active sender registered for provider: ${input.provider}`);
    }

    const sent = await sender({
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
  }

  return {
    registerSender,
    unregisterSender,
    sendMessage,
  };
}

export const messageRouter = createMessageRouter();
