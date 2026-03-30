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

  function formatConversationKey(providerId: string, providerConversationKey: string) {
    return `${providerId}:${providerConversationKey}`;
  }

  function parseConversationReference(conversation: string) {
    const separatorIndex = conversation.indexOf(':');

    if (separatorIndex <= 0) {
      return null;
    }

    const providerId = conversation.slice(0, separatorIndex);
    const providerConversationKey = conversation.slice(separatorIndex + 1);

    if (!providerConversationKey || !providers.has(providerId)) {
      return null;
    }

    return {
      providerId,
      providerConversationKey,
    };
  }

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

        const savedMessage = await store.saveInboundMessage({
          provider: provider.id,
          providerConversationKey: message.providerConversationKey,
          providerMessageId: message.providerMessageId,
          conversationName: message.conversationName,
          contactId: contact?.slug,
          authorExternalId: message.authorExternalId,
          authorDisplayName: message.authorDisplayName,
          authorUsername: message.authorUsername,
          content: message.content,
          attachments: message.attachments,
          createdAt: message.createdAt,
          metadata: message.metadata,
        });

        if (!savedMessage) {
          throw new Error('Failed to persist inbound message');
        }

        const savedConversation = await store.getConversation(savedMessage.conversationId);

        if (receiveMessageHandler) {
          try {
            receiveMessageHandler({
              type: `message:${provider.id}`,
              groupKey: `message:${provider.id}:${message.providerConversationKey}`,
              groupMetadata: {
                ConversationKey: formatConversationKey(
                  provider.id,
                  savedConversation?.providerConversationKey ?? message.providerConversationKey,
                ),
                ...(savedConversation?.name ? { ConversationName: savedConversation.name } : {}),
                ...(contact?.slug ? { ContactSlug: contact.slug } : {}),
              },
              idempotencyKey: `${provider.id}:${message.providerMessageId}`,
              itemMetadata: {
                MessageId: savedMessage.messageId,
                ...(message.authorDisplayName
                  ? { Author: message.authorDisplayName }
                  : message.authorUsername
                    ? { Author: message.authorUsername }
                    : {}),
              },
              text: message.content.trim(),
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
    contactId?: string;
    content: string;
  }) {
    const message = await store.saveOutboundMessage(input);

    if (!message) {
      throw new Error('Failed to persist outbound message');
    }

    const conversation = await store.getConversation(message.conversationId);

    return {
      success: true,
      messageId: message.messageId,
      conversationKey: formatConversationKey(
        input.provider,
        conversation?.providerConversationKey ?? input.providerConversationKey,
      ),
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
        accounts: contact.accounts.map((account) => ({
          provider: account.provider,
          username: account.username,
        })),
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
      accounts: contact.accounts.map((account) => ({
        provider: account.provider,
        username: account.username,
      })),
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
    const conversations = await store.listConversations({
      provider: input.provider,
      contactId: input.contactSlug,
      unread: input.unread,
      limit: input.limit,
    });
    const contacts = await store.listContacts();

    const contactMap = new Map(contacts.map((contact) => [contact.slug, contact]));

    return conversations.map((conversation) => {
      const contactDisplayName = conversation.contactId ? contactMap.get(conversation.contactId)?.displayName : undefined;

      return {
        conversationKey: formatConversationKey(
          conversation.provider,
          conversation.providerConversationKey,
        ),
        provider: conversation.provider,
        latestMessageAt: conversation.latestMessageAt,
        unreadCount: conversation.unreadCount,
        name: conversation.name,
        type: conversation.type,
        contactSlug: conversation.contactId,
        contactDisplayName,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          provider: message.provider,
          content: message.content,
          attachments: message.attachments,
          unread: message.unread,
          createdAt: message.createdAt,
          authorDisplayName: message.authorDisplayName,
          contactSlug: conversation.contactId,
          contactDisplayName,
        })),
      };
    });
  }

  async function getMessages(input: {
    conversationKey: string;
    limit: number;
  }): Promise<CommunicationMessageView[]> {
    const parsedConversation = parseConversationReference(input.conversationKey);

    if (!parsedConversation) {
      throw new Error(`Conversation not found: ${input.conversationKey}`);
    }

    const matches = await store.findConversationsByConversationKey(
      parsedConversation.providerConversationKey,
      parsedConversation.providerId,
    );

    if (matches.length === 0) {
      throw new Error(`Conversation not found: ${input.conversationKey}`);
    }

    if (matches.length > 1) {
      throw new Error(`Conversation key is ambiguous across providers: ${input.conversationKey}`);
    }

    const conversation = matches[0]!;
    const messages = await store.getMessages(conversation.conversationId, input.limit);
    const contact = conversation?.contactId ? await store.getContact(conversation.contactId) : null;

    return messages.map((message) => ({
      messageId: message.messageId,
      provider: message.provider,
      content: message.content,
      attachments: message.attachments,
      unread: message.unread,
      createdAt: message.createdAt,
      authorDisplayName: message.authorDisplayName,
      contactSlug: conversation?.contactId,
      contactDisplayName: contact?.displayName,
    }));
  }

  // TODO: Future enhancement — support multiple recipients (TO, CC) per message.
  // This requires extending the sendMessage input contract in provider-types.ts
  // and updating the agent-facing communication tools accordingly.
  async function sendMessage(input: {
    conversationKey?: string;
    content: string;
    replyToMessageId?: string;
  }) {
    const parsedConversation = input.conversationKey
      ? parseConversationReference(input.conversationKey)
      : null;

    // Fallback logic: resolve provider if not provided
    let resolvedProvider: CommunicationProvider | undefined = parsedConversation
      ? providers.get(parsedConversation.providerId)
      : undefined;

    if (input.conversationKey && !parsedConversation) {
      throw new Error(`Conversation not found: ${input.conversationKey}`);
    }

    if (!resolvedProvider) {
      throw new Error(`Provider not available: ${input.conversationKey}`);
    }

    if (!resolvedProvider) {
      const availableProviders = Array.from(providers.keys());
      throw new Error(
        `Provider not available. ` +
        `Available providers: ${availableProviders.join(', ') || 'none'}. ` +
        `Tip: Call list_contacts with filter='self' to see your available providers.`,
      );
    }

    const provider = resolvedProvider;

    const replyMessage = input.replyToMessageId ? await store.getMessage(input.replyToMessageId) : null;

    if (replyMessage && replyMessage.provider !== provider.id) {
      throw new Error(`Message ${input.replyToMessageId} does not belong to provider ${provider.id}`);
    }

    const conversationMatches = parsedConversation
      ? await store.findConversationsByConversationKey(
          parsedConversation.providerConversationKey,
          parsedConversation.providerId,
        )
      : [];
    const conversation = conversationMatches[0] ?? null;

    if (conversation) {
      if (conversation.provider !== provider.id) {
        throw new Error(`Conversation ${input.conversationKey} does not belong to provider ${provider.id}`);
      }

      if (conversation.type === 'group') {
        const selfParticipantIds = new Set(
          (await store.listSelfAccounts())
            .filter((account) => account.provider === provider.id)
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
              conversationType: conversation.type,
              content: input.content,
              replyToProviderMessageId: replyMessage?.providerMessageId,
            }),
          ),
        );
        const firstSent = sentMessages[0]!;

        return saveSentMessage({
          provider: provider.id,
          providerConversationKey: conversation.providerConversationKey,
          providerMessageId: firstSent.providerMessageId,
          conversationName: conversation.name ?? firstSent.conversationName,
          contactId: conversation.contactId,
          content: input.content,
        });
      }

      let contactExternalId: string | null = null;
      if (conversation.contactId) {
        contactExternalId = await getContactExternalId(provider.id, conversation.contactId);
      }

      const sent = await provider.sendMessage({
        providerConversationKey: conversation.providerConversationKey,
        conversationName: conversation.name,
        conversationType: conversation.type,
        contactExternalId: contactExternalId || undefined,
        content: input.content,
        replyToProviderMessageId: replyMessage?.providerMessageId,
      });

      return saveSentMessage({
        provider: provider.id,
        providerConversationKey: sent.providerConversationKey,
        providerMessageId: sent.providerMessageId,
        conversationName: sent.conversationName,
        contactId: conversation.contactId,
        content: input.content,
      });
    }

    if (parsedConversation && await store.getContact(parsedConversation.providerConversationKey)) {
      let contactExternalId = await getContactExternalId(provider.id, parsedConversation.providerConversationKey);

      if (!contactExternalId) {
        throw new Error(`Contact not found: ${input.conversationKey}`);
      }

      const sent = await provider.sendMessage({
        contactExternalId,
        conversationType: 'dm',
        content: input.content,
        replyToProviderMessageId: replyMessage?.providerMessageId,
      });

      return saveSentMessage({
        provider: provider.id,
        providerConversationKey: sent.providerConversationKey,
        providerMessageId: sent.providerMessageId,
        conversationName: sent.conversationName,
        contactId: parsedConversation.providerConversationKey,
        content: input.content,
      });
    }

    if (parsedConversation) {
      const newConversation = await store.upsertConversation({
        provider: provider.id,
        providerConversationKey: parsedConversation.providerConversationKey,
        type: 'dm',
      });

      if (!newConversation) {
        throw new Error(`Failed to create conversation for provider ${provider.id}: ${input.conversationKey}`);
      }

      const sent = await provider.sendMessage({
        providerConversationKey: newConversation.providerConversationKey,
        conversationName: newConversation.name,
        conversationType: newConversation.type,
        content: input.content,
        replyToProviderMessageId: replyMessage?.providerMessageId,
      });

      return saveSentMessage({
        provider: provider.id,
        providerConversationKey: sent.providerConversationKey,
        providerMessageId: sent.providerMessageId,
        conversationName: sent.conversationName,
        contactId: newConversation.contactId,
        content: input.content,
      });
    }

    throw new Error(`No destination provided for provider: ${provider.id}`);
  }

  async function createChatGroup(input: {
    provider: string;
    conversationKey: string;
    name: string;
    creatorId: string;
    creatorName: string;
  }) {
    const group = await store.createChatGroup({
      provider: input.provider,
      providerConversationKey: input.conversationKey,
      name: input.name,
      creatorId: input.creatorId,
      creatorName: input.creatorName,
    });

    return {
      groupId: group.groupId,
      name: group.name,
      provider: group.provider,
      conversationKey: formatConversationKey(group.provider, group.providerConversationKey),
      creatorMember: group.creatorMember,
      createdAt: group.createdAt,
    };
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
    const groups = await store.listChatGroups(input);

    return groups.map((group) => ({
      groupId: group.groupId,
      name: group.name,
      provider: group.provider,
      conversationKey: formatConversationKey(group.provider, group.providerConversationKey),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
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

export type CommunicationModule = Awaited<ReturnType<typeof createCommunicationModule>>;
