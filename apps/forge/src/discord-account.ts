import { ChannelType, Client, Collection, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import type { CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

type DiscordSendableChannel = {
  id: string;
  name?: string | null;
  sendTyping(): Promise<unknown>;
  send(content: string): Promise<Message>;
  messages: {
    fetch(messageId: string): Promise<Message>;
    fetch(options: { limit: number }): Promise<Collection<string, Message>>;
  };
};

export function createDiscordProvider(config: {
  token: string;
  allowedChannelIds?: string[];
  respondToMentionsOnly?: boolean;
}): CommunicationProvider {
  const OUTBOUND_ECHO_TTL_MS = 2 * 60_000;
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
  let onInboundMessage: ((message: CommunicationInboundMessage) => Promise<void>) | null = null;
  const pendingMessages: CommunicationInboundMessage[] = [];
  const recentOutboundMessages = new Map<string, Array<{ content: string; createdAt: number }>>();

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

  async function sendDiscordChunks(input: {
    channel: DiscordSendableChannel;
    content: string;
    replyToProviderMessageId?: string;
  }) {
    const messageChunks = splitDiscordMessageContent(input.content);
    let lastSentMessage: Message | null = null;

    for (const [index, chunk] of messageChunks.entries()) {
      if (index === 0 && input.replyToProviderMessageId) {
        const replyTarget = await input.channel.messages.fetch(input.replyToProviderMessageId);
        lastSentMessage = await replyTarget.reply(chunk);
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
    // Ignore messages from the bot itself
    if (message.author.id === botUserId) {
      return null;
    }

    if (allowedChannelIds.size > 0 && !allowedChannelIds.has(message.channelId)) {
      return null;
    }

    if (
      message.channel.type !== ChannelType.DM &&
      respondToMentionsOnly &&
      !message.mentions.users.has(botUserId)
    ) {
      return null;
    }

    const authorDisplayName = message.member?.displayName ?? message.author.globalName ?? message.author.username;
    const textContent = message.content
      .replaceAll(`<@${botUserId}>`, '')
      .replaceAll(`<@!${botUserId}>`, '')
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

    const content = [textContent, embedContent]
      .filter((value) => value.length > 0)
      .join('\n\n');

    if (!content && message.attachments.size === 0) {
      return null;
    }

    if (isRecentOutboundEcho(message.channelId, content, message.createdTimestamp)) {
      return null;
    }

    const attachments = Array.from(message.attachments.values()).map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      url: attachment.url,
      contentType: attachment.contentType ?? undefined,
      sizeBytes: attachment.size,
      description: attachment.description ?? undefined,
    }));

    return {
      targetKey: message.channelId,
      messageId: message.id,
      conversationName:
        message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel',
      authorId: message.author.id,
      authorDisplayName,
      authorUsername: message.author.username,
      content: content || '[attachment only]',
      attachments,
      createdAt: new Date(message.createdTimestamp).toISOString(),
      metadata: {
        serverName: message.guild?.name ?? 'direct-message',
      },
    };
  }

  async function deliverMessage(message: CommunicationInboundMessage) {
    if (!onInboundMessage) {
      pendingMessages.push(message);
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
      const callback = onInboundMessage;

      if (!callback) {
        return;
      }

      try {
        const inboundMessage = await toInboundMessage(message, client.user!.id);

        if (!inboundMessage) {
          return;
        }

        await deliverMessage(inboundMessage);
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
    const channelIds = new Set<string>(allowedChannelIds);

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

  async function listChannelMessages(channel: DiscordSendableChannel, limit: number) {
    const messages = await channel.messages.fetch({ limit });

    return Array.from(messages.values())
      .filter((message) => !message.author.bot || message.author.id === client.user?.id)
      .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
      .map((message) => ({
        messageId: message.id,
        provider: 'discord',
        authorId: message.author.id,
        targetKey: channel.id,
        content: message.content.trim() || '[attachment only]',
        attachments: Array.from(message.attachments.values()).map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          contentType: attachment.contentType ?? undefined,
          sizeBytes: attachment.size,
          description: attachment.description ?? undefined,
        })),
        unread: false,
        createdAt: new Date(message.createdTimestamp).toISOString(),
        authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
      }));
  }

  return {
    id: 'discord',
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async listConversations({ limit }) {
      const channels = await listCandidateChannels();
      const conversations = [];

      for (const channel of channels) {
        const messages = await listChannelMessages(channel, 5);

        if (messages.length === 0) {
          continue;
        }

        const latestMessage = messages[messages.length - 1];
        conversations.push({
          provider: 'discord',
          targetKey: channel.id,
          latestMessageAt: latestMessage.createdAt,
          unreadCount: 0,
          name: 'name' in channel ? channel.name ?? undefined : 'direct-message',
          participants: [],
          messages,
        });
      }

      return conversations
        .sort((left, right) => Date.parse(right.latestMessageAt) - Date.parse(left.latestMessageAt))
        .slice(0, limit);
    },
    async getMessages({ targetKey, limit }) {
      await getReadyClient();
      const channel = await client.channels.fetch(targetKey);

      if (!channel?.isTextBased() || !channel.isSendable()) {
        throw new Error(`Discord target is not readable: ${targetKey}`);
      }

      return listChannelMessages(channel as DiscordSendableChannel, limit);
    },
    async sendMessage(input) {
      await getReadyClient();

      if (!/^\d+$/.test(input.targetKey)) {
        throw new Error(`Unsupported Discord targetKey: ${input.targetKey}`);
      }

      const channel = await client.channels.fetch(input.targetKey);

      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${input.targetKey}`);
      }

      return withTyping(channel, async () => {
        const sent = await sendDiscordChunks({
          channel: channel as DiscordSendableChannel,
          content: input.content,
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
