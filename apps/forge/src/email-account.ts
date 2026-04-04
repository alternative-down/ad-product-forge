import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import PostalMime, { type Email } from 'postal-mime';

import type { CommunicationFile, CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

type EmailProviderConfig = {
  id?: string;
  imap: { host: string; port: number; secure: boolean; user: string; password: string };
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  bcc?: string;
};

export function createEmailProvider(config: EmailProviderConfig): CommunicationProvider {
  // Connection timeout in milliseconds (30 seconds)
  const CONNECTION_TIMEOUT_MS = 30_000;
  const RECENT_EMAIL_SCAN_LIMIT = 200;
  const OUTBOUND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  let client: ImapFlow | null = null;
  let reconnectDelayMs = 1000;
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];
  const recentOutboundMessages = new Map<string, Array<{
    messageId: string;
    content: string;
    attachments: CommunicationFile[];
    createdAt: string;
    unread: boolean;
    authorId: string;
    authorDisplayName: string;
  }>>();

  function toUint8Array(value: ArrayBuffer | Uint8Array | string) {
    if (value instanceof Uint8Array) {
      return value;
    }

    if (typeof value === 'string') {
      return new Uint8Array(Buffer.from(value, 'utf8'));
    }

    return new Uint8Array(value);
  }

  function toCommunicationAttachments(email: Email, providerMessageId: string) {
    return (email.attachments ?? []).map((attachment, index) => {
      const data = toUint8Array(attachment.content);

      return {
        name: attachment.filename ?? `${providerMessageId}-${index}`,
        data,
        contentType: attachment.mimeType ?? undefined,
        sizeBytes: data.byteLength,
      };
    });
  }

  function pruneRecentOutboundMessages() {
    const cutoff = Date.now() - OUTBOUND_CACHE_TTL_MS;

    for (const [targetKey, messages] of recentOutboundMessages.entries()) {
      const visibleMessages = messages.filter((message) => Date.parse(message.createdAt) >= cutoff);

      if (visibleMessages.length === 0) {
        recentOutboundMessages.delete(targetKey);
        continue;
      }

      recentOutboundMessages.set(targetKey, visibleMessages);
    }
  }

  function getAddressValue(address?: Email['from']) {
    if (!address || !('address' in address) || !address.address) {
      return null;
    }

    return address.address.toLowerCase();
  }

  function parseFilterDate(value: string | undefined, fieldName: string) {
    if (!value) {
      return null;
    }

    const parsed = Date.parse(value);

    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }

    return parsed;
  }

  function getAddressDisplayName(address?: Email['from']) {
    if (!address || !('address' in address)) {
      return null;
    }

    return address.name || address.address || null;
  }

  function getFirstRecipient(addresses?: Email['to']) {
    if (!addresses) {
      return null;
    }

    for (const address of addresses) {
      if (!('address' in address) || !address.address) {
        continue;
      }

      return {
        address: address.address.toLowerCase(),
        displayName: address.name || address.address,
      };
    }

    return null;
  }

  function resolveConversationParticipant(email: Email) {
    const fromAddress = getAddressValue(email.from);
    const selfAddress = config.imap.user.toLowerCase();

    if (fromAddress && fromAddress !== selfAddress) {
      return {
        targetKey: fromAddress,
        authorId: fromAddress,
        authorDisplayName: getAddressDisplayName(email.from) ?? fromAddress,
      };
    }

    const recipient = getFirstRecipient(email.to);

    if (recipient) {
      return {
        targetKey: recipient.address,
        authorId: selfAddress,
        authorDisplayName: config.imap.user,
      };
    }

    return null;
  }

  function resolveCreatedAt(email: Email) {
    if (typeof email.date === 'string') {
      return email.date;
    }

    if (email.date) {
      const parsedDate = new Date(String(email.date));

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }

    return new Date().toISOString();
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
      connectionTimeout: CONNECTION_TIMEOUT_MS,
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
        const participant = resolveConversationParticipant(parsed);

        if (parsed.from?.address?.toLowerCase() === config.imap.user.toLowerCase()) {
          await currentClient.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          continue;
        }

        if (!participant) {
          await currentClient.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          continue;
        }

        const providerMessageId = parsed.messageId ?? `${uid}-${Date.now()}`;
        await deliverMessage({
          messageId: providerMessageId,
          targetKey: participant.targetKey,
          conversationName: parsed.subject ?? undefined,
          authorId: participant.authorId,
          authorUsername: parsed.from?.address ?? 'unknown',
          authorDisplayName: participant.authorDisplayName,
          content: parsed.text ?? parsed.html?.replace(/<[^>]+>/g, '') ?? '[no content]',
          attachments: toCommunicationAttachments(parsed, providerMessageId),
          createdAt: resolveCreatedAt(parsed),
        });

        await currentClient.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
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

  async function getConnectedClient() {
    if (client) {
      return client;
    }

    return connectImap();
  }

  async function listRecentInboxEmails(limit: number) {
    const currentClient = await getConnectedClient();
    await currentClient.mailboxOpen('INBOX');
    const uids = await currentClient.search({ all: true }, { uid: true });
    const recentUids = Array.isArray(uids)
      ? uids.slice(Math.max(0, uids.length - Math.min(limit, RECENT_EMAIL_SCAN_LIMIT)))
      : [];

    if (recentUids.length === 0) {
      return [];
    }

    const emails: Array<{
      messageId: string;
      targetKey: string;
      authorId: string;
      authorDisplayName: string;
      content: string;
      createdAt: string;
      unread: boolean;
      conversationName?: string;
      attachments: CommunicationFile[];
    }> = [];

    for await (const message of currentClient.fetch(recentUids, { source: true, flags: true }, { uid: true })) {
      if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') {
        continue;
      }

      const source = typeof message.source === 'string' ? message.source : new TextDecoder().decode(message.source);
      const parsed = await PostalMime.parse(source);
      const participant = resolveConversationParticipant(parsed);

      if (!participant) {
        continue;
      }

      const providerMessageId = parsed.messageId ?? `${message.uid ?? Date.now()}-${emails.length}`;
      emails.push({
        messageId: providerMessageId,
        targetKey: participant.targetKey,
        authorId: participant.authorId,
        authorDisplayName: participant.authorDisplayName,
        content: parsed.text ?? parsed.html?.replace(/<[^>]+>/g, '') ?? '[no content]',
        createdAt: resolveCreatedAt(parsed),
        unread: !(message.flags?.has?.('\\Seen') ?? false),
        conversationName: parsed.subject ?? undefined,
        attachments: toCommunicationAttachments(parsed, providerMessageId),
      });
    }

    pruneRecentOutboundMessages();
    return emails;
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
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async listConversations() {
      // TODO: Resolve email conversations by real thread metadata (message-id, in-reply-to, references)
      // instead of grouping only by participant address.
      const inboxEmails = await listRecentInboxEmails(50);
      const grouped = new Map<string, typeof inboxEmails>();

      for (const email of inboxEmails) {
        const existing = grouped.get(email.targetKey) ?? [];
        existing.push(email);
        grouped.set(email.targetKey, existing);
      }

      for (const [targetKey, messages] of recentOutboundMessages.entries()) {
        const existing = grouped.get(targetKey) ?? [];
        existing.push(...messages.map((message) => ({
          ...message,
          targetKey,
        })));
        grouped.set(targetKey, existing);
      }

      return Array.from(grouped.entries())
        .map(([targetKey, messages]) => {
          const ordered = messages.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
          const latest = ordered[ordered.length - 1];

          return {
            provider: config.id ?? 'email',
            targetKey,
            latestMessageAt: latest.createdAt,
            unreadCount: ordered.filter((message) => message.unread).length,
            name: latest.conversationName ?? targetKey,
            participants: [targetKey],
            messages: ordered.slice(-5).map((message) => ({
              messageId: message.messageId,
              provider: config.id ?? 'email',
              authorId: message.authorId,
              targetKey,
              content: message.content,
              attachments: message.attachments,
              unread: message.unread,
              createdAt: message.createdAt,
              authorDisplayName: message.authorDisplayName,
            })),
          };
        })
        .sort((left, right) => Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt));
    },
    async getMessages({ targetKey, limit, offset, query, dateFrom, dateTo }) {
      // TODO: Read email history by thread instead of only by the normalized target address.
      const parsedDateFrom = parseFilterDate(dateFrom, 'dateFrom');
      const parsedDateTo = parseFilterDate(dateTo, 'dateTo');
      const inboxEmails = await listRecentInboxEmails(Math.max((limit + offset) * 4, 50));
      const outboundMessages = recentOutboundMessages.get(targetKey) ?? [];

      return [...inboxEmails.filter((email) => email.targetKey === targetKey), ...outboundMessages.map((message) => ({
        ...message,
        targetKey,
      }))]
        .filter((message) => !query || message.content.includes(query))
        .filter((message) => parsedDateFrom === null || Date.parse(message.createdAt) >= parsedDateFrom)
        .filter((message) => parsedDateTo === null || Date.parse(message.createdAt) <= parsedDateTo)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .slice(Math.max(0, -(limit + offset)), offset > 0 ? -offset : undefined)
        .map((message) => ({
          messageId: message.messageId,
          provider: config.id ?? 'email',
          authorId: message.authorId,
          targetKey,
          content: message.content,
          attachments: message.attachments,
          unread: message.unread,
          createdAt: message.createdAt,
          authorDisplayName: message.authorDisplayName,
        }));
    },
    async sendMessage(input) {
      const recipientAddress = input.targetKey;

      if (!recipientAddress) {
        throw new Error('[email] Cannot send without a targetKey');
      }

      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.password,
        },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
      });

      try {
        const mailOptions: Record<string, unknown> = {
          from: config.smtp.user,
          to: recipientAddress,
          subject: `Message from ${config.smtp.user}`,
          text: input.content,
          bcc: config.bcc,
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.name,
            content: Buffer.from(attachment.data),
            contentType: attachment.contentType,
          })),
        };

        const info = await transporter.sendMail(mailOptions);
        const createdAt = new Date().toISOString();
        const existingOutbound = recentOutboundMessages.get(recipientAddress) ?? [];
        existingOutbound.push({
          messageId: info.messageId,
          content: input.content,
          attachments: input.attachments,
          createdAt,
          unread: false,
          authorId: config.imap.user,
          authorDisplayName: config.imap.user,
        });
        recentOutboundMessages.set(recipientAddress, existingOutbound);
        pruneRecentOutboundMessages();

        return {
          messageId: info.messageId,
          targetKey: recipientAddress,
          conversationName: String(mailOptions.subject),
        };
      } finally {
        await transporter.close();
      }
    },
  };
}
