import { z } from 'zod';

import { agentAccounts } from './agent-accounts';
import { agentContacts } from './agent-contacts';
import type { ProviderConversationView, ProviderMessageView } from './provider-types';
import type { AgentWakeQueue } from '../wake-queue';

const inboundContactSchema = z.object({
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
});

const providerContactSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

export type CommunicationProvider = {
  id: string;
  getAccount(): Promise<{
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }>;
  start?(input: {
    onInbound(input: z.input<typeof inboundContactSchema>): Promise<void>;
    upsertContact(input: z.input<typeof providerContactSchema>): Promise<void>;
  }): Promise<void> | void;
  stop?(): Promise<void> | void;
  listConversations(input: {
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }): Promise<ProviderConversationView[]>;
  getMessages(input: {
    conversationId: string;
    limit: number;
  }): Promise<ProviderMessageView[]>;
  findMessage(messageId: string): Promise<{ messageId: string; channelId?: string } | null>;
  sendMessage(input: {
    target: string;
    content: string;
    replyToMessageId?: string;
    contactSlug?: string;
  }): Promise<{ messageId?: string; channelId?: string }>;
};

export function createCommunicationModule(config: { agentId: string }) {
  const providers = new Map<string, CommunicationProvider>();
  let wakeQueue: AgentWakeQueue | null = null;

  function attachWakeQueue(nextWakeQueue: AgentWakeQueue) {
    wakeQueue = nextWakeQueue;
  }

  function getProvider(providerId: string) {
    return providers.get(providerId) ?? null;
  }

  async function handleInboundMessage(providerId: string, rawInput: unknown) {
    const input = inboundContactSchema.parse(rawInput);

    await agentContacts.syncInboundContact({
      agentId: config.agentId,
      provider: providerId,
      authorId: input.authorId,
      authorName: input.authorName,
      username: input.username,
    });

    if (!wakeQueue) {
      throw new Error(`Wake queue not attached for agent: ${config.agentId}`);
    }

    wakeQueue.notifyExternalEvent();
  }

  async function upsertProviderContact(rawInput: unknown) {
    const input = providerContactSchema.parse(rawInput);

    await agentContacts.upsertAgentContact({
      agentId: config.agentId,
      slug: input.slug,
      displayName: input.displayName,
      accounts: [
        {
          provider: input.provider,
          externalUserId: input.externalUserId,
          username: input.username,
        },
      ],
    });
  }

  async function connectProvider(provider: CommunicationProvider) {
    const account = await provider.getAccount();

    await agentAccounts.ensureAccount({
      agentId: config.agentId,
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
      onInbound: (input) => handleInboundMessage(provider.id, input),
      upsertContact: upsertProviderContact,
    });
  }

  async function disconnectProvider(providerId: string) {
    const provider = getProvider(providerId);

    if (!provider) {
      return;
    }

    if (provider.stop) {
      await provider.stop();
    }

    providers.delete(providerId);
  }

  async function listContacts() {
    return agentContacts.listAgentContacts(config.agentId);
  }

  async function getContact(slug: string) {
    return agentContacts.getAgentContact(config.agentId, slug);
  }

  async function upsertContact(input: { slug: string; displayName: string; description?: string }) {
    return agentContacts.upsertAgentContact({
      agentId: config.agentId,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
    });
  }

  async function listConversations(input: {
    provider?: string;
    contactSlug?: string;
    unread?: boolean;
    limit: number;
  }) {
    if (input.provider) {
      const provider = getProvider(input.provider);

      if (!provider) {
        return [];
      }

      return provider.listConversations({
        contactSlug: input.contactSlug,
        unread: input.unread,
        limit: input.limit,
      });
    }

    const conversations = await Promise.all(
      Array.from(providers.values()).map((provider) =>
        provider.listConversations({
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

  async function getMessages(input: { conversationId: string; limit: number }) {
    const providerId = input.conversationId.split(':', 1)[0];

    if (!providerId) {
      throw new Error(`Could not resolve provider from conversation: ${input.conversationId}`);
    }

    const provider = getProvider(providerId);

    if (!provider) {
      throw new Error(`Provider not registered for conversation: ${providerId}`);
    }

    return provider.getMessages({ conversationId: input.conversationId, limit: input.limit });
  }

  async function sendMessage(input: {
    provider: string;
    target?: string;
    contactSlug?: string;
    content: string;
    replyToMessageId?: string;
  }) {
    const provider = getProvider(input.provider);

    if (!provider) {
      throw new Error(`Provider not registered for agent: ${input.provider}`);
    }

    const replyToMessageId = input.replyToMessageId?.trim() || undefined;
    const repliedMessage = replyToMessageId ? await provider.findMessage(replyToMessageId) : null;
    let target = input.target;

    if (input.contactSlug) {
      const contact = await agentContacts.getAgentContact(config.agentId, input.contactSlug);

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

    const sent = await provider.sendMessage({
      target,
      contactSlug: input.contactSlug,
      content: input.content,
      replyToMessageId,
    });

    return {
      success: true,
      messageId: sent.messageId || `out:${Date.now()}`,
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
