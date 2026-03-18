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

function resolveThreadKey(messageId: string, references: string): string {
  const refs = references?.trim().split(/\s+/).filter(Boolean) ?? [];
  return refs[0] ?? messageId;
}

export function createEmailProvider(config: EmailProviderConfig): CommunicationProvider {
  let listening = false;
  let client: ImapFlow | null = null;
  let reconnectAttempts = 0;
  const maxReconnectDelay = 30000; // 30 seconds

  async function connectImap(): Promise<ImapFlow> {
    const newClient = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: {
        user: config.imap.user,
        pass: config.imap.password,
      },
      logger: false,
    });

    await newClient.connect();
    await newClient.mailboxOpen('INBOX');

    reconnectAttempts = 0;
    return newClient;
  }

  async function processMessage(uid: number, client: ImapFlow, callback: (message: CommunicationInboundMessage) => Promise<void>): Promise<void> {
    try {
      const fetchResult = await client.fetch(String(uid), { source: true });

      for await (const message of fetchResult) {
        if (message.source instanceof Uint8Array || typeof message.source === 'string') {
          const source = typeof message.source === 'string' ? message.source : new TextDecoder().decode(message.source);
          const parsed = await PostalMime.parse(source);

          // Skip self-messages
          if (parsed.from?.address?.toLowerCase() === config.imap.user.toLowerCase()) {
            continue;
          }

          const attachments: Attachment[] = (parsed.attachments ?? []).map((a) => ({
            id: a.contentId ?? String(Math.random()),
            name: a.filename ?? undefined,
            url: '',
            contentType: a.mimeType ?? undefined,
            sizeBytes: typeof a.content === 'string' ? Buffer.byteLength(a.content, 'utf8') : a.content.byteLength,
          }));

          const providerMessageId = parsed.messageId ?? `${uid}-${Date.now()}`;
          const inboundMessage: CommunicationInboundMessage = {
            providerMessageId,
            providerConversationKey: resolveThreadKey(providerMessageId, parsed.references ?? ''),
            conversationName: parsed.subject ?? undefined,
            authorExternalId: parsed.from?.address ?? 'unknown',
            authorUsername: parsed.from?.address ?? 'unknown',
            authorDisplayName: parsed.from?.name ?? parsed.from?.address ?? 'unknown',
            content: parsed.text ?? parsed.html?.replace(/<[^>]+>/g, '') ?? '[no content]',
            attachments,
            createdAt: parsed.date ?? new Date().toISOString(),
          };

          await callback(inboundMessage);
        }
      }
    } catch (error) {
      console.error('[email] Error processing message:', error);
    }
  }

  async function startIdleLoop(callback: (message: CommunicationInboundMessage) => Promise<void>): Promise<void> {
    if (!client) {
      return;
    }

    try {
      // Listen for new messages
      client.on('exists', async (data) => {
        try {
          if (!data.count) {
            return;
          }

          const unseenUids = await client!.search({ seen: false });
          if (!Array.isArray(unseenUids)) {
            return;
          }

          for (const uid of unseenUids) {
            await processMessage(uid, client!, callback);
          }
        } catch (error) {
          console.error('[email] Error handling new message notification:', error);
        }
      });

      // Enter IDLE loop
      while (listening && client) {
        try {
          await client.idle();
        } catch (error) {
          console.error('[email] IDLE error:', error);
          break;
        }
      }
    } catch (error) {
      console.error('[email] Error in IDLE loop:', error);
    }
  }

  async function reconnectWithBackoff(callback: (message: CommunicationInboundMessage) => Promise<void>): Promise<void> {
    if (!listening) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    reconnectAttempts++;

    console.log(`[email] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!listening) {
      return;
    }

    try {
      client = await connectImap();
      console.log('[email] Reconnected to IMAP server');
      void startIdleLoop(callback);
    } catch (error) {
      console.error('[email] Reconnection failed:', error);
      await reconnectWithBackoff(callback);
    }
  }

  return {
    id: config.id ?? 'email',
    async getAccount() {
      return {
        externalAccountId: config.imap.user,
        displayName: config.imap.user,
      };
    },
    async onMessage(callback) {
      if (listening) {
        return;
      }

      listening = true;

      try {
        client = await connectImap();
        console.log(`[email] Connected to IMAP server`);

        // Fetch unread messages on startup
        try {
          const unseenUids = await client.search({ seen: false });
          if (unseenUids && Array.isArray(unseenUids)) {
            for (const uid of unseenUids) {
              await processMessage(uid, client, callback);
            }
          }
        } catch (error) {
          console.error('[email] Error fetching unseen messages:', error);
        }

        // Start IDLE loop
        client.on('close', async () => {
          console.log('[email] Connection closed');
          if (listening) {
            await reconnectWithBackoff(callback);
          }
        });

        void startIdleLoop(callback);
      } catch (error) {
        console.error('[email] Error in onMessage:', error);
        if (listening) {
          await reconnectWithBackoff(callback);
        }
      }
    },
    // TODO: The current sendMessage interface supports only a single recipient.
    // Future enhancement: extend CommunicationProvider.sendMessage to support
    // multiple TO recipients, CC, and explicit BCC fields. This would require
    // changes to the provider-types contract and the agent-facing tooling.
    async sendMessage(input) {
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
        const recipientAddress = input.contactExternalId;
        if (!recipientAddress) {
          throw new Error(`[email] Cannot send: no recipient address resolved for conversation ${input.providerConversationKey}`);
        }

        const isReply = !!input.providerConversationKey;
        const subject = isReply ? `Re: ${input.providerConversationKey}` : 'Message from agent';

        const mailOptions: Record<string, unknown> = {
          from: config.smtp.user,
          to: recipientAddress,
          subject,
          text: input.content,
          bcc: config.bcc,
        };

        if (isReply && input.providerConversationKey) {
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
