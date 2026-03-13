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
  ensureAccount,
  ingestInboundMessage,
  registerAccountSender,
} from '../accounts/account-service';
import { forgeDebug } from '../debug';
import { normalizeDiscordMessage } from '../integrations/discord/normalizer';
import { getAgentWakeQueue } from '../wake/agent-wake-queue';

export type DiscordAgentClientConfig = {
  agent: Agent;
  token: string;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
  agentId?: string;
  agentName?: string;
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
  let accountId: string | null = null;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
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

    accountId = await ensureAccount({
      agentId,
      provider: 'discord',
      externalAccountId: readyClient.user.id,
      displayName: readyClient.user.tag,
    });

    registerAccountSender(accountId, async (input) => {
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

    resolveReady();
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
      await ready;
      if (!accountId) {
        throw new Error('Discord account is not ready');
      }

      const event = normalizeDiscordMessage(message, botUserId);
      forgeDebug('discord', 'message accepted', {
        channelId: message.channelId,
        authorId: message.author.id,
        authorName: event.sender.displayName,
        agentId,
      });

      await ingestInboundMessage({
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
