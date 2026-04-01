import type { Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { runMigrations } from '../../database/migrate';
import { createCommunicationStore } from './store';
import * as communicationSchema from './schema';
import type { AgentWakeEvent } from '../wake-queue';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationProvider,
} from './provider-types';

export async function createCommunicationModule(config: {
  client: Client;
  providers: CommunicationProvider[];
}) {
  console.log('[Communication] Initializing communication database...');
  const db = drizzle(config.client, { schema: communicationSchema });
  await runMigrations(db);
  console.log('[Communication] Database initialized successfully');
  const store = await createCommunicationStore(db);
  const providers = new Map<string, CommunicationProvider>();
  let receiveMessageHandler: ((event: AgentWakeEvent) => void) | null = null;

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

      if (!text) {
        return;
      }

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
          ...(message.authorId ? { AuthorId: message.authorId } : {}),
        },
        text,
        timestamp: Date.parse(message.createdAt) || Date.now(),
      });
    });
  }

  function onReceiveMessage(handler: (event: AgentWakeEvent) => void) {
    receiveMessageHandler = handler;
  }

  async function listContacts(filter: 'self' | 'others' | 'all' = 'others') {
    const contacts = filter === 'self' ? [] : await store.listContacts();

    return {
      self: [],
      others: contacts.map((contact) => ({
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
      })),
    };
  }

  async function getContact(slug: string) {
    const contact = await store.getContact(slug);

    if (!contact) {
      return null;
    }

    return {
      slug: contact.slug,
      displayName: contact.displayName,
      description: contact.description,
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

      return provider.listConversations({
        unread: input.unread,
        limit: input.limit,
      });
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

    return conversationGroups
      .flat()
      .sort((left, right) => Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt))
      .slice(0, input.limit);
  }

  async function getMessages(input: {
    provider: string;
    targetKey: string;
    limit: number;
  }): Promise<CommunicationMessageView[]> {
    const provider = providers.get(input.provider);

    if (!provider) {
      throw new Error(`Provider not available: ${input.provider}`);
    }

    if (!provider.getMessages) {
      throw new Error(`Provider does not support reading messages: ${input.provider}`);
    }

    return provider.getMessages({
      targetKey: input.targetKey,
      limit: input.limit,
    });
  }

  async function sendMessage(input: {
    provider: string;
    targetKey: string;
    content: string;
  }) {
    const provider = providers.get(input.provider);

    if (!provider) {
      throw new Error(`Provider not available: ${input.provider}`);
    }

    const result = await provider.sendMessage({
      targetKey: input.targetKey,
      content: input.content,
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
    getContact,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
  };
}

export type CommunicationModule = Awaited<ReturnType<typeof createCommunicationModule>>;
