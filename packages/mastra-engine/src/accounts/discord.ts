import type { Agent } from '@mastra/core/agent';
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';

import { accountDeliveries } from '../agent/communication/account-deliveries';
import { agentAccounts } from '../agent/communication/agent-accounts';
import { agentContacts } from '../agent/communication/agent-contacts';
import { messageStore } from '../agent/communication/message-store';
import type { AgentWakeQueue } from '../agent/wake-queue';
import { forgeDebug } from '../debug';

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
  const discordAccountId = await agentAccounts.ensureAccount({
    agentId,
    provider: 'discord',
    externalAccountId: discordUserId,
    displayName: client.user.tag,
  });

  accountDeliveries.register(discordAccountId, async (input) => {
    if (!input.target || !/^\d+$/.test(input.target)) {
      throw new Error(`Unsupported Discord target: ${input.target}`);
    }

    if (input.contactSlug && !input.replyToMessageId) {
      const user = await client.users.fetch(input.target);
      const channel = await user.createDM();
      await channel.sendTyping();
      const sent = await channel.send(input.content);
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
      return { messageId: sent.id, channelId: sent.channelId };
    }

    const sent = await channel.send(input.content);
    return { messageId: sent.id, channelId: sent.channelId };
  });

  client.on(Events.MessageCreate, async (message) => {
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
      const content = message.content
        .replaceAll(`<@${discordUserId}>`, '')
        .replaceAll(`<@!${discordUserId}>`, '')
        .trim();
      await agentContacts.syncInboundContact({
        agentId,
        provider: 'discord',
        authorId: message.author.id,
        authorName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
        username: message.author.username,
      });

      await messageStore.saveInboundMessage({
        agentId,
        accountId: discordAccountId,
        messageId: message.id,
        channelId: message.channelId,
        channelName:
          message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel',
        authorId: message.author.id,
        authorName:
          message.member?.displayName ?? message.author.globalName ?? message.author.username,
        username: message.author.username,
        content: content || '[no text content]',
        attachments: Array.from(message.attachments.values()).map((attachment) => ({
          id: attachment.id,
          name: attachment.name ?? undefined,
          url: attachment.url,
          contentType: attachment.contentType ?? undefined,
          sizeBytes: attachment.size,
          description: attachment.description ?? undefined,
        })),
        createdAt: new Date(message.createdTimestamp).toISOString(),
        metadata: {
          serverName: message.guild?.name ?? 'direct-message',
        },
      });

      forgeDebug('discord', 'message registered', {
        agentId,
        channelId: message.channelId,
        messageId: message.id,
      });

      config.wakeQueue.notifyExternalEvent();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[forge:discord] agent execution failed', error);
      await message.reply(`Erro ao executar o agente: ${errorMessage}`);
    }
  });

  console.log(`[discord] logged in as ${client.user.tag}`);
  return client;
}
