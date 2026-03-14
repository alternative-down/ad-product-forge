import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import type { CommunicationProvider } from '@mastra-engine/core';

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
  let listening = false;

  async function ensureClient() {
    if (!client.isReady()) {
      await client.login(config.token);
    }

    if (!client.user) {
      throw new Error('Discord client did not become ready after login');
    }

    return client.user;
  }

  async function withTyping<T extends { sendTyping(): Promise<unknown> }>(channel: T, run: () => Promise<{
    providerConversationKey: string;
    providerMessageId?: string;
    conversationName?: string;
  }>) {
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

  return {
    id: 'discord',
    async getAccount() {
      const user = await ensureClient();

      return {
        externalAccountId: user.id,
        displayName: user.tag,
      };
    },
    async onMessage(callback) {
      if (listening) {
        return;
      }

      const user = await ensureClient();

      client.on(Events.MessageCreate, async (message: Message) => {
        if (message.author.bot) {
          return;
        }

        if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) {
          return;
        }

        if (
          message.channel.type !== ChannelType.DM &&
          respondToMentionsOnly &&
          !message.mentions.users.has(user.id)
        ) {
          return;
        }

        const authorDisplayName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
        const content = message.content
          .replaceAll(`<@${user.id}>`, '')
          .replaceAll(`<@!${user.id}>`, '')
          .trim();
        const attachments = Array.from(message.attachments.values()).map((attachment) => ({
          id: attachment.id,
          name: attachment.name ?? undefined,
          url: attachment.url,
          contentType: attachment.contentType ?? undefined,
          sizeBytes: attachment.size,
          description: attachment.description ?? undefined,
        }));

        await callback({
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
        });
      });

      listening = true;
      console.log(`[discord] logged in as ${user.tag}`);
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
