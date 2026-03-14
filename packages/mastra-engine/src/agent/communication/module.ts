import { createCommunicationStore } from './store';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationProvider,
} from './provider-types';

export function createCommunicationModule(config: { agentId: string; wakeUp(): void }) {
  const store = createCommunicationStore(config.agentId);
  const providers = new Map<string, CommunicationProvider>();

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

  async function connectProvider(provider: CommunicationProvider) {
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
      return;
    }

    await provider.onMessage(async (message) => {
      await store.saveInboundMessage({
        provider: provider.id,
        providerConversationKey: message.providerConversationKey,
        providerMessageId: message.providerMessageId,
        conversationName: message.conversationName,
        authorExternalId: message.authorExternalId,
        authorDisplayName: message.authorDisplayName,
        authorUsername: message.authorUsername,
        content: message.content,
        attachments: message.attachments,
        createdAt: message.createdAt,
        metadata: message.metadata,
      });
      config.wakeUp();
    });
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

    return {
      success: true,
      messageId: message.messageId,
      conversationId: message.conversationId,
    };
  }

  async function getContactExternalId(provider: CommunicationProvider, providerId: string, contactSlug: string) {
    const currentContact = await store.getContact(contactSlug);
    const currentIdentity = currentContact?.accounts.find((account) => account.provider === providerId);

    if (!currentIdentity) {
      await syncProviderContacts(provider);
    }

    const contact = await store.getContact(contactSlug);
    const identity = contact?.accounts.find((account) => account.provider === providerId);

    return identity?.externalUserId || identity?.username || null;
  }

  async function listContacts() {
    return store.listContacts();
  }

  async function getContact(slug: string) {
    return store.getContact(slug);
  }

  async function upsertContact(input: { slug: string; displayName: string; description?: string }) {
    return store.upsertContact(input);
  }

  async function listConversations(input: {
    provider?: string;
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }): Promise<CommunicationConversationView[]> {
    return store.listConversations(input);
  }

  async function getMessages(input: {
    conversationId: string;
    limit: number;
  }): Promise<CommunicationMessageView[]> {
    return store.getMessages(input.conversationId, input.limit);
  }

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

    const contactExternalId = await getContactExternalId(provider, input.provider, input.contactSlug);

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
    connectProvider,
    listContacts,
    getContact,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
  };
}
