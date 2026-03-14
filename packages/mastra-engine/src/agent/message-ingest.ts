import { z } from 'zod';

import { contactBook } from './contact-book';
import { attachmentSchema, messageState } from './message-state';

const inboundMessageInputSchema = z.object({
  agentId: z.string(),
  accountId: z.string(),
  messageId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function createMessageIngest() {
  async function ingestInboundMessage(input: z.input<typeof inboundMessageInputSchema>) {
    const message = inboundMessageInputSchema.parse(input);

    await messageState.update((state) => {
      const account = state.accounts.find((current) => current.accountId === message.accountId);

      if (!account) {
        throw new Error(`Account not found for inbound message: ${message.accountId}`);
      }

      const alreadyExists = state.messages.some(
        (current) => current.accountId === message.accountId && current.messageId === message.messageId,
      );

      if (alreadyExists) {
        return;
      }

      if (message.authorId || message.username || message.authorName) {
        contactBook.ensureContact(state, {
          agentId: message.agentId,
          provider: account.provider,
          externalUserId: message.authorId,
          username: message.username,
          displayName: message.authorName,
        });
      }

      state.messages.push({
        messageId: message.messageId,
        accountId: message.accountId,
        direction: 'inbound',
        channelId: message.channelId,
        channelName: message.channelName,
        authorId: message.authorId,
        authorName: message.authorName,
        username: message.username,
        content: message.content,
        attachments: message.attachments,
        unread: true,
        createdAt: message.createdAt,
        metadata: message.metadata,
      });
    });
  }

  return {
    ingestInboundMessage,
  };
}
