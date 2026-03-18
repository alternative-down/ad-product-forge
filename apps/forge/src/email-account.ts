import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import PostalMime from 'postal-mime';

import type { Attachment, CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

type EmailProviderConfig = {
  id?: string;
  imap: { host: string; port: number; secure: boolean; user: string; password: string };
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  bcc?: string;
};

export function createEmailProvider(config: EmailProviderConfig): CommunicationProvider {
  let client: ImapFlow | null = null;
  let reconnectDelayMs = 1000;
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];

  function resolveConversationKey(messageId: string, references?: string | null) {
    const firstReference = references?.trim().split(/\s+/).find(Boolean);
    return firstReference ?? messageId;
  }

  async function connectImap() {
    const nextClient = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: {
        user: config.imap.user,
        pass: config.imap.password,
      },
      logger: false,
    });

    await nextClient.connect();
    await nextClient.mailboxOpen('INBOX');

    client = nextClient;
    reconnectDelayMs = 1000;
    console.log('[email] Connected to IMAP server');

    nextClient.on('close', () => {
      if (client === nextClient) {
        client = null;
      }

      console.log('[email] Connection closed');
      void reconnect();
    });

    nextClient.on('exists', () => {
      void processUnseenMessages(nextClient);
    });

    return nextClient;
  }

  async function deliverMessage(message: CommunicationInboundMessage) {
    if (!onInboundMessage) {
      pendingMessages.push(message);
      return;
    }

    await onInboundMessage(message);
  }

  async function flushPendingMessages() {
    if (!onInboundMessage || pendingMessages.length === 0) {
      return;
    }

    while (pendingMessages.length > 0) {
      const message = pendingMessages.shift();

      if (!message) {
        return;
      }

      await onInboundMessage(message);
    }
  }

  async function processMessage(uid: number, currentClient: ImapFlow) {
    try {
      const fetchResult = await currentClient.fetch(String(uid), { source: true });

      for await (const message of fetchResult) {
        if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') {
          continue;
        }

        const source = typeof message.source === 'string' ? message.source : new TextDecoder().decode(message.source);
        const parsed = await PostalMime.parse(source);

        if (parsed.from?.address?.toLowerCase() === config.imap.user.toLowerCase()) {
          continue;
        }

        const providerMessageId = parsed.messageId ?? `${uid}-${Date.now()}`;
        const attachments: Attachment[] = (parsed.attachments ?? []).map((attachment, index) => ({
          id: attachment.contentId ?? `${providerMessageId}:${index}`,
          name: attachment.filename ?? undefined,
          url: '',
          contentType: attachment.mimeType ?? undefined,
          sizeBytes:
            typeof attachment.content === 'string'
              ? Buffer.byteLength(attachment.content, 'utf8')
              : attachment.content.byteLength,
        }));

        await deliverMessage({
          providerMessageId,
          providerConversationKey: resolveConversationKey(providerMessageId, parsed.references),
          conversationName: parsed.subject ?? undefined,
          authorExternalId: parsed.from?.address ?? 'unknown',
          authorUsername: parsed.from?.address ?? 'unknown',
          authorDisplayName: parsed.from?.name ?? parsed.from?.address ?? 'unknown',
          content: parsed.text ?? parsed.html?.replace(/<[^>]+>/g, '') ?? '[no content]',
          attachments,
          createdAt: parsed.date ?? new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[email] Error processing message:', error);
    }
  }

  async function processUnseenMessages(currentClient: ImapFlow) {
    try {
      const unseenUids = await currentClient.search({ seen: false });

      if (!Array.isArray(unseenUids) || unseenUids.length === 0) {
        return;
      }

      for (const uid of unseenUids) {
        await processMessage(uid, currentClient);
      }
    } catch (error) {
      console.error('[email] Error fetching unseen messages:', error);
    }
  }

  async function reconnect() {
    await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    void listen();
  }

  async function listen() {
    try {
      const currentClient = await connectImap();
      await processUnseenMessages(currentClient);

      while (client === currentClient) {
        await currentClient.idle();
      }
    } catch (error) {
      console.error('[email] Listener error:', error);
      if (!client) {
        void reconnect();
      }
    }
  }

  void listen();

  return {
    id: config.id ?? 'email',
    async getAccount() {
      return {
        externalAccountId: config.imap.user,
        displayName: config.imap.user,
      };
    },
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async sendMessage(input) {
      const recipientAddress = input.contactExternalId;

      if (!recipientAddress) {
        throw new Error(`[email] Cannot send: no recipient address resolved for conversation ${input.providerConversationKey}`);
      }

      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.password,
        },
      });

      try {
        const isReply = Boolean(input.providerConversationKey);
        const mailOptions: Record<string, unknown> = {
          from: config.smtp.user,
          to: recipientAddress,
          subject: isReply ? `Re: ${input.providerConversationKey}` : 'Message from agent',
          text: input.content,
          bcc: config.bcc,
        };

        if (input.providerConversationKey) {
          mailOptions.inReplyTo = input.providerConversationKey;
          mailOptions.references = input.providerConversationKey;
        }

        const info = await transporter.sendMail(mailOptions);

        return {
          providerMessageId: info.messageId,
          providerConversationKey: input.providerConversationKey ?? info.messageId,
        };
      } finally {
        await transporter.close();
      }
    },
    async syncContacts() {
      return [];
    },
  };
}
