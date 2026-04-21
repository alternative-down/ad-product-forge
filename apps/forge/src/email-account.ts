import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import PostalMime, { type Email } from 'postal-mime';

import type { CommunicationFile, CommunicationInboundMessage, CommunicationProvider } from '@forge-runtime/core';

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
  let connectPromise: Promise<ImapFlow> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = 1000;
  let disposed = false;
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

  function rememberEmailContact(
    contacts: Map<string, { slug: string; displayName: string }>,
    address: string | null,
    displayName?: string | null,
  ) {
    if (!address) {
      return;
    }

    const normalizedAddress = address.toLowerCase();

    if (normalizedAddress === config.imap.user.toLowerCase()) {
      return;
    }

    contacts.set(normalizedAddress, {
      slug: normalizedAddress,
      displayName: displayName?.trim() || normalizedAddress,
    });
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

  function extractEmailBody(email: Email) {
    const rawContent = email.text ?? email.html?.replace(/<[^>]+>/g, '') ?? '[no content]';
    const normalizedContent = rawContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    if (!normalizedContent) {
      return '[no content]';
    }

    const lines = normalizedContent.split('\n');
    const cleanedLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (/^>/.test(trimmedLine)) {
        break;
      }

      if (/^On .+wrote:$/i.test(trimmedLine)) {
        break;
      }

      if (/^On .{8,}$/i.test(trimmedLine)) {
        break;
      }

      if (/^Em .+escreveu:$/i.test(trimmedLine)) {
        break;
      }

      if (/^Em .{8,}$/i.test(trimmedLine)) {
        break;
      }

      if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmedLine)) {
        break;
      }

      cleanedLines.push(line);
    }

    const content = cleanedLines.join('\n').trim();
    return content || normalizedContent;
  }

  function toReplySubject(subject: string) {
    return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
  }

  async function connectImap() {
    if (disposed) {
      throw new Error('Email provider is disposed');
    }

    if (client) {
      return client;
    }

    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = (async () => {
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
        if (!disposed) {
          scheduleReconnect();
        }
      });

      nextClient.on('exists', () => {
        void processUnseenMessages(nextClient);
      });

      return nextClient;
    })();

    try {
      return await connectPromise;
    } finally {
      connectPromise = null;
    }
  }

  async function withInboxQueryClient<T>(run: (queryClient: ImapFlow) => Promise<T>) {
    const queryClient = new ImapFlow({
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

    await queryClient.connect();
    await queryClient.mailboxOpen('INBOX');

    try {
      return await run(queryClient);
    } finally {
      try {
        await queryClient.logout();
      } catch {
        // Ignore logout failures on best-effort query connections.
      }
    }
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
      const fetchResult = await currentClient.fetch(String(uid), { source: true }, { uid: true });

      for await (const message of fetchResult) {
        if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') {
          continue;
        }

        const source = typeof message.source === 'string' ? message.source : new TextDecoder().decode(message.source);
        const parsed = await PostalMime.parse(source);
        const participant = resolveConversationParticipant(parsed);

        if (parsed.from?.address?.toLowerCase() === config.imap.user.toLowerCase()) {
          markMessageSeen(currentClient, uid);
          continue;
        }

        if (!participant) {
          markMessageSeen(currentClient, uid);
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
          content: extractEmailBody(parsed),
          attachments: toCommunicationAttachments(parsed, providerMessageId),
          createdAt: resolveCreatedAt(parsed),
        });

        markMessageSeen(currentClient, uid);
      }
    } catch (error) {
      console.error('[email] Error processing message:', error);
    }
  }

  function markMessageSeen(currentClient: ImapFlow, uid: number) {
    void currentClient.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch((error) => {
      console.error('[email] Failed to mark message as seen:', error);
    });
  }

  async function processUnseenMessages(currentClient: ImapFlow) {
    try {
      const unseenUids = await currentClient.search({ seen: false }, { uid: true });

      if (!Array.isArray(unseenUids) || unseenUids.length === 0) {
        return;
      }

      for (const uid of [...unseenUids].sort((left, right) => right - left)) {
        await processMessage(uid, currentClient);
      }
    } catch (error) {
      console.error('[email] Error fetching unseen messages:', error);
    }
  }

  async function listRecentInboxEmails(limit: number) {
    const emails = await withInboxQueryClient(async (queryClient) => {
      const uids = await queryClient.search({ all: true }, { uid: true });
      const recentUids = Array.isArray(uids)
        ? uids.slice(Math.max(0, uids.length - Math.min(limit, RECENT_EMAIL_SCAN_LIMIT)))
        : [];

      if (recentUids.length === 0) {
        return [];
      }

      const items: Array<{
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

      for await (const message of queryClient.fetch(recentUids, { source: true, flags: true }, { uid: true })) {
        if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') {
          continue;
        }

        const source = typeof message.source === 'string' ? message.source : new TextDecoder().decode(message.source);
        const parsed = await PostalMime.parse(source);
        const participant = resolveConversationParticipant(parsed);

        if (!participant) {
          continue;
        }

        const providerMessageId = parsed.messageId ?? `${message.uid ?? Date.now()}-${items.length}`;
        items.push({
          messageId: providerMessageId,
          targetKey: participant.targetKey,
          authorId: participant.authorId,
          authorDisplayName: participant.authorDisplayName,
          content: extractEmailBody(parsed),
          createdAt: resolveCreatedAt(parsed),
          unread: !(message.flags?.has?.('\\Seen') ?? false),
          conversationName: parsed.subject ?? undefined,
          attachments: toCommunicationAttachments(parsed, providerMessageId),
        });
      }

      return items;
    });

    pruneRecentOutboundMessages();
    return emails;
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
      void listen();
    }, reconnectDelayMs);
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
        scheduleReconnect();
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
    async dispose() {
      disposed = true;
      onInboundMessage = null;
      pendingMessages.length = 0;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const currentClient = client;
      client = null;

      if (currentClient) {
        try {
          await currentClient.logout();
        } catch {
          // Ignore logout failures during provider disposal.
        }
      }
    },
    async getSelfContact() {
      return {
        targetKey: config.imap.user.toLowerCase(),
        slug: config.imap.user.toLowerCase(),
        displayName: config.imap.user,
      };
    },
    async listContacts() {
      const contacts = new Map<string, { targetKey: string; slug: string; displayName: string }>();
      const inboxEmails = await listRecentInboxEmails(RECENT_EMAIL_SCAN_LIMIT);

      for (const email of inboxEmails) {
        rememberEmailContact(contacts, email.targetKey, email.authorId === email.targetKey ? email.authorDisplayName : email.targetKey);
      }

      for (const targetKey of recentOutboundMessages.keys()) {
        rememberEmailContact(contacts, targetKey, targetKey);
      }

      return [...contacts.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
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

      const recentInboxEmails = await listRecentInboxEmails(50);
      const latestConversationEmail = recentInboxEmails
        .filter((email) => email.targetKey === recipientAddress)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
      const subject = latestConversationEmail?.conversationName
        ? toReplySubject(latestConversationEmail.conversationName)
        : `Message from ${config.smtp.user}`;

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
          subject,
          text: input.content,
          bcc: config.bcc,
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.name,
            content: Buffer.from(attachment.data),
            contentType: attachment.contentType,
          })),
          ...(latestConversationEmail?.messageId
            ? {
                inReplyTo: latestConversationEmail.messageId,
                references: latestConversationEmail.messageId,
              }
            : {}),
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
