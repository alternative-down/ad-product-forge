import type { Agent } from '@mastra/core/agent';
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';

import { messageStore } from '../agent/message-store';
import type { AgentWakeQueue } from '../agent/wake-queue';
import { forgeDebug } from '../debug';

export type DiscordAgentClientConfig = {
  agent: Agent;
  token: string;
  wakeQueue: AgentWakeQueue;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
  agentId?: string;
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
  const allowedChannelIds = new Set(config.allowedChannelIds ?? []);
  const respondToMentionsOnly = config.respondToMentionsOnly ?? true;
  const agentId = config.agentId ?? config.agent.id;
  let resolveReady: (accountId: string) => void = () => {};
  const ready = new Promise<string>((resolve) => {
    resolveReady = resolve;
  });

  client.once(Events.ClientReady, async (readyClient) => {
    const accountId = await messageStore.ensureAccount({
      agentId,
      provider: 'discord',
      externalAccountId: readyClient.user.id,
      displayName: readyClient.user.tag,
    });

    messageStore.registerAccountSender(accountId, async (input) => {
      if (!input.target || !/^\d+$/.test(input.target)) {
        throw new Error(`Unsupported Discord target: ${input.target}`);
      }

      if (input.contactSlug && !input.replyToMessageId) {
        const user = await client.users.fetch(input.target);
        const dmChannel = await user.createDM();
        await dmChannel.sendTyping();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const sent = await dmChannel.send(input.content);
        return { messageId: sent.id, channelId: dmChannel.id };
      }

      const channel = await client.channels.fetch(input.target);
      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${input.target}`);
      }

      await channel.sendTyping();
      await new Promise((resolve) => setTimeout(resolve, 700));

      if (input.replyToMessageId && 'messages' in channel) {
        const replyTarget = await channel.messages.fetch(input.replyToMessageId);
        const sent = await replyTarget.reply(input.content);
        return { messageId: sent.id, channelId: sent.channelId };
      }

      const sent = await channel.send(input.content);
      return { messageId: sent.id, channelId: sent.channelId };
    });

    console.log(`[discord] logged in as ${readyClient.user.tag}`);
    resolveReady(accountId);
  });

  client.on(Events.MessageCreate, async (message) => {
    const botUserId = client.user?.id;

    if (!botUserId) {
      return;
    }

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
      !message.mentions.users.has(botUserId)
    ) {
      forgeDebug('discord', 'message ignored', {
        channelId: message.channelId,
        authorId: message.author.id,
        reason: 'mention required',
      });
      return;
    }

    try {
      const accountId = await ready;
      const content = message.content
        .replaceAll(`<@${botUserId}>`, '')
        .replaceAll(`<@!${botUserId}>`, '')
        .trim();
      const attachments = Array.from(message.attachments.values()).map((attachment) => ({
        id: attachment.id,
        name: attachment.name ?? undefined,
        url: attachment.url,
        contentType: attachment.contentType ?? undefined,
        sizeBytes: attachment.size,
        description: attachment.description ?? undefined,
      }));
      const authorName =
        message.member?.displayName ?? message.author.globalName ?? message.author.username;
      const channelName =
        message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel';

      await messageStore.ingestInboundMessage({
        agentId,
        accountId,
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

  await client.login(config.token);
  return client;
}
