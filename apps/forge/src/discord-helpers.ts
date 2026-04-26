import { ChannelType, Message } from 'discord.js';

/**
 * Helper functions for Discord message handling
 */

export function extractDiscordMessageContent(message: Message, botUserId?: string) {
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

export function getDiscordConversationName(
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

export function getDiscordConversationParticipants(channel: unknown, messages: Array<{ authorDisplayName?: string }>) {
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
