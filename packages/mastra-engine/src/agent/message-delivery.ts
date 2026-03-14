import { z } from 'zod';

import { contactBook } from './contact-book';
import { messageState, type State } from './message-state';

const sendMessageInputSchema = z
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

export function createMessageDelivery(dependencies: {
  getAgentProviderAccount(state: State, agentId: string, provider: string): State['accounts'][number] | null;
  getSender(accountId: string): ((input: {
    target: string;
    contactSlug?: string;
    content: string;
    replyToMessageId?: string;
  }) => Promise<{ messageId?: string; channelId?: string }>) | null;
}) {
  async function sendAccountMessage(input: z.input<typeof sendMessageInputSchema>) {
    const parsed = sendMessageInputSchema.parse(input);
    const state = await messageState.load();
    const account = dependencies.getAgentProviderAccount(state, parsed.agentId, parsed.provider);

    if (!account) {
      throw new Error(`Provider not found for agent: ${parsed.provider}`);
    }

    const replyToMessageId = parsed.replyToMessageId?.trim() || undefined;
    const repliedMessage = replyToMessageId
      ? state.messages.find(
          (message) => message.accountId === account.accountId && message.messageId === replyToMessageId,
        )
      : undefined;
    let target = parsed.target;

    if (parsed.contactSlug) {
      const contact = contactBook.findContactBySlug(state, parsed.agentId, parsed.contactSlug);
      if (!contact) throw new Error(`Contact not found: ${parsed.contactSlug}`);

      const identity = contact.accounts.find((current) => current.provider === parsed.provider);
      if (!identity) throw new Error(`No ${parsed.provider} identity found for contact: ${parsed.contactSlug}`);

      if (replyToMessageId) {
        target = repliedMessage?.channelId;
        if (!target) throw new Error(`No message context found for reply: ${replyToMessageId}`);
      } else {
        target = identity.externalUserId || identity.username;
        if (!target) throw new Error(`No direct identity found for contact: ${parsed.contactSlug}`);
      }
    }

    if (!target) {
      throw new Error(`Target not resolved for provider: ${parsed.provider}`);
    }

    if (parsed.provider === 'internal-chat' && replyToMessageId && !repliedMessage) {
      throw new Error(`Unknown internal-chat replyToMessageId: ${replyToMessageId}`);
    }

    if (
      parsed.provider === 'internal-chat' &&
      replyToMessageId &&
      repliedMessage?.channelId &&
      repliedMessage.channelId !== target
    ) {
      throw new Error(
        `replyToMessageId ${replyToMessageId} belongs to channel ${repliedMessage.channelId}, but target ${target} was requested.`,
      );
    }

    const sender = dependencies.getSender(account.accountId);
    if (!sender) {
      throw new Error(`No active sender registered for provider: ${parsed.provider}`);
    }

    const sent = await sender({
      target,
      contactSlug: parsed.contactSlug,
      content: parsed.content,
      replyToMessageId,
    });
    const messageId = sent.messageId || `out:${Date.now()}`;
    const channelId = sent.channelId || target;

    await messageState.update((latestState) => {
      latestState.messages.push({
        messageId,
        accountId: account.accountId,
        direction: 'outbound',
        channelId,
        content: parsed.content,
        attachments: [],
        unread: false,
        createdAt: new Date().toISOString(),
        metadata: {
          provider: parsed.provider,
          contactSlug: parsed.contactSlug,
          replyToMessageId,
        },
      });
    });

    return {
      success: true,
      messageId,
    };
  }

  return {
    sendAccountMessage,
  };
}
