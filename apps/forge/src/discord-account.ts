import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import type { CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

export function createDiscordProvider(config: {
  token: string;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
}): CommunicationProvider {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });
  const allowedChannelIds = new Set(config.allowedChannelIds ?? []);
  const respondToMentionsOnly = config.respondToMentionsOnly ?? true;
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];

  async function withTyping<T extends { sendTyping(): Promise<unknown> }>(
    channel: T,
    run: () => Promise<{
      providerConversationKey: string;
      providerMessageId?: string;
      conversationName?: string;
    }>,
  ) {
    await channel.sendTyping();

    const typingTimer = setInterval(() => {
      void channel.sendTyping();
    }, 8_000);

    try {
      return await run();
    } finally {
      clearInterval(typingTimer);
    }
  }

  async function toInboundMessage(message: Message, botUserId: string): Promise<CommunicationInboundMessage | null> {
    if (message.author.bot) {
      return null;
    }

    if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) {
      return null;
    }

    if (
      message.channel.type !== ChannelType.DM &&
      respondToMentionsOnly &&
      !message.mentions.users.has(botUserId)
    ) {
      return null;
    }

    const authorDisplayName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
    const content = message.content
      .replaceAll(`<@${botUserId}>`, '')
      .replaceAll(`<@!${botUserId}>`, '')
      .trim();
    const attachments = Array.from(message.attachments.values()).map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType ?? undefined,
      sizeBytes: attachment.size,
      description: attachment.description ?? undefined,
    }));

    return {
      providerConversationKey: message.channelId,
      providerMessageId: message.id,
      conversationName:
        message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel',
      authorExternalId: message.author.id,
      authorDisplayName,
      authorUsername: message.author.username,
      content: content || '[no text content]',
      attachments,
      createdAt: new Date(message.createdTimestamp).toISOString(),
      metadata: {
        serverName: message.guild?.name ?? 'direct-message',
      },
    };
  }

  async function deliverMessage(message: CommunicationInboundMessage) {
    if (!onInboundMessage) {
      pendingMessages.push(message);
      return;
    }

    await onInboundMessage(message);
  }

  async function flushPendingMessages() {
    if (!onInboundMessage || pendingMessages.length === 0) {
      return;
    }

    while (pendingMessages.length > 0) {
      const message = pendingMessages.shift();

      if (!message) {
        return;
      }

      await onInboundMessage(message);
    }
  }

  const ready = client.login(config.token).then(() => {
    if (!client.user) {
      throw new Error('Discord client did not become ready after login');
    }

    client.on(Events.MessageCreate, async (message) => {
      const callback = onInboundMessage;

      if (!callback) {
        return;
      }

      try {
        const inboundMessage = await toInboundMessage(message, client.user!.id);

        if (!inboundMessage) {
          return;
        }

        await deliverMessage(inboundMessage);
      } catch (error) {
        console.error('[discord] Error handling MessageCreate event:', error);
      }
    });

    console.log(`[discord] logged in as ${client.user.tag}`);
    return client.user;
  });

  async function ensureClient() {
    return ready;
  }

  return {
    id: 'discord',
    async getAccount() {
      const user = await ensureClient();

      return {
        externalAccountId: user.id,
        displayName: user.tag,
      };
    },
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async sendMessage(input) {
      await ensureClient();

      if (input.contactExternalId && !input.providerConversationKey) {
        const targetUser = await client.users.fetch(input.contactExternalId);
        const channel = await targetUser.createDM();

        return withTyping(channel, async () => {
          const sent = await channel.send(input.content);

          return {
            providerConversationKey: channel.id,
            providerMessageId: sent.id,
            conversationName: 'direct-message',
          };
        });
      }

      if (!input.providerConversationKey || !/^\d+$/.test(input.providerConversationKey)) {
        throw new Error(`Unsupported Discord conversation: ${input.providerConversationKey}`);
      }

      const channel = await client.channels.fetch(input.providerConversationKey);

      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${input.providerConversationKey}`);
      }

      return withTyping(channel, async () => {
        if (input.replyToProviderMessageId) {
          const replyTarget = await channel.messages.fetch(input.replyToProviderMessageId);
          const sent = await replyTarget.reply(input.content);

          return {
            providerConversationKey: sent.channelId,
            providerMessageId: sent.id,
            conversationName: 'name' in channel ? channel.name ?? undefined : undefined,
          };
        }

        const sent = await channel.send(input.content);

        return {
          providerConversationKey: sent.channelId,
          providerMessageId: sent.id,
          conversationName: 'name' in channel ? channel.name ?? undefined : undefined,
        };
      });
    },
  };
}
