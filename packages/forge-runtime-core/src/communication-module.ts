import fs from 'node:fs/promises';
import path from 'node:path';

import type { Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { z } from 'zod';

import type { AgentWakeEvent } from './wake-queue.js';
import type {
  CommunicationAttachmentView,
  CommunicationConversationView,
  CommunicationInboundMessage,
  CommunicationMessageView,
  CommunicationModule,
  CommunicationProvider,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from './communication.js';

const CONTACTS_FILE = '.forge-communication-contacts.json';

const contactRecordSchema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
});

const contactStateSchema = z.object({
  version: z.literal(1),
  contacts: z.array(contactRecordSchema),
});

type ContactRecord = z.infer<typeof contactRecordSchema>;

export async function createCommunicationModule(config: {
  providers: CommunicationProvider[];
  workspace: WorkspaceRuntime;
  workspaceRoot: string;
}): Promise<CommunicationModule> {
  const providers = new Map(config.providers.map((provider) => [provider.id, provider]));
  const workspaceFilesystem = config.workspace.filesystem;

  if (!workspaceFilesystem) {
    throw new Error('Communication module requires a workspace filesystem');
  }

  const activeFilesystem = workspaceFilesystem;

  let receiveMessageHandler: ((event: AgentWakeEvent) => void) | null = null;

  for (const provider of providers.values()) {
    if (!provider.onMessage) {
      continue;
    }

    await provider.onMessage(async (message) => {
      if (!receiveMessageHandler) {
        return;
      }

      const messageView = await toAgentMessageView(activeFilesystem, {
        messageId: message.messageId,
        provider: provider.id,
        authorId: message.authorId,
        targetKey: message.targetKey,
        content: message.content.trim(),
        attachments: message.attachments ?? [],
        unread: true,
        createdAt: message.createdAt,
        authorDisplayName: message.authorDisplayName,
      });

      receiveMessageHandler({
        type: `message:${provider.id}`,
        groupKey: `message:${provider.id}:${message.targetKey}`,
        groupMetadata: buildGroupMetadata(provider.id, message),
        idempotencyKey: `${provider.id}:${message.messageId}`,
        itemMetadata: buildItemMetadata(messageView, message),
        text: message.content.trim(),
        timestamp: Date.parse(message.createdAt) || Date.now(),
      });
    });
  }

  async function listContacts(filter: 'self' | 'others' | 'all' = 'others') {
    const state = await readContactState(config.workspaceRoot);
    const self = filter === 'others'
      ? []
      : await listSelfContacts(providers);
    const others = filter === 'self'
      ? []
      : state.contacts.map((contact) => ({
        targetKey: contact.slug,
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
        metadata: {
          slug: contact.slug,
        },
      }));

    return {
      self,
      others,
    };
  }

  async function upsertContact(input: {
    slug: string;
    displayName: string;
    description?: string;
  }) {
    const state = await readContactState(config.workspaceRoot);
    const normalized: ContactRecord = {
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
    };
    const nextContacts = state.contacts.filter((contact) => contact.slug !== input.slug);
    nextContacts.push(normalized);
    nextContacts.sort((left, right) => left.displayName.localeCompare(right.displayName));
    await writeContactState(config.workspaceRoot, nextContacts);

    return {
      slug: normalized.slug,
      displayName: normalized.displayName,
      description: normalized.description,
    };
  }

  async function listConversations(input: {
    provider?: string;
    limit?: number;
    unread?: boolean;
  }): Promise<CommunicationConversationView[]> {
    const selectedProviders = input.provider
      ? [resolveProvider(providers, input.provider)]
      : Array.from(providers.values());
    const conversations: CommunicationConversationView[] = [];

    for (const provider of selectedProviders) {
      if (!provider.listConversations) {
        if (input.provider) {
          throw new Error(`Provider does not support listing conversations: ${provider.id}`);
        }

        continue;
      }

      const items = await provider.listConversations({
        limit: input.limit ?? 20,
        unread: input.unread,
      });

      for (const item of items) {
        conversations.push(await toAgentConversationView(activeFilesystem, item));
      }
    }

    return conversations.sort((left, right) => {
      return Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt);
    });
  }

  async function getMessages(input: {
    provider: string;
    targetKey: string;
    limit?: number;
    offset?: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const provider = resolveProvider(providers, input.provider);

    if (!provider.getMessages) {
      throw new Error(`Provider does not support reading messages: ${input.provider}`);
    }

    const messages = await provider.getMessages({
      targetKey: input.targetKey,
      limit: input.limit ?? 100,
      offset: input.offset ?? 0,
      query: input.query,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

    return Promise.all(messages.map((message) => toAgentMessageView(activeFilesystem, message)));
  }

  async function sendMessage(input: {
    provider: string;
    targetKey: string;
    content: string;
    attachments?: string[];
  }) {
    const provider = resolveProvider(providers, input.provider);
    const result = await provider.sendMessage({
      targetKey: input.targetKey,
      content: input.content,
      attachments: await readOutboundAttachments({
        workspaceFilesystem: activeFilesystem,
        workspaceRoot: config.workspaceRoot,
        attachmentPaths: input.attachments ?? [],
      }),
    });
    const unreadConversation = await getUnreadConversationContext({
      providers,
      workspaceFilesystem: activeFilesystem,
      provider: input.provider,
      targetKey: result.targetKey,
    });

    return {
      valid: true,
      provider: input.provider,
      targetKey: result.targetKey,
      ...(result.messageId ? { messageId: result.messageId } : {}),
      ...(result.conversationName ? { conversationName: result.conversationName } : {}),
      ...(unreadConversation ? { unreadConversation } : {}),
    };
  }

  return {
    listContacts,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
    onReceiveMessage(handler) {
      receiveMessageHandler = handler;
    },
    async dispose() {
      receiveMessageHandler = null;

      for (const provider of providers.values()) {
        await provider.dispose?.();
      }
    },
  };
}

async function listSelfContacts(providers: Map<string, CommunicationProvider>) {
  const contacts = await Promise.all(
    Array.from(providers.values()).map(async (provider) => {
      const selfContact = await provider.getSelfContact?.();

      if (!selfContact) {
        return null;
      }

      const slug = selfContact.slug;

      return {
        targetKey: selfContact.targetKey ?? slug,
        slug,
        displayName: selfContact.displayName,
        description: selfContact.description,
        metadata: {
          slug,
        },
      };
    }),
  );

  return contacts.filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
}

async function getUnreadConversationContext(input: {
  providers: Map<string, CommunicationProvider>;
  workspaceFilesystem: NonNullable<WorkspaceRuntime['filesystem']>;
  provider: string;
  targetKey: string;
}) {
  const provider = input.providers.get(input.provider);

  if (!provider?.listConversations) {
    return null;
  }

  const conversations = await provider.listConversations({
    unread: true,
    limit: 100,
  });
  const unreadConversation = conversations.find((conversation) => conversation.targetKey === input.targetKey);

  if (!unreadConversation) {
    return null;
  }

  const unreadMessages = unreadConversation.messages.filter((message) => message.unread);

  return {
    targetKey: unreadConversation.targetKey,
    provider: unreadConversation.provider,
    unreadCount: unreadConversation.unreadCount,
    name: unreadConversation.name,
    participants: unreadConversation.participants,
    messages: await Promise.all(
      unreadMessages.map((message) => toAgentMessageView(input.workspaceFilesystem, message)),
    ),
  };
}

function resolveProvider(
  providers: Map<string, CommunicationProvider>,
  providerId: string,
) {
  const provider = providers.get(providerId);

  if (!provider) {
    throw new Error(`Provider not available: ${providerId}`);
  }

  return provider;
}

function buildGroupMetadata(providerId: string, message: CommunicationInboundMessage) {
  return {
    Provider: providerId,
    TargetKey: message.targetKey,
    ...(message.conversationName ? { ConversationName: message.conversationName } : {}),
    ...(typeof message.metadata?.conversationType === 'string'
      ? { ConversationType: message.metadata.conversationType }
      : {}),
    ...(Array.isArray(message.metadata?.groupMembers)
      ? {
        Participants: message.metadata.groupMembers
          .map((member) =>
            typeof member === 'object'
              && member !== null
              && 'displayName' in member
              && typeof member.displayName === 'string'
              ? member.displayName
              : null,
          )
          .filter((value): value is string => Boolean(value))
          .join(', '),
      }
      : {}),
  };
}

function buildItemMetadata(
  messageView: CommunicationMessageView,
  message: CommunicationInboundMessage,
) {
  return {
    MessageId: message.messageId,
    ...(message.authorDisplayName ? { Author: message.authorDisplayName } : {}),
    ...(message.authorUsername ? { AuthorKey: message.authorUsername } : {}),
    ...(messageView.attachments.length > 0
      ? { Attachments: messageView.attachments.map((attachment) => attachment.path).join(', ') }
      : {}),
  };
}

async function toAgentConversationView(
  workspaceFilesystem: NonNullable<WorkspaceRuntime['filesystem']>,
  conversation: CommunicationProviderConversation,
): Promise<CommunicationConversationView> {
  return {
    targetKey: conversation.targetKey,
    provider: conversation.provider,
    latestMessageAt: conversation.latestMessageAt,
    unreadCount: conversation.unreadCount,
    name: conversation.name,
    participants: conversation.participants,
    messages: await Promise.all(
      conversation.messages.map((message) => toAgentMessageView(workspaceFilesystem, message)),
    ),
  };
}

async function toAgentMessageView(
  workspaceFilesystem: NonNullable<WorkspaceRuntime['filesystem']>,
  message: CommunicationProviderMessage,
): Promise<CommunicationMessageView> {
  return {
    messageId: message.messageId,
    provider: message.provider,
    authorId: message.authorId,
    targetKey: message.targetKey,
    content: message.content,
    attachments: await materializeInboundAttachments(workspaceFilesystem, message.messageId, message.attachments),
    unread: message.unread,
    createdAt: message.createdAt,
    authorDisplayName: message.authorDisplayName,
  };
}

async function materializeInboundAttachments(
  workspaceFilesystem: NonNullable<WorkspaceRuntime['filesystem']>,
  messageId: string,
  attachments: CommunicationProviderMessage['attachments'],
): Promise<CommunicationAttachmentView[]> {
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

async function readOutboundAttachments(input: {
  workspaceFilesystem: NonNullable<WorkspaceRuntime['filesystem']>;
  workspaceRoot: string;
  attachmentPaths: string[];
}) {
  return Promise.all(
    input.attachmentPaths.map(async (attachmentPath) => {
      const workspacePath = resolveWorkspacePath(input.workspaceRoot, attachmentPath);
      const data = await input.workspaceFilesystem.readFile(workspacePath);
      const buffer = typeof data === 'string'
        ? new Uint8Array(Buffer.from(data))
        : new Uint8Array(data);

      return {
        name: path.basename(workspacePath),
        data: buffer,
        contentType: resolveContentType(workspacePath),
        sizeBytes: buffer.byteLength,
      };
    }),
  );
}

function resolveWorkspacePath(workspaceRoot: string, filePath: string) {
  if (path.isAbsolute(filePath)) {
    const resolvedPath = path.resolve(filePath);
    const relativePath = path.relative(workspaceRoot, resolvedPath);

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

function sanitizeFileName(fileName: string) {
  const value = fileName
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();

  return value || 'attachment';
}

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

async function readContactState(workspaceRoot: string) {
  const filePath = path.join(workspaceRoot, CONTACTS_FILE);

  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = contactStateSchema.safeParse(JSON.parse(text));

    if (!parsed.success) {
      return {
        version: 1 as const,
        contacts: [],
      };
    }

    return parsed.data;
  } catch {
    return {
      version: 1 as const,
      contacts: [],
    };
  }
}

async function writeContactState(workspaceRoot: string, contacts: ContactRecord[]) {
  const filePath = path.join(workspaceRoot, CONTACTS_FILE);

  await fs.writeFile(filePath, JSON.stringify({
    version: 1,
    contacts,
  }, null, 2));
}
