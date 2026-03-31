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

  function parseConversationReference(conversation: string) {
    const separatorIndex = conversation.indexOf(':');

    if (separatorIndex <= 0) {
      return null;
    }

    const providerId = conversation.slice(0, separatorIndex);
    const contactSlug = conversation.slice(separatorIndex + 1);

    if (!contactSlug || !providers.has(providerId)) {
      return null;
    }

    return {
      providerId,
      contactSlug,
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
        const conversationType = (
          message.metadata &&
          typeof message.metadata === 'object' &&
          'conversationType' in message.metadata &&
          typeof message.metadata.conversationType === 'string'
        )
          ? message.metadata.conversationType
          : undefined;
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
          conversationType,
          contactId: conversationType === 'dm' ? contact?.slug : undefined,
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

        const groupMembers = (
          message.metadata &&
          typeof message.metadata === 'object' &&
          'groupMembers' in message.metadata &&
          Array.isArray(message.metadata.groupMembers)
        )
          ? message.metadata.groupMembers
          : [];

        if (savedConversation?.type === 'group' && groupMembers.length > 0) {
          for (const groupMember of groupMembers) {
            if (!groupMember || typeof groupMember !== 'object') {
              continue;
            }

            const participantId = 'agentId' in groupMember && typeof groupMember.agentId === 'string'
              ? groupMember.agentId
              : null;
            const participantName = 'displayName' in groupMember && typeof groupMember.displayName === 'string'
              ? groupMember.displayName
              : participantId;

            if (!participantId || !participantName) {
              continue;
            }

            await store.addMemberToGroup({
              groupId: savedConversation.conversationId,
              participantId,
              participantName,
            });
          }
        }

        if (receiveMessageHandler) {
          try {
            receiveMessageHandler({
              type: `message:${provider.id}`,
              groupKey: `message:${provider.id}:${message.providerConversationKey}`,
              groupMetadata: {
                ...(savedConversation?.conversationId ? { ConversationKey: savedConversation.conversationId } : {}),
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
                ...(contact?.slug ? { Slug: contact.slug } : {}),
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
    const selfAccount = (await store.listSelfAccounts()).find((account) => account.provider === input.provider);
    const message = await store.saveOutboundMessage({
      ...input,
      authorDisplayName: selfAccount?.displayName,
    });

    if (!message) {
      throw new Error('Failed to persist outbound message');
    }

    const conversation = await store.getConversation(message.conversationId);

    return {
      success: true,
      messageId: message.messageId,
      conversationKey: conversation?.conversationId ?? message.conversationId,
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
      const contactDisplayName = conversation.type === 'dm' && conversation.contactId
        ? contactMap.get(conversation.contactId)?.displayName
        : undefined;
      const contactSlug = conversation.type === 'dm' ? conversation.contactId : undefined;

      return {
        conversationKey: conversation.conversationId,
        provider: conversation.provider,
        latestMessageAt: conversation.latestMessageAt,
        unreadCount: conversation.unreadCount,
        name: conversation.name,
        type: conversation.type,
        contactSlug,
        contactDisplayName,
        messages: conversation.messages.map((message) => ({
          messageId: message.messageId,
          provider: message.provider,
          content: message.content,
          attachments: message.attachments,
          unread: message.unread,
          createdAt: message.createdAt,
          authorDisplayName: message.authorDisplayName,
          contactSlug,
          contactDisplayName,
        })),
      };
    });
  }

  async function getMessages(input: {
    conversationKey: string;
    limit: number;
  }): Promise<CommunicationMessageView[]> {
    const conversation = await store.getConversation(input.conversationKey);

    if (!conversation) {
      throw new Error(`Conversation not found: ${input.conversationKey}`);
    }
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
      contactSlug: conversation.type === 'dm' ? conversation.contactId : undefined,
      contactDisplayName: conversation.type === 'dm' ? contact?.displayName : undefined,
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
    if (!input.conversationKey) {
      throw new Error('No destination provided');
    }

    const existingConversation = await store.getConversation(input.conversationKey);
    const parsedConversation = existingConversation
      ? null
      : parseConversationReference(input.conversationKey);
    const provider = existingConversation
      ? providers.get(existingConversation.provider)
      : parsedConversation
        ? providers.get(parsedConversation.providerId)
        : null;

    if (!provider) {
      if (parsedConversation) {
        throw new Error(`Provider not available: ${input.conversationKey}`);
      }

      throw new Error(`Conversation not found: ${input.conversationKey}`);
    }

    const replyMessage = input.replyToMessageId ? await store.getMessage(input.replyToMessageId) : null;

    if (replyMessage && replyMessage.provider !== provider.id) {
      throw new Error(`Message ${input.replyToMessageId} does not belong to provider ${provider.id}`);
    }

    const conversation = existingConversation;

    if (conversation) {
      if (conversation.provider !== provider.id) {
        throw new Error(`Conversation ${input.conversationKey} does not belong to provider ${provider.id}`);
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

    if (parsedConversation && await store.getContact(parsedConversation.contactSlug)) {
      const contactExternalId = await getContactExternalId(provider.id, parsedConversation.contactSlug);

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
        contactId: parsedConversation.contactSlug,
        content: input.content,
      });
    }

    throw new Error(`Contact not found: ${input.conversationKey}`);
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
      conversationKey: group.groupId,
      creatorMember: group.creatorMember,
      createdAt: group.createdAt,
    };
  }

  async function addMemberToGroup(input: {
    groupId: string;
    participantSlug: string;
    role?: string;
  }) {
    const group = await store.getConversation(input.groupId);

    if (!group || group.type !== 'group') {
      throw new Error('Chat group not found');
    }

    const contact = await store.getContact(input.participantSlug);

    if (!contact) {
      throw new Error(`Contact not found: ${input.participantSlug}`);
    }

    const identity = contact.accounts.find((account) => account.provider === group.provider);
    const participantId = identity?.externalUserId || identity?.username;

    if (!participantId) {
      throw new Error(`Contact ${input.participantSlug} is not reachable on provider ${group.provider}`);
    }

    const member = await store.addMemberToGroup({
      groupId: group.conversationId,
      participantId,
      participantName: contact.displayName,
      role: input.role,
    });

    return {
      groupId: member.groupId,
      participantSlug: contact.slug,
      participantName: member.participantName,
      role: member.role,
      createdAt: member.createdAt,
    };
  }

  async function removeMemberFromGroup(input: { groupId: string; participantSlug: string }) {
    const group = await store.getConversation(input.groupId);

    if (!group || group.type !== 'group') {
      throw new Error('Chat group not found');
    }

    const contact = await store.getContact(input.participantSlug);

    if (!contact) {
      throw new Error(`Contact not found: ${input.participantSlug}`);
    }

    const identity = contact.accounts.find((account) => account.provider === group.provider);
    const participantId = identity?.externalUserId || identity?.username;

    if (!participantId) {
      throw new Error(`Contact ${input.participantSlug} is not reachable on provider ${group.provider}`);
    }

    await store.removeMemberFromGroup({
      groupId: group.conversationId,
      participantId,
    });

    return {
      success: true,
      groupId: input.groupId,
      participantSlug: contact.slug,
    };
  }

  async function listChatGroups(input: { provider?: string; limit?: number }) {
    const groups = await store.listChatGroups(input);

    return groups.map((group) => ({
      groupId: group.groupId,
      name: group.name,
      provider: group.provider,
      conversationKey: group.groupId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }));
  }

  async function listGroupMembers(groupId: string) {
    const group = await store.getConversation(groupId);

    if (!group || group.type !== 'group') {
      throw new Error('Chat group not found');
    }

    const members = await store.listGroupMembers(group.conversationId);

    return Promise.all(
      members.map(async (member) => {
        const contact = await store.findContactByIdentity(
          group.provider,
          member.participantId,
          member.participantId,
        );

        return {
          groupId: member.groupId,
          participantSlug: contact?.slug ?? member.participantId,
          participantName: contact?.displayName ?? member.participantName,
          role: member.role,
          createdAt: member.createdAt,
        };
      }),
    );
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
