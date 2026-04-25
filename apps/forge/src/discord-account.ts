import { ChannelType, Client, Collection, Events, GatewayIntentBits, Message, Partials, User } from 'discord.js';

import type { CommunicationFile, CommunicationInboundMessage, CommunicationProvider } from '@forge-runtime/core';

type DiscordSendableChannel = {
  id: string;
  name?: string | null;
  sendTyping(): Promise<unknown>;
  send(input: string | { content?: string; files?: Array<{ attachment: Buffer; name: string }> }): Promise<Message>;
  messages: {
    fetch(messageId: string): Promise<Message>;
    fetch(options: { limit: number; before?: string }): Promise<Collection<string, Message>>;
  };
};

type DiscordOutboundFile = {
  attachment: Buffer;
  name: string;
};

export function createDiscordProvider(config: {
  token: string;
  channels?: Array<{
    channelId: string;
    channelName?: string;
    respondToMentionsOnly: boolean;
  }>;
}): CommunicationProvider {
  const OUTBOUND_ECHO_TTL_MS = 2 * 60_000;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });
  const configuredChannels = new Map(
    (config.channels ?? []).map((channel) => [channel.channelId, channel.respondToMentionsOnly]),
  );
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];
  const recentOutboundMessages = new Map<string, Array<{ content: string; createdAt: number }>>();
  let disposed = false;

  function pruneRecentOutboundMessages(now: number) {
    for (const [conversationKey, messages] of recentOutboundMessages.entries()) {
      const visibleMessages = messages.filter((message) => now - message.createdAt <= OUTBOUND_ECHO_TTL_MS);

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
      if (paragraph.length <= 2_000) {
        const nextChunk = chunks[chunks.length - 1];

        if (!nextChunk) {
          chunks.push(paragraph);
          continue;
        }

        const separator = nextChunk.length === 0 ? '' : '\n\n';
        if (nextChunk.length + separator.length + paragraph.length <= 2_000) {
          chunks[chunks.length - 1] = `${nextChunk}${separator}${paragraph}`;
          continue;
        }

        chunks.push(paragraph);
        continue;
      }

      let remainingParagraph = paragraph;

      while (remainingParagraph.length > 2_000) {
        const slice = remainingParagraph.slice(0, 2_000);
        const breakIndex = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
        const chunkEnd = breakIndex >= 1_500 ? breakIndex : 2_000;
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
    if (!value) {
      return null;
    }

    const parsed = Date.parse(value);

    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }

    return parsed;
  }

  async function downloadDiscordAttachments(message: Message): Promise<CommunicationFile[]> {
    return Promise.all(
      Array.from(message.attachments.values()).map(async (attachment) => {
        const response = await fetch(attachment.url);

        if (!response.ok) {
          throw new Error(`Failed to download Discord attachment: ${attachment.url}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        return {
          name: attachment.name ?? attachment.id,
          data: new Uint8Array(arrayBuffer),
          contentType: attachment.contentType ?? undefined,
          sizeBytes: attachment.size,
        };
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
    }, 8_000);

    try {
      return await run();
    } finally {
      clearInterval(typingTimer);
    }
  }

  async function toInboundMessage(message: Message, botUserId: string): Promise<CommunicationInboundMessage | null> {
    console.log('[discord] DEBUG: MessageCreate event - author:', message.author.id, 'bot:', botUserId, 'channelType:', message.channel.type, 'DM:', ChannelType.DM, 'channelId:', message.channelId);
    console.log('[discord] DEBUG: configuredChannels.size:', configuredChannels.size, 'hasChannel:', configuredChannels.has(message.channelId));

    // Ignore messages from the bot itself
    if (message.author.id === botUserId) {
      console.log('[discord] DEBUG: filtering - message from bot itself');
      return null;
    }

    // Allow DMs through regardless of configured guild channels
    if (message.channel.type !== ChannelType.DM) {
      if (configuredChannels.size > 0 && !configuredChannels.has(message.channelId)) {
        console.log('[discord] DEBUG: filtering - guild channel not in configuredChannels');
        return null;
      }
    }

    if (
      message.channel.type !== ChannelType.DM &&
      configuredChannels.get(message.channelId) === true &&
      !message.mentions.users.has(botUserId)
    ) {
      console.log('[discord] DEBUG: filtering - guild channel requires mention but no mention');
      return null;
    }

    const authorDisplayName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
    const content = extractDiscordMessageContent(message, botUserId);

    if (!content && message.attachments.size === 0) {
      console.log('[discord] DEBUG: filtering - empty content and no attachments');
      return null;
    }

    if (isRecentOutboundEcho(message.channelId, content, message.createdTimestamp)) {
      console.log('[discord] DEBUG: filtering - recent outbound echo');
      return null;
    }

    console.log('[discord] DEBUG: message accepted, returning inbound message');

    return {
      targetKey: message.channelId,
      messageId: message.id,
      conversationName: getDiscordConversationName(message.channel, authorDisplayName),
      authorId: message.author.id,
      authorDisplayName,
      authorUsername: message.author.username,
      content: content || '[attachment only]',
      attachments: await downloadDiscordAttachments(message),
      createdAt: new Date(message.createdTimestamp).toISOString(),
      metadata: {
        serverName: message.guild?.name ?? 'direct-message',
      },
    };
  }

  async function deliverMessage(message: CommunicationInboundMessage) {
    console.log('[discord] DEBUG: deliverMessage called, onInboundMessage:', onInboundMessage ? 'set' : 'null, pendingMessages:', pendingMessages.length);
    if (!onInboundMessage) {
      pendingMessages.push(message);
      console.log('[discord] DEBUG: pushed to pendingMessages, total:', pendingMessages.length);
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

  const ready = client.login(config.token).then(() => {
    if (!client.user) {
      throw new Error('Discord client did not become ready after login');
    }

    client.on(Events.MessageCreate, async (message) => {
      if (disposed) {
        return;
      }

      console.log('[discord] DEBUG: MessageCreate event received - author:', message.author.username, 'channel:', message.channelId);

      try {
        const inboundMessage = await toInboundMessage(message, client.user!.id);

        if (!inboundMessage) {
          console.log('[discord] DEBUG: toInboundMessage returned null');
          return;
        }

        console.log('[discord] DEBUG: calling deliverMessage');
        await deliverMessage(inboundMessage);
        console.log('[discord] DEBUG: deliverMessage completed');
      } catch (error) {
        console.error('[discord] Error handling MessageCreate event:', error);
      }
    });

    console.log(`[discord] logged in as ${client.user.tag}`);
    return client.user;
  });

  async function getReadyClient() {
    return ready;
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
      const channel = await client.channels.fetch(channelId);

      if (!channel?.isTextBased() || !channel.isSendable()) {
        continue;
      }

      channels.push(channel as DiscordSendableChannel);
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
        console.warn(`[discord] Failed to fetch members for guild ${guild.id}:`, error);
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
      const channel = await client.channels.fetch(targetKey);

      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${targetKey}`);
      }

      return channel as DiscordSendableChannel;
    }

    const candidateUsers = await loadCandidateUsers();
    const matchedUser = candidateUsers.find((user) => user.username === targetKey);

    if (!matchedUser) {
      throw new Error(`Discord user not found: ${targetKey}`);
    }

    const channel = await matchedUser.createDM();
    return channel as DiscordSendableChannel;
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
      (!input.query || message.content.includes(input.query) || message.attachments.size > 0) &&
      (parsedDateFrom === null || message.createdTimestamp >= parsedDateFrom) &&
      (parsedDateTo === null || message.createdTimestamp <= parsedDateTo);
    const targetCount = input.limit + input.offset;
    const collected = new Collection<string, Message>();
    let before: string | undefined;

    while (collected.size < targetCount) {
      const batch = await input.channel.messages.fetch({
        limit: Math.min(100, targetCount - collected.size),
        ...(before ? { before } : {}),
      });

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

    return Promise.all(
      filteredMessages.map(async (message) => ({
        messageId: message.id,
        provider: 'discord',
        authorId: message.author.id,
        targetKey: input.channel.id,
        content: extractDiscordMessageContent(message) || '[attachment only]',
        attachments: await downloadDiscordAttachments(message),
        unread: false,
        createdAt: new Date(message.createdTimestamp).toISOString(),
        authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
      })),
    );
  }

  return {
    id: 'discord',
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async dispose() {
      disposed = true;
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
      return listCandidateUsers();
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

      if (!channel?.isTextBased() || !channel.isSendable()) {
        throw new Error(`Discord target is not readable: ${targetKey}`);
      }

      return listChannelMessages({
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

      return withTyping(channel, async () => {
        const sent = await sendDiscordChunks({
          channel: channel as DiscordSendableChannel,
          content: input.content,
          attachments: input.attachments,
        });

        return {
          targetKey: sent.channelId,
          messageId: sent.id,
          conversationName: 'name' in channel ? channel.name ?? undefined : undefined,
        };
      });
    },
  };
}

function extractDiscordMessageContent(message: Message, botUserId?: string) {
  const textContent = (botUserId
    ? message.content
      .replaceAll(`<@${botUserId}>`, '')
      .replaceAll(`<@!${botUserId}>`, '')
    : message.content)
    .trim();

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
        .filter((value) => value && value.length > 0)
        .join('\n'),
    )
    .filter((value) => value.length > 0)
    .join('\n\n');

  return [textContent, embedContent]
    .filter((value) => value.length > 0)
    .join('\n\n');
}

function getDiscordConversationName(
  channel: unknown,
  fallbackName?: string,
) {
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
      (recipient && 'globalName' in recipient && typeof recipient.globalName === 'string' ? recipient.globalName : null)
      ?? (recipient && 'username' in recipient && typeof recipient.username === 'string' ? recipient.username : null)
      ?? fallbackName
      ?? 'direct-message'
    );
  }

  if (typeof channel === 'object' && channel !== null && 'name' in channel && typeof channel.name === 'string') {
    return channel.name;
  }

  return 'unknown-channel';
}

function getDiscordConversationParticipants(channel: unknown, messages: Array<{ authorDisplayName?: string }>) {
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
    if (message.authorDisplayName) {
      participants.add(message.authorDisplayName);
    }
  }

  return [...participants];
}
