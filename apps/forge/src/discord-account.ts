import {
  ChannelType,
  Events,
  Message,
  User,
} from 'discord.js';

import { forgeDebug } from '@forge-runtime/core';

import type {
  CommunicationInboundMessage,
  CommunicationProvider,
} from '@forge-runtime/core';

import type { DiscordSendableChannel } from './discord-types';
import {
  createDiscordClient,
  listCandidateChannels,
  resolveDiscordTargetChannel,
  listChannelMessages,
} from './discord/channels';
import { withTyping, clearTypingTimers } from './discord/typing';
import { sendDiscordChunks } from './discord/outbound';
import { downloadDiscordAttachments, extractDiscordMessageContent } from './discord/message-parser';
import { getDiscordConversationName, getDiscordConversationParticipants } from './discord/helpers';

export function createDiscordProvider(config: {
  token: string;
  channels?: Array<{
    channelId: string;
    channelName?: string;
    respondToMentionsOnly: boolean;
  }>;
}): CommunicationProvider {
  const OUTBOUND_ECHO_TTL_MS = 2 * 60_000;
  const client = createDiscordClient(config.token);
  const configuredChannels = new Map(
    (config.channels ?? []).map((channel) => [channel.channelId, channel.respondToMentionsOnly]),
  );
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];
  const recentOutboundMessages = new Map<string, Array<{ content: string; createdAt: number }>>();
  let disposed = false;
  const pendingTypingTimers = new Set<NodeJS.Timeout>();

  function pruneRecentOutboundMessages(now: number) {
    for (const [conversationKey, messages] of recentOutboundMessages.entries()) {
      const visibleMessages = messages.filter(
        (message) => now - message.createdAt <= OUTBOUND_ECHO_TTL_MS,
      );

      if (visibleMessages.length === 0) {
        recentOutboundMessages.delete(conversationKey);
        continue;
      }

      recentOutboundMessages.set(conversationKey, visibleMessages);
    }
  }

  function rememberOutboundMessage(conversationKey: string, content: string) {
    const now = Date.now();
    pruneRecentOutboundMessages(now);
    const messages = recentOutboundMessages.get(conversationKey) ?? [];
    messages.push({ content: content.trim(), createdAt: now });
    recentOutboundMessages.set(conversationKey, messages);
  }

  function isRecentOutboundEcho(conversationKey: string, content: string, createdAt: number) {
    pruneRecentOutboundMessages(createdAt);
    const messages = recentOutboundMessages.get(conversationKey) ?? [];

    return messages.some((message) => message.content === content);
  }

  async function toInboundMessage(
    message: Message,
    botUserId: string,
  ): Promise<CommunicationInboundMessage | null> {
    forgeDebug({
      scope: 'discord-account',
      level: 'info',
      message: 'MessageCreate received',
      context: {
        authorId: message.author.id,
        botUserId,
        channelType: message.channel.type,
        channelId: message.channelId,
      },
    });
    forgeDebug({
      scope: 'discord-account',
      level: 'info',
      message: 'configuredChannels check',
      context: {
        size: configuredChannels.size,
        hasChannel: configuredChannels.has(message.channelId),
      },
    });

    if (message.author.id === botUserId) {
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'filtered: message from bot',
      });
      return null;
    }

    if (message.channel.type !== ChannelType.DM) {
      if (configuredChannels.size > 0 && !configuredChannels.has(message.channelId)) {
        forgeDebug({
          scope: 'discord-account',
          level: 'info',
          message: 'filtered: guild channel not in configuredChannels',
        });
        return null;
      }
    }

    if (
      message.channel.type !== ChannelType.DM &&
      configuredChannels.get(message.channelId) === true &&
      !message.mentions.users.has(botUserId)
    ) {
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'filtered: guild channel requires mention but no mention',
      });
      return null;
    }

    const authorDisplayName =
      message.member?.displayName ?? message.author.globalName ?? message.author.username;
    const content = extractDiscordMessageContent(message, botUserId);

    if (!content && message.attachments.size === 0) {
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'filtered: empty content and no attachments',
      });
      return null;
    }

    if (isRecentOutboundEcho(message.channelId, content, message.createdTimestamp)) {
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'filtered: recent outbound echo',
      });
      return null;
    }

    forgeDebug({ scope: 'discord-account', level: 'info', message: 'message accepted' });

    return {
      targetKey: message.channelId,
      messageId: message.id,
      conversationName: getDiscordConversationName(message.channel, authorDisplayName),
      authorId: message.author.id,
      authorDisplayName,
      authorUsername: message.author.username,
      content: content ?? '[attachment only]',
      attachments: await downloadDiscordAttachments(message),
      createdAt: new Date(message.createdTimestamp).toISOString(),
      metadata: {
        serverName: message.guild?.name ?? 'direct-message',
      },
    };
  }

  async function deliverMessage(message: CommunicationInboundMessage) {
    forgeDebug({
      scope: 'discord-account',
      level: 'info',
      message: 'deliverMessage called',
      context: { onInboundMessage: !!onInboundMessage, pendingCount: pendingMessages.length },
    });
    if (!onInboundMessage) {
      pendingMessages.push(message);
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'pushed to pendingMessages',
        context: { total: pendingMessages.length },
      });
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

  forgeDebug({ scope: 'discord-account', level: 'info', message: 'Starting login' });

  const ready = client.login(config.token).then(() => {
    forgeDebug({ scope: 'discord-account', level: 'info', message: 'Login succeeded' });
    if (!client.user) {
      throw new Error('Discord client did not become ready after login');
    }

    client.on(Events.MessageCreate, async (message) => {
      if (disposed) {
        return;
      }

      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'MessageCreate received',
        context: {
          author: message.author.username,
          channelType: message.channel.type,
          guildId: message.guildId,
        },
      });

      try {
        const inboundMessage = await toInboundMessage(message, client.user!.id);

        if (!inboundMessage) {
          forgeDebug({
            scope: 'discord-account',
            level: 'info',
            message: 'toInboundMessage returned null',
          });
          return;
        }

        forgeDebug({ scope: 'discord-account', level: 'info', message: 'calling deliverMessage' });
        await deliverMessage(inboundMessage);
        forgeDebug({
          scope: 'discord-account',
          level: 'info',
          message: 'deliverMessage completed',
        });
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'error',
          message: 'Error handling MessageCreate event',
          context: { error: String(serializeError(error)) },
        });
      }
    });

    forgeDebug({
      scope: 'discord-account',
      level: 'info',
      message: 'logged in',
      context: { tag: client.user.tag },
    });

    return client.user;
  });

  async function getReadyClient() {
    return await ready;
  }

  async function loadCandidateUsers() {
    await getReadyClient();
    const users = new Map<string, User>();

    const rememberUser = (user: User | null | undefined) => {
      if (!user || user.bot || !user.username) {
        return;
      }

      users.set(user.username, user);
    };

    for (const guild of client.guilds.cache.values()) {
      try {
        const members = await guild.members.fetch();

        for (const member of members.values()) {
          rememberUser(member.user);
        }
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'warn',
          message: 'Failed to fetch members for guild',
          context: { guildId: guild.id, error: String(serializeError(error)) },
        });
      }
    }

    const channels = await listCandidateChannels(client, configuredChannels, getReadyClient());

    for (const channel of channels) {
      if ('recipient' in channel && channel.recipient instanceof User) {
        rememberUser(channel.recipient);
      }
    }

    return [...users.values()].sort((left, right) => left.username.localeCompare(right.username));
  }

  async function listCandidateUsers() {
    const users = await loadCandidateUsers();

    return users
      .sort((left, right) => left.username.localeCompare(right.username))
      .map((user) => ({
        slug: user.username,
        displayName: user.globalName ?? user.username,
        description: `@${user.username}`,
      }));
  }

  return {
    id: 'discord',
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    dispose() {
      disposed = true;
      clearTypingTimers(pendingTypingTimers);
      onInboundMessage = null;
      pendingMessages.length = 0;
      recentOutboundMessages.clear();
      client.removeAllListeners();
      client.destroy();
    },
    async getSelfContact() {
      const currentUser = await getReadyClient();

      return {
        targetKey: currentUser.username,
        slug: currentUser.username,
        displayName: currentUser.globalName ?? currentUser.username,
        description: `@${currentUser.username}`,
      };
    },
    async listContacts() {
      return await listCandidateUsers();
    },
    async listConversations({ limit }) {
      const channels = await listCandidateChannels(client, configuredChannels, getReadyClient());
      const conversations = [];

      for (const channel of channels) {
        const messages = await listChannelMessages({ channel, limit: 5, offset: 0 });

        if (messages.length === 0) {
          continue;
        }

        const latestMessage = messages[messages.length - 1];
        conversations.push({
          provider: 'discord',
          targetKey: channel.id,
          latestMessageAt: latestMessage.createdAt,
          unreadCount: 0,
          name: getDiscordConversationName(channel, latestMessage.authorDisplayName),
          participants: getDiscordConversationParticipants(channel, messages),
          messages,
        });
      }

      return conversations
        .sort((left, right) => Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt))
        .slice(0, limit);
    },
    async getMessages({ targetKey, limit, offset, query, dateFrom, dateTo }) {
      await getReadyClient();
      const channel = await client.channels.fetch(targetKey);

      if (channel === null || channel?.isTextBased() === false || channel?.isSendable() === false) {
        forgeDebug({
          scope: 'discord-account',
          level: 'error',
          message: 'getMessages discord target not readable',
          context: { targetKey },
        });
        throw new Error(`Discord target is not readable: ${targetKey}`);
      }

      return await listChannelMessages({
        channel: channel as DiscordSendableChannel,
        limit,
        offset,
        query,
        dateFrom,
        dateTo,
      });
    },
    async sendMessage(input) {
      const channel = await resolveDiscordTargetChannel(
        client,
        input.targetKey,
        getReadyClient,
        loadCandidateUsers,
      );

      return await withTyping(
        channel,
        async () => {
          const sent = await sendDiscordChunks({
            channel: channel as DiscordSendableChannel,
            content: input.content,
            attachments: input.attachments,
            rememberOutboundMessage,
          });

          return {
            targetKey: sent.channelId,
            messageId: sent.id,
            conversationName: 'name' in channel ? (channel.name ?? undefined) : undefined,
          };
        },
        pendingTypingTimers,
      );
    },
  };
}

import { serializeError } from './agents/agent-runner-error-formatting';