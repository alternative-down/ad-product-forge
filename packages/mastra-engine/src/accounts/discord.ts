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

import {
  messageStore,
} from '../agent/message-store';
import { forgeDebug } from '../debug';
import { getAgentWakeQueue } from '../agent/wake-queue';

export type DiscordAgentClientConfig = {
  agent: Agent;
  token: string;
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

type DiscordAttachment = {
  id?: string;
  name?: string;
  url: string;
  contentType?: string;
  sizeBytes?: number;
  description?: string;
};

type DiscordInboundEvent = {
  eventId: string;
  channelId?: string;
  channelName?: string;
  sender: {
    externalUserId: string;
    displayName?: string;
    username?: string;
  };
  content: string;
  attachments?: DiscordAttachment[];
  receivedAt: Date;
  metadata?: Record<string, unknown>;
};

function getAuthorDisplayName(message: Message<boolean>) {
  return message.member?.displayName ?? message.author.globalName ?? message.author.username;
}

function getChannelDisplayName(message: Message<boolean>) {
  if (message.channel.type === ChannelType.DM) {
    return 'direct-message';
  }

  return message.channel.name ?? 'unknown-channel';
}

function normalizeAttachments(message: Message<boolean>): DiscordAttachment[] {
  return Array.from(message.attachments.values()).map((attachment) => ({
    id: attachment.id,
    name: attachment.name ?? undefined,
    url: attachment.url,
    contentType: attachment.contentType ?? undefined,
    sizeBytes: attachment.size,
    description: attachment.description ?? undefined,
  }));
}

function normalizeDiscordMessage(message: Message<boolean>, botUserId: string): DiscordInboundEvent {
  const content = message.content
    .replaceAll(`<@${botUserId}>`, '')
    .replaceAll(`<@!${botUserId}>`, '')
    .trim();

  return {
    eventId: message.id,
    channelId: message.channelId,
    channelName: getChannelDisplayName(message),
    sender: {
      externalUserId: message.author.id,
      displayName: getAuthorDisplayName(message),
      username: message.author.username,
    },
    content: content || '[no text content]',
    attachments: normalizeAttachments(message),
    receivedAt: new Date(message.createdTimestamp),
    metadata: {
      serverName: message.guild?.name ?? 'direct-message',
    },
  };
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
  const wakeQueue = getAgentWakeQueue({
    agentId,
    agent: config.agent,
    onWakeStarted: () => {
      forgeDebug('discord', 'agent wake started', { agentId });
    },
    onWakeFinished: () => {
      forgeDebug('discord', 'agent wake finished', { agentId });
    },
    onWakeError: (error) => {
      console.error('[forge:discord] agent wake failed', error);
    },
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

      const event = normalizeDiscordMessage(message, botUserId);
      forgeDebug('discord', 'message accepted', {
        channelId: message.channelId,
        authorId: message.author.id,
        authorName: event.sender.displayName,
        agentId,
      });

      await messageStore.ingestInboundMessage({
        agentId,
        accountId,
        messageId: event.eventId,
        channelId: event.channelId,
        channelName: event.channelName,
        authorId: event.sender.externalUserId,
        authorName: event.sender.displayName,
        username: event.sender.username,
        content: event.content,
        attachments: event.attachments ?? [],
        createdAt: event.receivedAt.toISOString(),
        metadata: event.metadata,
      });
      forgeDebug('discord', 'message registered', {
        channelId: message.channelId,
        messageId: event.eventId,
        agentId,
      });

      wakeQueue.notifyExternalEvent();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[forge:discord] agent execution failed', error);
      await message.reply(`Erro ao executar o agente: ${errorMessage}`);
    }
  });

  await client.login(config.token);
  return client;
}
