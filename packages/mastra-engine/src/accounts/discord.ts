import type { Agent } from '@mastra/core/agent';
import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import { communicationModule } from '../agent/communication/module';
import type { AgentWakeQueue } from '../agent/wake-queue';
import { forgeDebug } from '../debug';
import { createProviderMessageStore } from './provider-message-store';

export type DiscordAgentClientConfig = {
  agent: Agent;
  token: string;
  wakeQueue: AgentWakeQueue;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
};

export async function createDiscordAgentClient(config: DiscordAgentClientConfig) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });
  const agentId = config.agent.id;
  const allowedChannelIds = new Set(config.allowedChannelIds ?? []);
  const respondToMentionsOnly = config.respondToMentionsOnly ?? true;

  await client.login(config.token);

  if (!client.user) {
    throw new Error('Discord client did not become ready after login');
  }

  const discordUserId = client.user.id;
  const messages = createProviderMessageStore({
    agentId,
    provider: 'discord',
  });

  async function sendDiscordMessage(input: {
    target: string;
    content: string;
    replyToMessageId?: string;
    contactSlug?: string;
  }) {
    if (!input.target || !/^\d+$/.test(input.target)) {
      throw new Error(`Unsupported Discord target: ${input.target}`);
    }

    if (input.contactSlug && !input.replyToMessageId) {
      const user = await client.users.fetch(input.target);
      const channel = await user.createDM();
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
  }

  await communicationModule.registerProvider({
    agentId,
    externalAccountId: discordUserId,
    displayName: client.user.tag,
    wakeQueue: config.wakeQueue,
    provider: {
      id: 'discord',
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
      sendMessage: sendDiscordMessage,
    },
  });

  async function handleInboundMessage(message: Message) {
    if (message.author.bot) {
      forgeDebug('discord', 'message ignored', {
        channelId: message.channelId,
        authorId: message.author.id,
        isBot: true,
      });
      return;
    }

    if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) {
      forgeDebug('discord', 'message ignored', {
        channelId: message.channelId,
        authorId: message.author.id,
        reason: 'channel not allowed',
      });
      return;
    }

    if (
      message.channel.type !== ChannelType.DM &&
      respondToMentionsOnly &&
      !message.mentions.users.has(discordUserId)
    ) {
      forgeDebug('discord', 'message ignored', {
        channelId: message.channelId,
        authorId: message.author.id,
        reason: 'mention required',
      });
      return;
    }

    try {
      const authorName =
        message.member?.displayName ?? message.author.globalName ?? message.author.username;
      const content = message.content
        .replaceAll(`<@${discordUserId}>`, '')
        .replaceAll(`<@!${discordUserId}>`, '')
        .trim();
      const channelName =
        message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel';
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
        channelName,
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
      await communicationModule.receiveInboundMessage({
        agentId,
        provider: 'discord',
        authorId: message.author.id,
        authorName,
        username: message.author.username,
      });

      forgeDebug('discord', 'message registered', {
        agentId,
        channelId: message.channelId,
        messageId: message.id,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[forge:discord] agent execution failed', error);
      await message.reply(`Erro ao executar o agente: ${errorMessage}`);
    }
  }

  client.on(Events.MessageCreate, handleInboundMessage);

  console.log(`[discord] logged in as ${client.user.tag}`);
  return client;
}
