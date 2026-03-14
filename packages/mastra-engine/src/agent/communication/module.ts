import { createCommunicationStore } from './store';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationProvider,
} from './provider-types';
import type { AgentWakeQueue } from '../wake-queue';

export function createCommunicationModule(config: { agentId: string }) {
  const store = createCommunicationStore(config.agentId);
  const providers = new Map<string, CommunicationProvider>();
  let wakeQueue: AgentWakeQueue | null = null;

  function attachWakeQueue(nextWakeQueue: AgentWakeQueue) {
    wakeQueue = nextWakeQueue;
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

    if (!provider.start) {
      return;
    }

    await provider.start({
      onInbound: async (message) => {
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

        if (!wakeQueue) {
          throw new Error(`Wake queue not attached for agent: ${config.agentId}`);
        }

        wakeQueue.notifyExternalEvent();
      },
      upsertContact: (input) =>
        store.upsertContact({
          slug: input.slug,
          displayName: input.displayName,
          provider: input.provider,
          externalUserId: input.externalUserId,
          username: input.username,
        }).then(() => undefined),
    });
  }

  async function disconnectProvider(providerId: string) {
    const provider = providers.get(providerId);

    if (!provider) {
      return;
    }

    if (provider.stop) {
      await provider.stop();
    }

    providers.delete(providerId);
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
    let providerConversationKey: string | undefined;
    let contactExternalId: string | undefined;
    let contactSlug = input.contactSlug;

    if (input.conversationId) {
      const conversation = await store.getConversation(input.conversationId);

      if (!conversation) {
        throw new Error(`Conversation not found: ${input.conversationId}`);
      }

      if (conversation.provider !== input.provider) {
        throw new Error(`Conversation ${input.conversationId} does not belong to provider ${input.provider}`);
      }

      providerConversationKey = conversation.providerConversationKey;
      contactSlug = conversation.contactSlug;
    }

    if (input.contactSlug && !providerConversationKey) {
      const contact = await store.getContact(input.contactSlug);

      if (!contact) {
        throw new Error(`Contact not found: ${input.contactSlug}`);
      }

      const identity = contact.accounts.find((account) => account.provider === input.provider);

      if (!identity) {
        throw new Error(`No ${input.provider} identity found for contact: ${input.contactSlug}`);
      }

      contactExternalId = identity.externalUserId || identity.username;

      if (!contactExternalId) {
        throw new Error(`No direct identity found for contact: ${input.contactSlug}`);
      }
    }

    if (input.replyToMessageId) {
      if (!replyMessage) {
        throw new Error(`Message not found: ${input.replyToMessageId}`);
      }

      if (replyMessage.provider !== input.provider) {
        throw new Error(`Message ${input.replyToMessageId} does not belong to provider ${input.provider}`);
      }

      const replyConversation = await store.getConversation(replyMessage.conversationId);

      if (!replyConversation) {
        throw new Error(`Conversation not found for message: ${input.replyToMessageId}`);
      }

      providerConversationKey = replyConversation.providerConversationKey;
    }

    const sent = await provider.sendMessage({
      providerConversationKey,
      contactExternalId,
      content: input.content,
      replyToProviderMessageId: replyMessage?.providerMessageId,
    });
    const message = await store.saveOutboundMessage({
      provider: input.provider,
      providerConversationKey: sent.providerConversationKey,
      providerMessageId: sent.providerMessageId,
      conversationName: sent.conversationName,
      contactSlug,
      content: input.content,
    });

    return {
      success: true,
      messageId: message.messageId,
      conversationId: message.conversationId,
    };
  }

  return {
    attachWakeQueue,
    connectProvider,
    disconnectProvider,
    listContacts,
    getContact,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
  };
}
