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

      await store.upsertSelfAccount({
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
            receiveMessageHandler({
              type: `message:${provider.id}`,
              id: `${provider.id}:${message.providerMessageId}`,
              content: formatInboundWakeMessage({
                providerId: provider.id,
                contactSlug: contact?.slug,
                providerConversationKey: message.providerConversationKey,
                providerMessageId: message.providerMessageId,
                conversationName: message.conversationName,
                authorExternalId: message.authorExternalId,
                authorDisplayName: message.authorDisplayName,
                authorUsername: message.authorUsername,
                createdAt: message.createdAt,
                content: message.content,
              }),
              timestamp: Date.parse(message.createdAt) || Date.now(),
            });
          } catch (error) {
            console.error('Error in receiveMessageHandler:', error);
          }
        }
      });
  }

  function onReceiveMessage(handler: (event: AgentWakeEvent) => void) {
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

  async function listContacts(filter: 'self' | 'others' | 'all' = 'others') {
    await Promise.all(Array.from(providers.values()).map((provider) => syncProviderContacts(provider)));

    const [selfAccounts, otherContacts] = await Promise.all([
      filter !== 'others' ? store.listSelfAccounts() : Promise.resolve([]),
      filter !== 'self' ? store.listContacts() : Promise.resolve([]),
    ]);

    return {
      self: selfAccounts.map((account) => ({
        accountId: account.accountId,
        provider: account.provider,
        displayName: account.displayName,
      })),
      others: otherContacts.map((contact) => ({
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
      })),
    };
  }

  async function getContact(slug: string) {
    let contact = await store.getContact(slug);

    if (!contact) {
      await Promise.all(Array.from(providers.values()).map((provider) => syncProviderContacts(provider)));
      contact = await store.getContact(slug);
    }

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
        providerConversationKey: conversation.providerConversationKey,
        latestMessageAt: conversation.latestMessageAt,
        unreadCount: conversation.unreadCount,
        name: conversation.name,
        type: conversation.type,
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
    providerConversationKey?: string;
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

    const conversation =
      input.conversationId
        ? await store.getConversation(input.conversationId)
        : input.providerConversationKey
          ? await store.getConversationByProviderConversationKey(input.provider, input.providerConversationKey)
          : null;

    if (conversation) {
      if (conversation.provider !== input.provider) {
        throw new Error(`Conversation ${input.conversationId} does not belong to provider ${input.provider}`);
      }

      if (conversation.type === 'group') {
        const selfParticipantIds = new Set(
          (await store.listSelfAccounts())
            .filter((account) => account.provider === input.provider)
            .map((account) => account.externalAccountId),
        );
        const recipients = (await store.listGroupMembers(conversation.conversationId)).filter(
          (member) => !selfParticipantIds.has(member.participantId),
        );

        if (recipients.length === 0) {
          throw new Error(`Chat group has no reachable recipients: ${conversation.conversationId}`);
        }

        const sentMessages = await Promise.all(
          recipients.map((member) =>
            provider.sendMessage({
              providerConversationKey: conversation.providerConversationKey,
              contactExternalId: member.participantId,
              conversationName: conversation.name,
              content: input.content,
              replyToProviderMessageId: replyMessage?.providerMessageId,
            }),
          ),
        );
        const firstSent = sentMessages[0]!;

        return saveSentMessage({
          provider: input.provider,
          providerConversationKey: conversation.providerConversationKey,
          providerMessageId: firstSent.providerMessageId,
          conversationName: conversation.name ?? firstSent.conversationName,
          contactSlug: conversation.contactSlug,
          content: input.content,
        });
      }

      let contactExternalId: string | null = null;
      if (conversation.contactSlug) {
        contactExternalId = await getContactExternalId(input.provider, conversation.contactSlug);
      }

      const sent = await provider.sendMessage({
        providerConversationKey: conversation.providerConversationKey,
        conversationName: conversation.name,
        contactExternalId: contactExternalId || undefined,
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

    if (input.conversationId || input.providerConversationKey) {
      throw new Error(
        `Conversation not found for provider ${input.provider}: ${input.conversationId ?? input.providerConversationKey}`,
      );
    }

    if (!input.contactSlug) {
      throw new Error(`No destination provided for provider: ${input.provider}`);
    }

    let contactExternalId = await getContactExternalId(input.provider, input.contactSlug);

    if (!contactExternalId) {
      // No registered identity found — treat the slug as the external ID directly
      // (natural for email where slug = address, or any provider where the agent
      // uses the external ID as the slug). Auto-register so future lookups work.
      contactExternalId = input.contactSlug;
      await store.upsertContact({
        slug: input.contactSlug,
        displayName: input.contactSlug,
        provider: input.provider,
        externalUserId: input.contactSlug,
      });
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

  async function createChatGroup(input: {
    provider: string;
    providerConversationKey: string;
    name: string;
    creatorId: string;
    creatorName: string;
  }) {
    return store.createChatGroup(input);
  }

  async function addMemberToGroup(input: {
    groupId: string;
    participantId: string;
    participantName: string;
    role?: string;
  }) {
    return store.addMemberToGroup(input);
  }

  async function removeMemberFromGroup(input: { groupId: string; participantId: string }) {
    return store.removeMemberFromGroup(input);
  }

  async function listChatGroups(input: { provider?: string; limit?: number }) {
    return store.listChatGroups(input);
  }

  async function listGroupMembers(groupId: string) {
    return store.listGroupMembers(groupId);
  }

  return {
    onReceiveMessage,
    listContacts,
    getContact,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
    createChatGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    listChatGroups,
    listGroupMembers,
  };
}

function formatInboundWakeMessage(input: {
  providerId: string;
  contactSlug?: string;
  providerConversationKey: string;
  providerMessageId: string;
  conversationName?: string;
  authorExternalId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  createdAt: string;
  content: string;
}) {
  const lines = [
    'Inbound communication received.',
    `Provider: ${input.providerId}`,
    `Conversation key: ${input.providerConversationKey}`,
    `Message id: ${input.providerMessageId}`,
    `Timestamp: ${input.createdAt}`,
  ];

  if (input.conversationName) {
    lines.push(`Conversation name: ${input.conversationName}`);
  }

  if (input.contactSlug) {
    lines.push(`Contact slug: ${input.contactSlug}`);
  }

  if (input.authorDisplayName) {
    lines.push(`Author display name: ${input.authorDisplayName}`);
  }

  if (input.authorUsername) {
    lines.push(`Author username: ${input.authorUsername}`);
  }

  if (input.authorExternalId) {
    lines.push(`Author external id: ${input.authorExternalId}`);
  }

  lines.push('', 'Message content:', input.content.trim());

  return lines.join('\n');
}

export type CommunicationModule = Awaited<ReturnType<typeof createCommunicationModule>>;
