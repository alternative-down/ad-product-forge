import { ChannelType, type Message } from 'discord.js';

import type { ExternalAttachment, ExternalEvent } from '../../domain/external-event';

function getAuthorDisplayName(message: Message<boolean>): string {
  return message.member?.displayName ?? message.author.globalName ?? message.author.username;
}

function getChannelDisplayName(message: Message<boolean>): string {
  if (message.channel.type === ChannelType.DM) {
    return 'direct-message';
  }

  return message.channel.name ?? 'unknown-channel';
}

function normalizeAttachments(message: Message<boolean>): ExternalAttachment[] {
  return Array.from(message.attachments.values()).map((attachment) => ({
    id: attachment.id,
    name: attachment.name ?? undefined,
    url: attachment.url,
    contentType: attachment.contentType ?? undefined,
    sizeBytes: attachment.size,
    description: attachment.description ?? undefined,
  }));
}

export function normalizeDiscordMessage(
  message: Message<boolean>,
  botUserId: string,
): ExternalEvent {
  const content = message.content
    .replaceAll(`<@${botUserId}>`, '')
    .replaceAll(`<@!${botUserId}>`, '')
    .trim();

  return {
    eventId: message.id,
    provider: 'discord',
    externalAccountId: message.client.user?.id,
    channelId: message.channelId,
    channelName: getChannelDisplayName(message),
    conversationId: message.channelId,
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
