import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import type { CommunicationProvider } from '@mastra-engine/core';

import { createDiscordMessageStore } from './discord-message-store.js';

export function createDiscordProvider(config: {
  agentId: string;
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
  const messages = createDiscordMessageStore({
    agentId: config.agentId,
    provider: 'discord',
  });
  let started = false;

  async function ensureClient() {
    if (!client.isReady()) {
      await client.login(config.token);
    }

    if (!client.user) {
      throw new Error('Discord client did not become ready after login');
    }

    return client.user;
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
    async start({ onInbound }) {
      if (started) {
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

        const authorName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
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

        await messages.saveInboundMessage({
          messageId: message.id,
          channelId: message.channelId,
          channelName: message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel',
          authorId: message.author.id,
          authorName,
          username: message.author.username,
          content: content || '[no text content]',
          attachments,
          createdAt: new Date(message.createdTimestamp).toISOString(),
          metadata: {
            serverName: message.guild?.name ?? 'direct-message',
          },
        });

        await onInbound({
          authorId: message.author.id,
          authorName,
          username: message.author.username,
        });
      });

      started = true;
      console.log(`[discord] logged in as ${user.tag}`);
    },
    listConversations: ({ contactSlug, unread, limit }) =>
      messages.listConversations({
        contactSlug,
        unread,
        limit,
      }),
    getMessages: ({ conversationId, limit }) =>
      messages.getMessages({
        conversationId,
        limit,
      }),
    findMessage: (messageId) => messages.findMessage(messageId),
    async sendMessage(input) {
      const user = await ensureClient();

      if (!input.target || !/^\d+$/.test(input.target)) {
        throw new Error(`Unsupported Discord target: ${input.target}`);
      }

      if (input.contactSlug && !input.replyToMessageId) {
        const targetUser = await client.users.fetch(input.target);
        const channel = await targetUser.createDM();
        await channel.sendTyping();
        const sent = await channel.send(input.content);

        await messages.saveOutboundMessage({
          messageId: sent.id,
          channelId: sent.channel.id,
          channelName: 'direct-message',
          content: input.content,
          metadata: {
            contactSlug: input.contactSlug,
            replyToMessageId: input.replyToMessageId,
          },
        });

        return { messageId: sent.id, channelId: sent.channel.id };
      }

      const channel = await client.channels.fetch(input.target);

      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${input.target}`);
      }

      await channel.sendTyping();

      if (input.replyToMessageId) {
        const replyTarget = await channel.messages.fetch(input.replyToMessageId);
        const sent = await replyTarget.reply(input.content);

        await messages.saveOutboundMessage({
          messageId: sent.id,
          channelId: sent.channelId,
          channelName: 'name' in channel ? channel.name ?? undefined : undefined,
          content: input.content,
          metadata: {
            contactSlug: input.contactSlug,
            replyToMessageId: input.replyToMessageId,
          },
        });

        return { messageId: sent.id, channelId: sent.channelId };
      }

      const sent = await channel.send(input.content);

      await messages.saveOutboundMessage({
        messageId: sent.id,
        channelId: sent.channelId,
        channelName: 'name' in channel ? channel.name ?? undefined : undefined,
        content: input.content,
        metadata: {
          contactSlug: input.contactSlug,
          replyToMessageId: input.replyToMessageId,
        },
      });

      return { messageId: sent.id, channelId: sent.channelId };
    },
  };
}
