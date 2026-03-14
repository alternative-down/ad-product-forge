import type { Agent } from '@mastra/core/agent';
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type SendableChannels,
} from 'discord.js';

import { messageStore } from '../agent/message-store';
import { forgeDebug } from '../debug';
import type { AgentWakeQueue } from '../agent/wake-queue';

export type DiscordAgentClientConfig = {
  agent: Agent;
  token: string;
  wakeQueue: AgentWakeQueue;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
  agentId?: string;
};

function shouldRespond(
  message: Message<boolean>,
  botUserId: string,
  allowedChannelIds: Set<string>,
  respondToMentionsOnly: boolean,
): boolean {
  if (message.author.bot) return false;
  if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) return false;
  if (message.channel.type === ChannelType.DM) return true;
  if (respondToMentionsOnly) return message.mentions.users.has(botUserId);
  return true;
}

async function sendDiscordTyping(channel: SendableChannels) {
  await channel.sendTyping();
  await new Promise((resolve) => setTimeout(resolve, 700));
}

export async function createDiscordAgentClient(config: DiscordAgentClientConfig) {
  const allowedChannelIds = new Set(config.allowedChannelIds ?? []);
  const respondToMentionsOnly = config.respondToMentionsOnly ?? true;
  const agentId = config.agentId ?? config.agent.id;
  let resolveReady!: (accountId: string) => void;
  const ready = new Promise<string>((resolve) => {
    resolveReady = resolve;
  });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[discord] logged in as ${readyClient.user.tag}`);

    const accountId = await messageStore.ensureAccount({
      agentId,
      provider: 'discord',
      externalAccountId: readyClient.user.id,
      displayName: readyClient.user.tag,
    });

    messageStore.registerAccountSender(accountId, async (input) => {
      const target = input.target;
      if (!target || !/^\d+$/.test(target)) {
        throw new Error(`Unsupported Discord target: ${target}`);
      }

      if (input.contactSlug && !input.replyToMessageId) {
        const user = await client.users.fetch(target);
        const dmChannel = await user.createDM();
        await sendDiscordTyping(dmChannel);
        const sent = await dmChannel.send(input.content);
        return { messageId: sent.id, channelId: dmChannel.id };
      }

      const targetChannel = await client.channels.fetch(target);
      if (!targetChannel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${target}`);
      }

      await sendDiscordTyping(targetChannel);

      if (input.replyToMessageId && 'messages' in targetChannel) {
        const replyTarget = await targetChannel.messages.fetch(input.replyToMessageId);
        const sent = await replyTarget.reply(input.content);
        return { messageId: sent.id, channelId: sent.channelId };
      }

      const sent = await targetChannel.send(input.content);
      return { messageId: sent.id, channelId: sent.channelId };
    });

    resolveReady(accountId);
  });

  client.on(Events.MessageCreate, async (message) => {
    const botUserId = client.user?.id;
    if (!botUserId) return;
    if (!shouldRespond(message, botUserId, allowedChannelIds, respondToMentionsOnly)) {
      forgeDebug('discord', 'message ignored', {
        channelId: message.channelId,
        authorId: message.author.id,
        isBot: message.author.bot,
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
        message.channel.type === ChannelType.DM
          ? 'direct-message'
          : (message.channel.name ?? 'unknown-channel');

      forgeDebug('discord', 'message accepted', {
        channelId: message.channelId,
        authorId: message.author.id,
        authorName,
        agentId,
      });

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
        channelId: message.channelId,
        messageId: message.id,
        agentId,
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
