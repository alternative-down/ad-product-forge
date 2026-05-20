import {
  ChannelType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Message,
  Partials,
  User,
} from 'discord.js';

import { forgeDebug } from '@forge-runtime/core';

import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProvider,
} from '@forge-runtime/core';

import type { DiscordSendableChannel, DiscordOutboundFile } from './discord-types';

export function createDiscordProvider(config: {
  token: string;
  channels?: Array<{
    channelId: string;
    channelName?: string;
    respondToMentionsOnly: boolean;
  }>;
}): CommunicationProvider {
  const OUTBOUND_ECHO_TTL_MS = 2 * 60_000;
  const MAX_MESSAGE_LENGTH = 2_000;
  const CHUNK_BREAKPOINT = 1_500;
  const TYPING_INDICATOR_INTERVAL_MS = 8_000;
  const MEMBER_FETCH_LIMIT = 100;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
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

  function splitDiscordMessageContent(content: string) {
    const chunks: string[] = [];
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return [''];
    }

    for (const paragraph of normalizedContent.split('\n\n')) {
      if (paragraph.length <= MAX_MESSAGE_LENGTH) {
        const nextChunk = chunks[chunks.length - 1];

        if (!nextChunk) {
          chunks.push(paragraph);
          continue;
        }

        const separator = nextChunk.length === 0 ? '' : '\n\n';
        if (nextChunk.length + separator.length + paragraph.length <= MAX_MESSAGE_LENGTH) {
          chunks[chunks.length - 1] = `${nextChunk}${separator}${paragraph}`;
          continue;
        }

        chunks.push(paragraph);
        continue;
      }

      let remainingParagraph = paragraph;

      while (remainingParagraph.length > MAX_MESSAGE_LENGTH) {
        const slice = remainingParagraph.slice(0, MAX_MESSAGE_LENGTH);
        const breakIndex = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
        const chunkEnd = breakIndex >= CHUNK_BREAKPOINT ? breakIndex : MAX_MESSAGE_LENGTH;
        chunks.push(remainingParagraph.slice(0, chunkEnd).trim());
        remainingParagraph = remainingParagraph.slice(chunkEnd).trim();
      }

      if (remainingParagraph.length > 0) {
        chunks.push(remainingParagraph);
      }
    }

    return chunks;
  }

  function parseFilterDate(value: string | undefined, fieldName: string) {
    if ((value ?? '') === '') {
      return null;
    }

    const parsed = Date.parse(value ?? '');

    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }

    return parsed;
  }

  async function downloadDiscordAttachments(message: Message): Promise<CommunicationFile[]> {
    return await Promise.all(
      Array.from(message.attachments.values()).map(async (attachment) => {
        try {
          const response = await fetch(attachment.url);

          if (!response.ok) {
            const error = new Error(
              `Failed to download Discord attachment: ${attachment.url} (HTTP ${response.status})`,
            );
            forgeDebug({
              scope: 'discord-account',
              level: 'error',
              message: 'downloadAttachment: failed',
              context: { url: attachment.url, status: response.status, error: error.message },
            });
            throw error;
          }

          const arrayBuffer = await response.arrayBuffer();

          return {
            name: attachment.name ?? attachment.id,
            data: new Uint8Array(arrayBuffer),
            contentType: attachment.contentType ?? undefined,
            sizeBytes: attachment.size,
          };
        } catch (error) {
          forgeDebug({
            scope: 'discord-account',
            level: 'warn',
            message: 'Failed to download Discord attachment',
            context: {
              attachmentUrl: attachment.url,
              attachmentId: attachment.id,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          return {
            name: attachment.name ?? attachment.id,
            data: new Uint8Array(0),
            contentType: undefined,
            sizeBytes: 0,
          };
        }
      }),
    );
  }

  function toDiscordOutboundFiles(attachments: CommunicationFile[]): DiscordOutboundFile[] {
    return attachments.map((attachment) => ({
      attachment: Buffer.from(attachment.data),
      name: attachment.name,
    }));
  }

  async function sendDiscordChunks(input: {
    channel: DiscordSendableChannel;
    content: string;
    attachments: CommunicationFile[];
  }) {
    const messageChunks = splitDiscordMessageContent(input.content);
    let lastSentMessage: Message | null = null;
    const outboundFiles = toDiscordOutboundFiles(input.attachments);

    try {
      for (const [index, chunk] of messageChunks.entries()) {
        if (index === 0) {
          lastSentMessage = await input.channel.send({
            content: chunk,
            ...(outboundFiles.length > 0 ? { files: outboundFiles } : {}),
          });
        } else {
          lastSentMessage = await input.channel.send(chunk);
        }

        rememberOutboundMessage(lastSentMessage.channelId, chunk);
      }
    } catch (error) {
      forgeDebug({
        scope: 'discord-account',
        level: 'error',
        message: 'sendDiscordChunks failed',
        context: {
          channelId: input.channel.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    if (!lastSentMessage) {
      throw new Error('Discord message content produced no chunks to send');
    }

    return lastSentMessage;
  }

  async function withTyping<T extends { sendTyping(): Promise<unknown> }>(
    channel: T,
    run: () => Promise<{
      targetKey: string;
      messageId?: string;
      conversationName?: string;
    }>,
  ) {
    await channel.sendTyping();

    const typingTimer = setInterval(() => {
      void channel.sendTyping();
    }, TYPING_INDICATOR_INTERVAL_MS);
    pendingTypingTimers.add(typingTimer);

    try {
      return await run();
    } finally {
      clearInterval(typingTimer);
      pendingTypingTimers.delete(typingTimer);
    }
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

    // Ignore messages from the bot itself
    if (message.author.id === botUserId) {
      forgeDebug({
        scope: 'discord-account',
        level: 'info',
        message: 'filtered: message from bot',
      });
      return null;
    }

    // Allow DMs through regardless of configured guild channels
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
          context: { error: error instanceof Error ? error.message : String(error) },
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

  async function listCandidateChannels() {
    await getReadyClient();
    const channelIds = new Set<string>(configuredChannels.keys());

    for (const channel of client.channels.cache.values()) {
      if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
        channelIds.add(channel.id);
      }
    }

    const channels: DiscordSendableChannel[] = [];

    for (const channelId of channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (channel?.isTextBased() === false || !channel.isSendable()) {
          continue;
        }

        channels.push(channel as DiscordSendableChannel);
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'warn',
          message: 'Failed to fetch channel',
          context: { channelId, error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    return channels;
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
          context: {
            guildId: guild.id,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    const channels = await listCandidateChannels();

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
  async function resolveDiscordTargetChannel(targetKey: string) {
    await getReadyClient();

    if (/^\d+$/.test(targetKey)) {
      try {
        const channel = await client.channels.fetch(targetKey);

        if (channel?.isSendable() === false) {
          throw new Error(`Discord target is not sendable: ${targetKey}`);
        }

        return channel as DiscordSendableChannel;
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'error',
          message: 'Failed to fetch Discord channel by ID',
          context: { targetKey, error: error instanceof Error ? error.message : String(error) },
        });
        throw error;
      }
    }

    const candidateUsers = await loadCandidateUsers();
    const matchedUser = candidateUsers.find((user) => user.username === targetKey);

    if (!matchedUser) {
      throw new Error(`Discord user not found: ${targetKey}`);
    }

    try {
      const channel = await matchedUser.createDM();
      return channel as DiscordSendableChannel;
    } catch (error) {
      forgeDebug({
        scope: 'discord-account',
        level: 'error',
        message: 'Failed to create DM with user',
        context: { targetKey, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async function listChannelMessages(input: {
    channel: DiscordSendableChannel;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const parsedDateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const parsedDateTo = parseFilterDate(input.dateTo, 'dateTo');
    const matchesMessage = (message: Message) =>
      ((input.query ?? '') !== '' ||
        message.content.includes(input.query ?? '') ||
        message.attachments.size > 0) &&
      (parsedDateFrom === null || message.createdTimestamp >= parsedDateFrom) &&
      (parsedDateTo === null || message.createdTimestamp <= parsedDateTo);
    const targetCount = input.limit + input.offset;
    const collected = new Collection<string, Message>();
    let before: string | undefined;

    while (collected.size < targetCount) {
      let batch;
      try {
        batch = await input.channel.messages.fetch({
          limit: Math.min(MEMBER_FETCH_LIMIT, targetCount - collected.size),
          ...((before ?? '') !== '' ? { before } : {}),
        });
      } catch (error) {
        forgeDebug({
          scope: 'discord-account',
          level: 'error',
          message: 'listChannelMessages: failed to fetch message batch',
          context: {
            channelId: input.channel.id,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        break;
      }

      if (batch.size === 0) {
        break;
      }

      for (const [messageId, message] of batch) {
        collected.set(messageId, message);
      }

      const oldestMessage = Array.from(batch.values()).at(-1);

      if (!oldestMessage) {
        break;
      }

      before = oldestMessage.id;
    }

    const sortedMessages = Array.from(collected.values())
      .filter(matchesMessage)
      .sort((left, right) => left.createdTimestamp - right.createdTimestamp);
    const filteredMessages = sortedMessages.slice(
      Math.max(0, sortedMessages.length - targetCount),
      input.offset > 0 ? sortedMessages.length - input.offset : undefined,
    );

    return await Promise.all(
      filteredMessages.map(async (message) => ({
        messageId: message.id,
        provider: 'discord',
        authorId: message.author.id,
        targetKey: input.channel.id,
        content: extractDiscordMessageContent(message) ?? '[attachment only]',
        attachments: await downloadDiscordAttachments(message),
        unread: false,
        createdAt: new Date(message.createdTimestamp).toISOString(),
        authorDisplayName:
          message.member?.displayName ?? message.author.globalName ?? message.author.username,
      })),
    );
  }

  return {
    id: 'discord',
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    dispose() {
      disposed = true;
      for (const timer of pendingTypingTimers) clearInterval(timer);
      pendingTypingTimers.clear();
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
      const channels = await listCandidateChannels();
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

      if (channel?.isTextBased() === false || channel?.isSendable() === false) {
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
      const channel = await resolveDiscordTargetChannel(input.targetKey);

      return await withTyping(channel, async () => {
        const sent = await sendDiscordChunks({
          channel: channel as DiscordSendableChannel,
          content: input.content,
          attachments: input.attachments,
        });

        return {
          targetKey: sent.channelId,
          messageId: sent.id,
          conversationName: 'name' in channel ? (channel.name ?? undefined) : undefined,
        };
      });
    },
  };
}

function extractDiscordMessageContent(message: Message, botUserId?: string) {
  const textContent = (
    (botUserId ?? '') !== ''
      ? message.content.replaceAll(`<@${botUserId}>`, '').replaceAll(`<@!${botUserId}>`, '')
      : message.content
  ).trim();

  const embedContent = message.embeds
    .map((embed) =>
      [
        embed.title?.trim(),
        embed.description?.trim(),
        embed.fields
          .map((field) => `${field.name}: ${field.value}`.trim())
          .filter(Boolean)
          .join('\n'),
        embed.footer?.text?.trim(),
        embed.url?.trim(),
      ]
        .filter((value) => value !== undefined && value !== null && value.length > 0)
        .join('\n'),
    )
    .filter((value) => value.length > 0)
    .join('\n\n');

  return [textContent, embedContent].filter((value) => value.length > 0).join('\n\n');
}

function getDiscordConversationName(channel: unknown, fallbackName?: string) {
  if (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    channel.type === ChannelType.DM
  ) {
    const recipient =
      'recipient' in channel && typeof channel.recipient === 'object' && channel.recipient !== null
        ? channel.recipient
        : null;

    return (
      (recipient && 'globalName' in recipient && typeof recipient.globalName === 'string'
        ? recipient.globalName
        : null) ??
      (recipient && 'username' in recipient && typeof recipient.username === 'string'
        ? recipient.username
        : null) ??
      fallbackName ??
      'direct-message'
    );
  }

  if (
    typeof channel === 'object' &&
    channel !== null &&
    'name' in channel &&
    typeof channel.name === 'string'
  ) {
    return channel.name;
  }

  return 'unknown-channel';
}

function getDiscordConversationParticipants(
  channel: unknown,
  messages: Array<{ authorDisplayName?: string }>,
) {
  const participants = new Set<string>();

  if (
    typeof channel === 'object' &&
    channel !== null &&
    'recipients' in channel &&
    Array.isArray(channel.recipients)
  ) {
    for (const recipient of channel.recipients) {
      if (typeof recipient !== 'object' || recipient === null) {
        continue;
      }

      if ('globalName' in recipient && typeof recipient.globalName === 'string') {
        participants.add(recipient.globalName);
        continue;
      }

      if ('username' in recipient && typeof recipient.username === 'string') {
        participants.add(recipient.username);
      }
    }
  }

  for (const message of messages) {
    if (message.authorDisplayName !== undefined && message.authorDisplayName !== '') {
      participants.add(message.authorDisplayName);
    }
  }

  return [...participants];
}
