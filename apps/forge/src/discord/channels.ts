import { parseFilterDate } from '../communication/filter-helpers';
import {
  ChannelType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Message,
  Partials,
} from 'discord.js';
import { errorMsg } from '../agents/error-formatting';
import {
  DiscordTargetNotSendableError,
  DiscordUserNotFoundError,
} from './errors';

import { forgeDebug } from '@forge-runtime/core';
import type { DiscordSendableChannel } from '../discord-types';
import { downloadDiscordAttachments, extractDiscordMessageContent } from './message-parser';

/**
 * Module-local debug helper. Centralizes the discord-account scope
 * so call sites only specify the level, message, and context.
 */
function discordAccountDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  forgeDebug({ scope: 'discord-account', level, message, context });
}


const MEMBER_FETCH_LIMIT = 100;

export type ChannelFetchResult = {
  channels: DiscordSendableChannel[];
  failed: Array<{ channelId: string; error: string }>;
};

export function createDiscordClient(_token: string) {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
}

function __waitForReady(client: Client) {
  return new Promise<void>((resolve) => {
    if (client.isReady()) {
      resolve();
      return;
    }
    client.once(Events.ClientReady, () => resolve());
  });
}

export async function listCandidateChannels(
  client: Client,
  configuredChannels: Map<string, boolean>,
  readyPromise?: Promise<unknown>,
): Promise<ChannelFetchResult> {
  if (readyPromise) {
    await readyPromise;
  }
  const channelIds = new Set<string>(configuredChannels.keys());

  for (const channel of client.channels.cache.values()) {
    if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
      channelIds.add(channel.id);
    }
  }

  const channels: DiscordSendableChannel[] = [];
  const failed: Array<{ channelId: string; error: string }> = [];

  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);

      if (channel?.isTextBased() === false || !channel.isSendable()) {
        continue;
      }

      channels.push(channel as DiscordSendableChannel);
    } catch (error) {
      const errMsg = errorMsg(error);
      discordAccountDebug('error', 'Failed to fetch channel', { channelId, error: errMsg });
      failed.push({ channelId, error: errMsg });
    }
  }

  if (failed.length > 0) {
    discordAccountDebug('error', 'listCandidateChannels: some channels failed to fetch', { failedCount: failed.length, totalRequested: channelIds.size });
  }

  return { channels, failed };
}

export async function resolveDiscordTargetChannel(
  client: Client,
  targetKey: string,
  getReadyClient: () => Promise<import('discord.js').ClientUser>,
  loadCandidateUsers: () => Promise<Array<{ username: string; createDM: () => Promise<DiscordSendableChannel> }>>,
) {
  await getReadyClient();

  if (/^\d+$/.test(targetKey)) {
    try {
      const channel = await client.channels.fetch(targetKey);

      if (channel?.isSendable() === false) {
        throw new DiscordTargetNotSendableError(targetKey);
      }

      return channel as DiscordSendableChannel;
    } catch (error) {
      discordAccountDebug('error', 'Failed to fetch Discord channel by ID', { targetKey, error: errorMsg(error) });
      throw error;
    }
  }

  const candidateUsers = await loadCandidateUsers();
  const matchedUser = candidateUsers.find((user) => user.username === targetKey);

  if (!matchedUser) {
    throw new DiscordUserNotFoundError(targetKey);
  }

  try {
    const channel = await matchedUser.createDM();
    return channel as DiscordSendableChannel;
  } catch (error) {
    discordAccountDebug('error', 'Failed to create DM with user', { targetKey, error: errorMsg(error) });
    throw error;
  }
}

export async function listChannelMessages(input: {
  channel: DiscordSendableChannel;
  limit: number;
  offset: number;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const parsedDateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
  const parsedDateTo = parseFilterDate(input.dateTo, 'dateTo');
  const queryFilter = input.query ?? '';
  const matchesMessage = (message: Message) => {
    const passesQuery =
      queryFilter === ''
        ? true
        : message.content.includes(queryFilter);
    return (
      passesQuery &&
      (parsedDateFrom === null || message.createdTimestamp >= parsedDateFrom) &&
      (parsedDateTo === null || message.createdTimestamp <= parsedDateTo)
    );
  };
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
      discordAccountDebug('error', 'listChannelMessages: failed to fetch message batch', { channelId: input.channel.id, error: errorMsg(error) });
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
      content: extractDiscordMessageContent(message) || '[attachment only]',
      attachments: await downloadDiscordAttachments(message),
      unread: false,
      createdAt: new Date(message.createdTimestamp).toISOString(),
      authorDisplayName:
        message.member?.displayName ?? message.author.globalName ?? message.author.username,
    })),
  );
}