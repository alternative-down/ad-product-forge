import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'node:path';
import type { Workspace as WorkspaceRuntime } from '@mastra/core/workspace';

import { runMigrations } from '../../database/migrate';
import { createCommunicationStore } from './store';
import * as communicationSchema from './schema';
import type { AgentWakeEvent } from '../wake-queue';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
  CommunicationProvider,
} from './provider-types';

function resolveContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.json') return 'application/json';
  if (extension === '.txt' || extension === '.md') return 'text/plain';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.mp4') return 'video/mp4';

  return undefined;
}

export async function createCommunicationModule(config: {
  client: Client;
  providers: CommunicationProvider[];
  workspace: WorkspaceRuntime;
  workspaceRoot: string;
}) {
  console.log('[Communication] Initializing communication database...');
  const db = drizzle(config.client, { schema: communicationSchema });
  await runMigrations(db);
  console.log('[Communication] Database initialized successfully');
  const store = await createCommunicationStore(db);
  const providers = new Map<string, CommunicationProvider>();
  let receiveMessageHandler: ((event: AgentWakeEvent) => void) | null = null;
  const filesystem = config.workspace.filesystem;

  if (!filesystem) {
    throw new Error('Communication module requires a workspace filesystem');
  }
  const workspaceFilesystem = filesystem;

  function resolveWorkspacePath(filePath: string) {
    if (path.isAbsolute(filePath)) {
      const resolvedPath = path.resolve(filePath);
      const relativePath = path.relative(config.workspaceRoot, resolvedPath);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Attachment path is outside the workspace: ${filePath}`);
      }

      return relativePath;
    }

    const normalizedPath = path.normalize(filePath);

    if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
      throw new Error(`Attachment path is outside the workspace: ${filePath}`);
    }

    return normalizedPath;
  }

  async function readOutboundAttachments(attachmentPaths: string[]) {
    return Promise.all(
      attachmentPaths.map(async (attachmentPath) => {
        const workspacePath = resolveWorkspacePath(attachmentPath);
        const data = await workspaceFilesystem.readFile(workspacePath);
        const buffer = typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : new Uint8Array(data);

        return {
          name: path.basename(workspacePath),
          data: buffer,
          contentType: resolveContentType(workspacePath),
          sizeBytes: buffer.byteLength,
        };
      }),
    );
  }

  function sanitizeFileName(fileName: string) {
    const value = fileName
      .replace(/[/\\?%*:|"<>]/g, '-')
      .trim();

    return value || 'attachment';
  }

  async function materializeInboundAttachments(messageId: string, attachments: CommunicationProviderMessage['attachments']) {
    return Promise.all(
      attachments.map(async (attachment, index) => {
        const safeName = sanitizeFileName(attachment.name);
        const targetPath = path.posix.join('tmp', `${messageId}-${index}-${safeName}`);

        await workspaceFilesystem.writeFile(targetPath, attachment.data);

        return {
          path: targetPath,
          name: safeName,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes ?? attachment.data.byteLength,
        };
      }),
    );
  }

  async function toAgentMessageView(message: CommunicationProviderMessage): Promise<CommunicationMessageView> {
    return {
      messageId: message.messageId,
      provider: message.provider,
      authorId: message.authorId,
      targetKey: message.targetKey,
      content: message.content,
      attachments: await materializeInboundAttachments(message.messageId, message.attachments),
      unread: message.unread,
      createdAt: message.createdAt,
      authorDisplayName: message.authorDisplayName,
    };
  }

  async function toAgentConversationView(conversation: CommunicationProviderConversation): Promise<CommunicationConversationView> {
    return {
      targetKey: conversation.targetKey,
      provider: conversation.provider,
      latestMessageAt: conversation.latestMessageAt,
      unreadCount: conversation.unreadCount,
      name: conversation.name,
      participants: conversation.participants,
      messages: await Promise.all(conversation.messages.map((message) => toAgentMessageView(message))),
    };
  }

  for (const provider of config.providers) {
    providers.set(provider.id, provider);

    if (!provider.onMessage) {
      continue;
    }

    await provider.onMessage(async (message) => {
      if (!receiveMessageHandler) {
        return;
      }

      const text = message.content.trim();
      const messageView = await toAgentMessageView({
        messageId: message.messageId,
        provider: provider.id,
        authorId: message.authorId,
        targetKey: message.targetKey,
        content: text,
        attachments: message.attachments ?? [],
        unread: true,
        createdAt: message.createdAt,
        authorDisplayName: message.authorDisplayName,
      });

      receiveMessageHandler({
        type: `message:${provider.id}`,
        groupKey: `message:${provider.id}:${message.targetKey}`,
        groupMetadata: {
          Provider: provider.id,
          TargetKey: message.targetKey,
          ...(message.conversationName ? { ConversationName: message.conversationName } : {}),
        },
        idempotencyKey: `${provider.id}:${message.messageId}`,
        itemMetadata: {
          MessageId: message.messageId,
          ...(message.authorDisplayName ? { Author: message.authorDisplayName } : {}),
          ...(message.authorUsername ? { AuthorKey: message.authorUsername } : {}),
          ...(messageView.attachments.length > 0
            ? { Attachments: messageView.attachments.map((attachment) => attachment.path).join(', ') }
            : {}),
        },
        text,
        timestamp: Date.parse(message.createdAt) || Date.now(),
      });
    });
  }

  function onReceiveMessage(handler: (event: AgentWakeEvent) => void) {
    receiveMessageHandler = handler;
  }

  function toAgentContactView(contact: Awaited<ReturnType<typeof store.listContacts>>[number]) {
    const internalChatAccount = contact.accounts.find((account) => account.provider === 'internal-chat');

    return {
      slug: contact.slug,
      displayName: contact.displayName,
      description: contact.description,
      agentId: internalChatAccount?.externalUserId,
    };
  }

  async function syncProviderContacts() {
    for (const provider of providers.values()) {
      if (!provider.listContacts) {
        continue;
      }

      const providerContacts = await provider.listContacts();

      for (const contact of providerContacts) {
        await store.upsertContact({
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description,
          provider: provider.id,
          externalUserId: contact.agentId,
          username: contact.slug,
        });
      }
    }
  }

  async function listContacts(filter: 'self' | 'others' | 'all' = 'others') {
    await syncProviderContacts();
    const contacts = filter === 'self' ? [] : await store.listContacts();

    return {
      self: [],
      others: contacts.map((contact) => toAgentContactView(contact)),
    };
  }

  async function upsertContact(input: { slug: string; displayName: string; description?: string }) {
    const contact = await store.upsertContact(input);

    if (!contact) {
      throw new Error(`Failed to upsert contact: ${input.slug}`);
    }

    return {
      slug: contact.slug,
      displayName: contact.displayName,
      description: contact.description,
    };
  }

  async function listConversations(input: {
    provider?: string;
    unread?: boolean;
    limit: number;
  }): Promise<CommunicationConversationView[]> {
    if (input.provider) {
      const provider = providers.get(input.provider);

      if (!provider) {
        throw new Error(`Provider not available: ${input.provider}`);
      }

      if (!provider.listConversations) {
        throw new Error(`Provider does not support listing conversations: ${input.provider}`);
      }

      const conversations = await provider.listConversations({
        unread: input.unread,
        limit: input.limit,
      });

      return Promise.all(conversations.map((conversation) => toAgentConversationView(conversation)));
    }

    const supportedProviders = Array.from(providers.values()).filter((provider) => provider.listConversations);
    const conversationGroups = await Promise.all(
      supportedProviders.map((provider) =>
        provider.listConversations!({
          unread: input.unread,
          limit: input.limit,
        }),
      ),
    );

    return Promise.all(conversationGroups
      .flat()
      .sort((left, right) => Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt))
      .map((conversation) => toAgentConversationView(conversation)));
  }

  async function getMessages(input: {
    provider: string;
    targetKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CommunicationMessageView[]> {
    const provider = providers.get(input.provider);

    if (!provider) {
      throw new Error(`Provider not available: ${input.provider}`);
    }

    if (!provider.getMessages) {
      throw new Error(`Provider does not support reading messages: ${input.provider}`);
    }

    return Promise.all((await provider.getMessages({
      targetKey: input.targetKey,
      limit: input.limit,
      offset: input.offset,
      query: input.query,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    })).map((message) => toAgentMessageView(message)));
  }

  async function sendMessage(input: {
    provider: string;
    targetKey: string;
    content: string;
    attachments?: string[];
  }) {
    const provider = providers.get(input.provider);

    if (!provider) {
      throw new Error(`Provider not available: ${input.provider}`);
    }

    const result = await provider.sendMessage({
      targetKey: input.targetKey,
      content: input.content,
      attachments: await readOutboundAttachments(input.attachments ?? []),
    });

    return {
      valid: true,
      provider: input.provider,
      targetKey: result.targetKey,
      ...(result.messageId ? { messageId: result.messageId } : {}),
      ...(result.conversationName ? { conversationName: result.conversationName } : {}),
    };
  }

  return {
    onReceiveMessage,
    listContacts,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
  };
}

export type CommunicationModule = Awaited<ReturnType<typeof createCommunicationModule>>;
