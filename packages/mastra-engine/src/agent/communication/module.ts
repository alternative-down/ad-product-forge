import { z } from 'zod';

import { agentContacts } from './agent-contacts';
import { messageStore, type ConversationView, type MessageView } from './message-store';
import type { AgentWakeQueue } from '../wake-queue';

const inboundMessageSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  accountId: z.string(),
  messageId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        url: z.string(),
        contentType: z.string().optional(),
        sizeBytes: z.number().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type CommunicationProvider = {
  id: string;
  accountId: string;
  listConversations(input: {
    agentId: string;
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }): Promise<ConversationView[]>;
  getMessages(input: {
    agentId: string;
    conversationId: string;
    limit: number;
  }): Promise<MessageView[]>;
  sendMessage(input: {
    target: string;
    content: string;
    replyToMessageId?: string;
    contactSlug?: string;
  }): Promise<{
    messageId?: string;
    channelId?: string;
  }>;
};

type RegisteredProvider = {
  provider: CommunicationProvider;
  wakeQueue: AgentWakeQueue;
};

export function createCommunicationModule() {
  const providersByAgentId = new Map<string, Map<string, RegisteredProvider>>();

  function getProvider(agentId: string, providerId: string) {
    return providersByAgentId.get(agentId)?.get(providerId) ?? null;
  }

  function registerProvider(input: {
    agentId: string;
    provider: CommunicationProvider;
    wakeQueue: AgentWakeQueue;
  }) {
    const providers = providersByAgentId.get(input.agentId) ?? new Map<string, RegisteredProvider>();
    providers.set(input.provider.id, {
      provider: input.provider,
      wakeQueue: input.wakeQueue,
    });
    providersByAgentId.set(input.agentId, providers);
  }

  function unregisterProvider(agentId: string, providerId: string) {
    const providers = providersByAgentId.get(agentId);

    if (!providers) {
      return;
    }

    providers.delete(providerId);

    if (providers.size === 0) {
      providersByAgentId.delete(agentId);
    }
  }

  async function receiveInboundMessage(rawInput: unknown) {
    const input = inboundMessageSchema.parse(rawInput);
    const registeredProvider = getProvider(input.agentId, input.provider);

    if (!registeredProvider) {
      throw new Error(`Provider not registered for agent: ${input.provider}`);
    }

    await agentContacts.syncInboundContact({
      agentId: input.agentId,
      provider: input.provider,
      authorId: input.authorId,
      authorName: input.authorName,
      username: input.username,
    });
    await messageStore.saveInboundMessage(input);
    registeredProvider.wakeQueue.notifyExternalEvent();
  }

  async function listContacts(agentId: string) {
    return agentContacts.listAgentContacts(agentId);
  }

  async function getContact(agentId: string, slug: string) {
    return agentContacts.getAgentContact(agentId, slug);
  }

  async function upsertContact(input: {
    agentId: string;
    slug: string;
    displayName: string;
    description?: string;
    accounts?: Array<{
      provider: string;
      externalUserId?: string;
      username?: string;
    }>;
  }) {
    return agentContacts.upsertAgentContact(input);
  }

  async function listConversations(input: {
    agentId: string;
    provider?: string;
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }) {
    const providers = providersByAgentId.get(input.agentId);

    if (!providers || providers.size === 0) {
      return [];
    }

    if (input.provider) {
      const registeredProvider = providers.get(input.provider);

      if (!registeredProvider) {
        return [];
      }

      return registeredProvider.provider.listConversations(input);
    }

    const conversations = await Promise.all(
      Array.from(providers.values()).map(({ provider }) =>
        provider.listConversations({
          agentId: input.agentId,
          contactSlug: input.contactSlug,
          unread: input.unread,
          limit: input.limit,
        }),
      ),
    );

    return conversations
      .flat()
      .sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime())
      .slice(0, input.limit);
  }

  async function getMessages(input: {
    agentId: string;
    conversationId: string;
    limit: number;
  }) {
    const providerId = input.conversationId.split(':', 1)[0];

    if (!providerId) {
      throw new Error(`Could not resolve provider from conversation: ${input.conversationId}`);
    }

    const registeredProvider = getProvider(input.agentId, providerId);

    if (!registeredProvider) {
      throw new Error(`Provider not registered for conversation: ${providerId}`);
    }

    return registeredProvider.provider.getMessages(input);
  }

  async function sendMessage(input: {
    agentId: string;
    provider: string;
    target?: string;
    contactSlug?: string;
    content: string;
    replyToMessageId?: string;
  }) {
    const registeredProvider = getProvider(input.agentId, input.provider);

    if (!registeredProvider) {
      throw new Error(`Provider not registered for agent: ${input.provider}`);
    }

    const replyToMessageId = input.replyToMessageId?.trim() || undefined;
    const repliedMessage = replyToMessageId
      ? await messageStore.findMessage(registeredProvider.provider.accountId, replyToMessageId)
      : null;
    let target = input.target;

    if (input.contactSlug) {
      const contact = await agentContacts.getAgentContact(input.agentId, input.contactSlug);

      if (!contact) {
        throw new Error(`Contact not found: ${input.contactSlug}`);
      }

      const identity = contact.accounts.find((account) => account.provider === input.provider);

      if (!identity) {
        throw new Error(`No ${input.provider} identity found for contact: ${input.contactSlug}`);
      }

      if (replyToMessageId) {
        target = repliedMessage?.channelId;

        if (!target) {
          throw new Error(`No message context found for reply: ${replyToMessageId}`);
        }
      } else {
        target = identity.externalUserId || identity.username;

        if (!target) {
          throw new Error(`No direct identity found for contact: ${input.contactSlug}`);
        }
      }
    }

    if (!target) {
      throw new Error(`Target not resolved for provider: ${input.provider}`);
    }

    if (input.provider === 'internal-chat' && replyToMessageId && !repliedMessage) {
      throw new Error(`Unknown internal-chat replyToMessageId: ${replyToMessageId}`);
    }

    if (
      input.provider === 'internal-chat' &&
      replyToMessageId &&
      repliedMessage?.channelId &&
      repliedMessage.channelId !== target
    ) {
      throw new Error(
        `replyToMessageId ${replyToMessageId} belongs to channel ${repliedMessage.channelId}, but target ${target} was requested.`,
      );
    }

    const sent = await registeredProvider.provider.sendMessage({
      target,
      contactSlug: input.contactSlug,
      content: input.content,
      replyToMessageId,
    });
    const messageId = sent.messageId || `out:${Date.now()}`;

    await messageStore.saveOutboundMessage({
      accountId: registeredProvider.provider.accountId,
      provider: input.provider,
      messageId,
      channelId: sent.channelId || target,
      content: input.content,
      contactSlug: input.contactSlug,
      replyToMessageId,
    });

    return {
      success: true,
      messageId,
    };
  }

  return {
    registerProvider,
    unregisterProvider,
    receiveInboundMessage,
    listContacts,
    getContact,
    upsertContact,
    listConversations,
    getMessages,
    sendMessage,
  };
}

export const communicationModule = createCommunicationModule();
export type { CommunicationProvider };
