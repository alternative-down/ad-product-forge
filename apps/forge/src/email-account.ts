/**
 * Email provider implementation.
 * Pure helper functions are in email-account-helpers.ts for independent testing.
 */
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { forgeDebug } from '@forge-runtime/core';
import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProvider,
  CommunicationProviderContact,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from '@forge-runtime/core';
import {
  toCommunicationAttachments,
  pruneRecentOutboundMessages,
  parseFilterDate,
  resolveConversationParticipant,
  resolveEmailThreadKey,
  resolveCreatedAt,
  extractEmailBody,
  toReplySubject,
} from './email-account-helpers';

type EmailProviderConfig = {
  id?: string;
  imap: { host: string; port: number; secure: boolean; user: string; password: string };
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  bcc?: string;
};

const CONNECTION_TIMEOUT_MS = 30_000;
const RECENT_EMAIL_SCAN_LIMIT = 200;
const OUTBOUND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildProviderId(config: EmailProviderConfig): string {
  return config.id ?? 'email';
}

export function createEmailProvider(config: EmailProviderConfig): CommunicationProvider {
  const providerId = buildProviderId(config);

  let client: ImapFlow | null = null;
  let connectPromise: Promise<ImapFlow> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = 1000;
  let disposed = false;
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];
  const recentOutboundMessages = new Map<
    string,
    Array<{
      messageId: string;
      content: string;
      attachments: CommunicationFile[];
      createdAt: string;
      unread: boolean;
      authorId: string;
      authorDisplayName: string;
      threadKey?: string;
    }>
  >();

  async function connectImap(): Promise<ImapFlow> {
    if (disposed) throw new Error('Email provider is disposed');
    if (client) return client;
    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      const nextClient = new ImapFlow({
        host: config.imap.host,
        port: config.imap.port,
        secure: config.imap.secure,
        auth: { user: config.imap.user, pass: config.imap.password },
        logger: false,
        connectionTimeout: CONNECTION_TIMEOUT_MS,
      });

      await nextClient.connect();
      await nextClient.mailboxOpen('INBOX');

      client = nextClient;
      reconnectDelayMs = 1000;
      forgeDebug('email-account', 'Connected to IMAP server');

      nextClient.on('close', () => {
        if (client === nextClient) client = null;
        forgeDebug('email-account', 'IMAP connection closed');
        if (!disposed) scheduleReconnect();
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

  async function withInboxQueryClient<T>(run: (queryClient: ImapFlow) => Promise<T>): Promise<T> {
    const queryClient = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: { user: config.imap.user, pass: config.imap.password },
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
      } catch (error) {
        forgeDebug('email-account', 'Logout failed (best-effort)', { error });
      }
    }
  }

  async function deliverMessage(message: CommunicationInboundMessage): Promise<void> {
    if (!onInboundMessage) {
      pendingMessages.push(message);
      return;
    }
    await onInboundMessage(message);
  }

  async function flushPendingMessages(): Promise<void> {
    if (!onInboundMessage || pendingMessages.length === 0) return;
    while (pendingMessages.length > 0) {
      const message = pendingMessages.shift();
      if (!message) return;
      await onInboundMessage(message);
    }
  }

  async function processMessage(uid: number, currentClient: ImapFlow): Promise<void> {
    try {
      const fetchResult = await currentClient.fetch(String(uid), { source: true }, { uid: true });
      for await (const message of fetchResult) {
        if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') continue;

        const source =
          typeof message.source === 'string'
            ? message.source
            : new TextDecoder().decode(message.source);
        const parsed = await PostalMime.default.parse(source);
        const participant = resolveConversationParticipant(parsed, config.imap.user.toLowerCase());
        if (!participant) continue;

        const providerMessageId = parsed.messageId ?? `${uid}-${Date.now()}`;
        const threadKey = resolveEmailThreadKey(parsed);
        const body = extractEmailBody(parsed);
        const attachments = toCommunicationAttachments(parsed, providerMessageId);

        await deliverMessage({
          messageId: providerMessageId,
          content: body,
          targetKey: participant.targetKey,
          conversationName: parsed.subject ?? null,
          attachments,
          unread: !message.flags?.includes('\\Seen'),
          authorId: participant.authorId,
          authorDisplayName: participant.authorDisplayName,
          threadKey,
          createdAt: resolveCreatedAt(parsed),
        });
      }
    } catch (error) {
      forgeDebug('email-account', 'Error processing message', { uid, error });
    }
  }

  async function processUnseenMessages(currentClient: ImapFlow): Promise<void> {
    const unseenUids = await currentClient.search({ seen: false }, { uid: true });
    for (const uid of [...unseenUids].sort((left, right) => right - left)) {
      await processMessage(uid, currentClient);
    }
  }

  async function listRecentInboxEmails(limit: number) {
    const emails = await withInboxQueryClient(async (queryClient) => {
      const uids = await queryClient.search({ all: true }, { uid: true });
      const recentUids = Array.isArray(uids)
        ? uids.slice(Math.max(0, uids.length - Math.min(limit, RECENT_EMAIL_SCAN_LIMIT)))
        : [];
      if (recentUids.length === 0) return [];

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
        threadKey: string;
      }> = [];

      for await (const message of queryClient.fetch(recentUids, { source: true, flags: true }, { uid: true })) {
        if (!(message.source instanceof Uint8Array) && typeof message.source !== 'string') continue;

        const source =
          typeof message.source === 'string'
            ? message.source
            : new TextDecoder().decode(message.source);
        const parsed = await PostalMime.default.parse(source);
        const participant = resolveConversationParticipant(parsed, config.imap.user.toLowerCase());
        if (!participant) continue;

        const providerMessageId = parsed.messageId ?? `${message.uid ?? Date.now()}-${items.length}`;
        const threadKey = resolveEmailThreadKey(parsed);
        items.push({
          messageId: providerMessageId,
          targetKey: threadKey,
          authorId: participant.authorId,
          authorDisplayName: participant.authorDisplayName,
          content: extractEmailBody(parsed),
          createdAt: resolveCreatedAt(parsed),
          unread: !(message.flags?.has?.('\\Seen') ?? false),
          conversationName: parsed.subject ?? undefined,
          threadKey,
          attachments: toCommunicationAttachments(parsed, providerMessageId),
        });
      }

      return items;
    });

    pruneRecentOutboundMessages(recentOutboundMessages, OUTBOUND_CACHE_TTL_MS);
    return emails;
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
      if (!disposed) void listen();
    }, reconnectDelayMs);
  }

  async function listen(): Promise<void> {
    try {
      const currentClient = await connectImap();
      await processUnseenMessages(currentClient);
    } catch (error) {
      forgeDebug('email-account', 'listen() failed', { error });
    }
  }

  return {
    get id() {
      return providerId;
    },

    async onMessage(listener) {
      onInboundMessage = listener;
      await flushPendingMessages();
      await listen();
    },

    async dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (client) {
        try {
          await client.logout();
        } catch {}
        client = null;
      }
    },

    async getSelfContact(): Promise<CommunicationProviderContact | null> {
      return {
        targetKey: config.imap.user,
        slug: config.imap.user,
        displayName: config.imap.user,
      };
    },

    async listContacts(): Promise<CommunicationProviderContact[]> {
      const inboxEmails = await listRecentInboxEmails(RECENT_EMAIL_SCAN_LIMIT);
      const contacts = new Map<string, CommunicationProviderContact>();

      for (const email of inboxEmails) {
        contacts.set(email.targetKey, {
          targetKey: email.targetKey,
          slug: email.targetKey,
          displayName: email.authorDisplayName,
        });
      }

      for (const targetKey of recentOutboundMessages.keys()) {
        if (!contacts.has(targetKey)) {
          contacts.set(targetKey, { targetKey, slug: targetKey, displayName: targetKey });
        }
      }

      return [...contacts.values()];
    },

    async listConversations(input: { limit: number; unread?: boolean }): Promise<CommunicationProviderConversation[]> {
      const inboxEmails = await listRecentInboxEmails(50);
      const grouped = new Map<string, typeof inboxEmails>();

      for (const email of inboxEmails) {
        const existing = grouped.get(email.threadKey) ?? [];
        existing.push(email);
        grouped.set(email.threadKey, existing);
      }

      for (const [, messages] of recentOutboundMessages.entries()) {
        const threadKey = messages[0]?.threadKey;
        if (threadKey && !grouped.has(threadKey)) {
          grouped.set(threadKey, []);
        }
      }

      const threads: CommunicationProviderConversation[] = [];
      for (const [threadKey, messages] of grouped.entries()) {
        const ordered = messages.sort(
          (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
        );
        threads.push({
          targetKey: threadKey,
          participants: [config.imap.user],
          messages: [],
          unread: messages.some((m) => m.unread),
        });
      }

      return threads.slice(0, input.limit);
    },

    async getMessages(input: {
      targetKey: string;
      limit: number;
      offset: number;
      query?: string;
      dateFrom?: string;
      dateTo?: string;
    }): Promise<CommunicationProviderMessage[]> {
      const { targetKey, limit, offset, dateFrom, dateTo } = input;
      const parsedDateFrom = parseFilterDate(dateFrom, 'dateFrom');
      const parsedDateTo = parseFilterDate(dateTo, 'dateTo');
      const inboxEmails = await listRecentInboxEmails(Math.max((limit + offset) * 4, 50));

      return inboxEmails
        .filter((email) => {
          if (email.threadKey !== targetKey) return false;
          if (parsedDateFrom !== null && Date.parse(email.createdAt) < parsedDateFrom) return false;
          if (parsedDateTo !== null && Date.parse(email.createdAt) > parsedDateTo) return false;
          return true;
        })
        .slice(offset, offset + limit);
    },

    async sendMessage(input: {
      targetKey: string;
      content: string;
      attachments: CommunicationFile[];
      threadKey?: string;
      conversationName?: string;
    }) {
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
        auth: { user: config.smtp.user, pass: config.smtp.password },
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
          threadKey: input.threadKey,
        });
        recentOutboundMessages.set(recipientAddress, existingOutbound);
        pruneRecentOutboundMessages(recentOutboundMessages, OUTBOUND_CACHE_TTL_MS);

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