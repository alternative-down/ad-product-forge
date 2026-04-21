import type { AgentWakeEvent } from './wake-queue.js';
import type {
  CommunicationConversationView,
  CommunicationMessageView,
  CommunicationModule,
  CommunicationProvider,
  CommunicationProviderContact,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from './communication.js';

export async function createCommunicationModule(config: {
  providers: CommunicationProvider[];
}): Promise<CommunicationModule> {
  const providers = new Map(config.providers.map((provider) => [provider.id, provider]));
  let receiveMessageHandler: ((event: AgentWakeEvent) => void) | null = null;

  for (const provider of providers.values()) {
    if (!provider.onMessage) {
      continue;
    }

    await provider.onMessage(async (message) => {
      if (!receiveMessageHandler) {
        return;
      }

      receiveMessageHandler({
        type: `message:${provider.id}`,
        groupKey: `message:${provider.id}:${message.targetKey}`,
        idempotencyKey: `${provider.id}:${message.messageId}`,
        timestamp: Date.parse(message.createdAt) || Date.now(),
        text: message.content,
      });
    });
  }

  return {
    providers,
    async listContacts(filter = 'others') {
      const self = filter === 'others'
        ? []
        : (await Promise.all(Array.from(providers.values()).map((provider) => provider.getSelfContact?.())))
          .filter((contact): contact is CommunicationProviderContact => Boolean(contact));
      const others = filter === 'self'
        ? []
        : (await Promise.all(Array.from(providers.values()).map((provider) => provider.listContacts?.())))
          .flat()
          .filter((contact): contact is CommunicationProviderContact => Boolean(contact));

      return { self, others };
    },
    async upsertContact(input) {
      return input;
    },
    async listConversations(input) {
      const selectedProviders = input.provider
        ? [providers.get(input.provider)].filter((provider): provider is CommunicationProvider => Boolean(provider))
        : Array.from(providers.values());
      const conversations = (await Promise.all(selectedProviders.map((provider) => {
        return provider.listConversations?.({
          limit: input.limit,
          unread: input.unread,
        }) ?? [];
      }))).flat();

      return conversations.map(toConversationView);
    },
    async getMessages(input) {
      const provider = providers.get(input.provider);

      if (!provider?.getMessages) {
        return [];
      }

      const messages = await provider.getMessages(input);

      return messages.map(toMessageView);
    },
    async sendMessage(input) {
      const provider = providers.get(input.provider);

      if (!provider) {
        throw new Error(`Communication provider not found: ${input.provider}`);
      }

      return provider.sendMessage({
        targetKey: input.targetKey,
        content: input.content,
        attachments: [],
      });
    },
    onReceiveMessage(handler) {
      receiveMessageHandler = handler;
    },
    async dispose() {
      await Promise.all(Array.from(providers.values()).map((provider) => provider.dispose?.()));
    },
  };
}

function toMessageView(message: CommunicationProviderMessage): CommunicationMessageView {
  return {
    messageId: message.messageId,
    provider: message.provider,
    authorId: message.authorId,
    targetKey: message.targetKey,
    content: message.content,
    attachments: message.attachments.map((attachment) => ({
      path: attachment.name,
      name: attachment.name,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
    })),
    unread: message.unread,
    createdAt: message.createdAt,
    authorDisplayName: message.authorDisplayName,
  };
}

function toConversationView(conversation: CommunicationProviderConversation): CommunicationConversationView {
  return {
    targetKey: conversation.targetKey,
    provider: conversation.provider,
    latestMessageAt: conversation.latestMessageAt,
    unreadCount: conversation.unreadCount,
    name: conversation.name,
    participants: conversation.participants,
    messages: conversation.messages.map(toMessageView),
  };
}
