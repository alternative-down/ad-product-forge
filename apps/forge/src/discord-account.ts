import { ChannelType, Client, Events, GatewayIntentBits, Message, Partials } from 'discord.js';

import type { CommunicationInboundMessage, CommunicationProvider } from '@mastra-engine/core';

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

  async function withTyping<T extends { sendTyping(): Promise<unknown> }>(
    channel: T,
    run: () => Promise<{
      providerConversationKey: string;
      providerMessageId?: string;
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
      providerConversationKey: message.channelId,
      providerMessageId: message.id,
      conversationName:
        message.channel.type === ChannelType.DM ? 'direct-message' : message.channel.name ?? 'unknown-channel',
      authorExternalId: message.author.id,
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

  return {
    id: 'discord',
    async getAccount() {
      const user = await getReadyClient();

      return {
        externalAccountId: user.id,
        displayName: user.tag,
      };
    },
    onMessage(callback) {
      onInboundMessage = callback;
      void flushPendingMessages();
    },
    async sendMessage(input) {
      await getReadyClient();

      if (input.contactExternalId && !input.providerConversationKey) {
        const targetUser = await client.users.fetch(input.contactExternalId);
        const channel = await targetUser.createDM();

        return withTyping(channel, async () => {
          const sent = await channel.send(input.content);
          rememberOutboundMessage(channel.id, input.content);

          return {
            providerConversationKey: channel.id,
            providerMessageId: sent.id,
            conversationName: 'direct-message',
          };
        });
      }

      if (!input.providerConversationKey || !/^\d+$/.test(input.providerConversationKey)) {
        throw new Error(`Unsupported Discord conversation: ${input.providerConversationKey}`);
      }

      const channel = await client.channels.fetch(input.providerConversationKey);

      if (!channel?.isSendable()) {
        throw new Error(`Discord target is not sendable: ${input.providerConversationKey}`);
      }

      return withTyping(channel, async () => {
        if (input.replyToProviderMessageId) {
          const replyTarget = await channel.messages.fetch(input.replyToProviderMessageId);
          const sent = await replyTarget.reply(input.content);
          rememberOutboundMessage(sent.channelId, input.content);

          return {
            providerConversationKey: sent.channelId,
            providerMessageId: sent.id,
            conversationName: 'name' in channel ? channel.name ?? undefined : undefined,
          };
        }

        const sent = await channel.send(input.content);
        rememberOutboundMessage(sent.channelId, input.content);

        return {
          providerConversationKey: sent.channelId,
          providerMessageId: sent.id,
          conversationName: 'name' in channel ? channel.name ?? undefined : undefined,
        };
      });
    },
  };
}
