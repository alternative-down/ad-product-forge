import type { Client } from '@libsql/client';

import { createCommunicationStore } from './store';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationProvider,
} from './provider-types';

export async function createCommunicationModule(config: {
  client: Client;
  providers: CommunicationProvider[];
}) {
  const store = await createCommunicationStore(config.client);
  const providers = new Map<string, CommunicationProvider>();
  let receiveMessageHandler: (() => void) | null = null;

  async function syncProviderContacts(provider: CommunicationProvider) {
    if (!provider.syncContacts) {
      return;
    }

    for (const contact of await provider.syncContacts()) {
      await store.upsertContact({
        slug: contact.slug,
        displayName: contact.displayName,
        provider: provider.id,
        externalUserId: contact.externalUserId,
        username: contact.username,
      });
    }
  }

  async function syncInboundContact(input: {
    provider: string;
    authorExternalId?: string;
    authorDisplayName?: string;
    authorUsername?: string;
  }) {
    if (!input.authorExternalId && !input.authorUsername && !input.authorDisplayName) {
      return null;
    }

    const existingContact = await store.findContactByIdentity(
      input.provider,
      input.authorExternalId,
      input.authorUsername,
    );

    if (existingContact && (!input.authorDisplayName || existingContact.displayName === input.authorDisplayName)) {
      return existingContact;
    }

    const slug = existingContact?.slug || input.authorUsername || input.authorDisplayName || input.authorExternalId || 'contact';
    const displayName = input.authorDisplayName || existingContact?.displayName || input.authorUsername || input.authorExternalId || slug;

    return store.upsertContact({
      slug,
      displayName,
      description: existingContact?.description,
      provider: input.provider,
      externalUserId: input.authorExternalId,
      username: input.authorUsername,
    });
  }

  for (const provider of config.providers) {
      const account = await provider.getAccount();

      await store.ensureAccount({
        provider: provider.id,
        externalAccountId: account.externalAccountId,
        displayName: account.displayName,
        metadata: account.metadata,
      });

      providers.set(provider.id, provider);
      await syncProviderContacts(provider);

      if (!provider.onMessage) {
        continue;
      }

      await provider.onMessage(async (message) => {
        const contact = await syncInboundContact({
          provider: provider.id,
          authorExternalId: message.authorExternalId,
          authorDisplayName: message.authorDisplayName,
          authorUsername: message.authorUsername,
        });

        await store.saveInboundMessage({
          provider: provider.id,
          providerConversationKey: message.providerConversationKey,
          providerMessageId: message.providerMessageId,
          conversationName: message.conversationName,
          contactSlug: contact?.slug,
          authorExternalId: message.authorExternalId,
          authorDisplayName: message.authorDisplayName,
          authorUsername: message.authorUsername,
          content: message.content,
          attachments: message.attachments,
          createdAt: message.createdAt,
          metadata: message.metadata,
        });

        if (receiveMessageHandler) {
          try {
            receiveMessageHandler();
          } catch (error) {
            console.error('Error in receiveMessageHandler:', error);
          }
        }
      });
  }

  function onReceiveMessage(handler: () => void) {
    receiveMessageHandler = handler;
  }

  async function saveSentMessage(input: {
    provider: string;
    providerConversationKey: string;
    providerMessageId?: string;
    conversationName?: string;
    contactSlug?: string;
    content: string;
  }) {
    const message = await store.saveOutboundMessage(input);

    if (!message) {
      throw new Error('Failed to persist outbound message');
    }

    return {
      success: true,
      messageId: message.messageId,
      conversationId: message.conversationId,
    };
  }

  async function getContactExternalId(providerId: string, contactSlug: string) {
    const contact = await store.getContact(contactSlug);
    const identity = contact?.accounts.find((account) => account.provider === providerId);

    if (identity) {
      return identity.externalUserId || identity.username || null;
    }

    const provider = providers.get(providerId);
    if (provider) {
      await syncProviderContacts(provider);

      const syncedContact = await store.getContact(contactSlug);
      const syncedIdentity = syncedContact?.accounts.find((account) => account.provider === providerId);

      return syncedIdentity?.externalUserId || syncedIdentity?.username || null;
    }

    return null;
  }

  async function listContacts() {
    const contacts = await store.listContacts();

    return contacts.map((contact) => ({
      slug: contact.slug,
      displayName: contact.displayName,
      description: contact.description,
    }));
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
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }): Promise<CommunicationConversationView[]> {
    const conversations = await store.listConversations(input);
    const contacts = await store.listContacts();

    const contactMap = new Map(contacts.map((contact) => [contact.slug, contact]));

    return conversations.map((conversation) => {
      const contactDisplayName = conversation.contactSlug ? contactMap.get(conversation.contactSlug)?.displayName : undefined;

      return {
        conversationId: conversation.conversationId,
        provider: conversation.provider,
        latestMessageAt: conversation.latestMessageAt,
        unreadCount: conversation.unreadCount,
        name: conversation.name,
        contactSlug: conversation.contactSlug,
        contactDisplayName,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          conversationId: message.conversationId,
          provider: message.provider,
          content: message.content,
          attachments: message.attachments,
          unread: message.unread,
          createdAt: message.createdAt,
          authorDisplayName: message.authorDisplayName,
          contactSlug: conversation.contactSlug,
          contactDisplayName,
        })),
      };
    });
  }

  async function getMessages(input: {
    conversationId: string;
    limit: number;
  }): Promise<CommunicationMessageView[]> {
    const conversation = await store.getConversation(input.conversationId);
    const messages = await store.getMessages(input.conversationId, input.limit);
    const contact = conversation?.contactSlug ? await store.getContact(conversation.contactSlug) : null;

    return messages.map((message) => ({
      messageId: message.messageId,
      conversationId: message.conversationId,
      provider: message.provider,
      content: message.content,
      attachments: message.attachments,
      unread: message.unread,
      createdAt: message.createdAt,
      authorDisplayName: message.authorDisplayName,
      contactSlug: conversation?.contactSlug,
      contactDisplayName: contact?.displayName,
    }));
  }

  // TODO: Future enhancement — support multiple recipients (TO, CC) per message.
  // This requires extending the sendMessage input contract in provider-types.ts
  // and updating the agent-facing communication tools accordingly.
  async function sendMessage(input: {
    provider: string;
    conversationId?: string;
    contactSlug?: string;
    content: string;
    replyToMessageId?: string;
  }) {
    const provider = providers.get(input.provider);

    if (!provider) {
      throw new Error(`Provider not registered for agent: ${input.provider}`);
    }

    const replyMessage = input.replyToMessageId ? await store.getMessage(input.replyToMessageId) : null;

    if (replyMessage && replyMessage.provider !== input.provider) {
      throw new Error(`Message ${input.replyToMessageId} does not belong to provider ${input.provider}`);
    }

    if (input.conversationId) {
      const conversation = await store.getConversation(input.conversationId);

      if (!conversation) {
        throw new Error(`Conversation not found: ${input.conversationId}`);
      }

      if (conversation.provider !== input.provider) {
        throw new Error(`Conversation ${input.conversationId} does not belong to provider ${input.provider}`);
      }

      const sent = await provider.sendMessage({
        providerConversationKey: conversation.providerConversationKey,
        content: input.content,
        replyToProviderMessageId: replyMessage?.providerMessageId,
      });

      return saveSentMessage({
        provider: input.provider,
        providerConversationKey: sent.providerConversationKey,
        providerMessageId: sent.providerMessageId,
        conversationName: sent.conversationName,
        contactSlug: conversation.contactSlug,
        content: input.content,
      });
    }

    if (!input.contactSlug) {
      throw new Error(`No destination provided for provider: ${input.provider}`);
    }

    const contactExternalId = await getContactExternalId(input.provider, input.contactSlug);

    if (!contactExternalId) {
      throw new Error(`No direct identity found for contact: ${input.contactSlug}`);
    }

    const sent = await provider.sendMessage({
      contactExternalId,
      content: input.content,
      replyToProviderMessageId: replyMessage?.providerMessageId,
    });

    return saveSentMessage({
      provider: input.provider,
      providerConversationKey: sent.providerConversationKey,
      providerMessageId: sent.providerMessageId,
      conversationName: sent.conversationName,
      contactSlug: input.contactSlug,
      content: input.content,
    });
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
